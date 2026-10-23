#!/usr/bin/env python
"""cosyworker.py — ИНФЕРЕНС-ШИМ CosyVoice (единственный python пайплайна).

Роль (миграция python -> TS, см. AGENTS.md «Миграция python → TypeScript»):
python остаётся ТОЛЬКО из-за torch — модель CV3 в node не запустить.
Всё после инференса переехало на TS: оркестрация — voice_batch.mts,
ретрай/trim/кодирование — voicekit/{worker,trim,audio}.mts.
Шим больше НЕ пишет файлов: ни ffmpeg, ни trim, ни wav/opus.

Модель грузится ОДИН раз на процесс; TS-клиент (voicekit/worker.mts) шлёт
задания по JSON-lines (stdin/stdout, без портов).

ПРОТОКОЛ v2 (stdout — только JSON-ответы, логи — в stderr):
  -> {"id": 1, "cmd": "ping"}
  <- {"id": 1, "ok": true, "device": "cuda ...", "model_loaded": true}
  -> {"id": 2, "cmd": "gen", "text": "...", "ref": "C:/.../X.wav",
      "emotion": "..."|null, "seed": 42}
  <- {"id": 2, "ok": true, "pcm_b64": "...", "sr": 24000, "raw_dur": 6.6}
     или {"id": 2, "ok": false, "error": "..."}
  -> {"cmd": "quit"}  -> ответ {"ok": true}, процесс завершается (код 0)

pcm_b64 — СЫРОЙ PCM тензора: float32 LE mono, sr = sample_rate модели.
Дальше всё на TS (worker.mts.generate): trim хвостовых артефактов
(voicekit/trim.mts) -> loudnorm + libopus 24k c явным -ar sr
(voicekit/audio.mts) -> .part -> rename. Ретрай холодного фронтенда
(TextEncodeInput) тоже на TS-стороне — шим просто отдаёт ok:false.

ЗАПУСК (TS-клиент сам спавнит):
  C:\\tools\\cosyvoice3\\.venv\\Scripts\\python.exe cosyworker.py --device cuda
"""

import argparse
import base64
import json
import logging
import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from voicekit import config as _cfg  # noqa: E402
from voicekit import tts_env  # noqa: E402

REPO_DIR = tts_env.cosy_repo_dir()
sys.path.insert(0, REPO_DIR)
sys.path.insert(0, os.path.join(REPO_DIR, 'third_party', 'Matcha-TTS'))

import numpy as np  # noqa: E402
import torch  # noqa: E402
from cosyvoice.cli.cosyvoice import AutoModel  # noqa: E402
from cosyvoice.utils.common import set_all_random_seed  # noqa: E402

from voicekit.cv3 import (CV3_PREFIX, patch_flow_temperature,  # noqa: E402
                          patch_silent_token_trim, prep_ref)

_B = _cfg.section('batch')
FLOW_TEMP = float(_B.get('flow_temp', 0.8))
CFG_RATE = float(_B.get('cfg_rate', 0.7))
_smp = _B.get('sampling', [0.8, 25.0, 0.1])
SAMPLING = (float(_smp[0]), float(_smp[1]), float(_smp[2]))
DEFAULT_SEED = int(_B.get('seed', 42))


def elog(msg):
    """Лог в stderr (stdout зарезервирован под протокол)."""
    print(msg, file=sys.stderr, flush=True)


def respond(obj):
    """Один JSON-ответ в stdout."""
    sys.stdout.write(json.dumps(obj, ensure_ascii=False) + '\n')
    sys.stdout.flush()


def silence_benign_warnings():
    """Глушим безвредный warning transformers про sliding window."""
    for name in ('transformers', 'transformers.modeling_utils',
                 'transformers.models.qwen2.modeling_qwen2'):
        logging.getLogger(name).setLevel(logging.CRITICAL)


class Worker:
    """Модель + обработчики команд протокола (инференс, без аудио-цепочки)."""

    def __init__(self, args):
        self.args = args
        self.model = None
        self.sample_rate = None
        self.model_dir = None

    def load_model(self):
        """Однократная загрузка AutoModel (вызывается до входа в цикл)."""
        from voicekit.model_dir import ensure_model_yaml, make_tuned_model_dir
        a = self.args
        self.model_dir = make_tuned_model_dir(a.top_p, a.top_k, a.tau_r,
                                              rl=True, cfg_rate=a.cfg_rate)
        elog('model: {}'.format(self.model_dir))
        if ensure_model_yaml(self.model_dir, a.top_p, a.top_k, a.tau_r,
                             cfg_rate=a.cfg_rate):
            elog('WARN: cosyvoice3.yaml был сломан — восстановлен из базовой модели')
        silence_benign_warnings()
        if a.device == 'cuda' and not torch.cuda.is_available():
            elog('ERROR: --device cuda запрошен, но torch.cuda.is_available()=False '
                 '(torch без CUDA-сборки? нужен torch с cu128+, см. AGENTS.md)')
            sys.exit(1)
        t0 = time.time()
        self.model = AutoModel(model_dir=self.model_dir,
                               fp16=(a.device == 'cuda'))
        patch_flow_temperature(a.flow_temp)
        patch_silent_token_trim()
        self.sample_rate = self.model.sample_rate
        dev = 'cpu'
        if a.device == 'cuda':
            dev = 'cuda ({}, {:.0f} ГБ)'.format(
                torch.cuda.get_device_name(0),
                torch.cuda.get_device_properties(0).total_memory / 2**30)
        elog('model loaded in {:.1f}s (flow-temp {}, cfg {}, RAS {}, '
             'silent-trim ON, device {})'.format(
                 time.time() - t0, a.flow_temp, a.cfg_rate,
                 (a.top_p, a.top_k, a.tau_r), dev))

    def gen_one(self, text, ref, seed, emotion):
        """Одна фраза: реф + текст -> тензор речи.

        emotion — стилевая инструкция: instruct2-режим (инструкция отдельным
        аргументом); без неё — cross_lingual (тот же промпт-формат).
        Ошибки НЕ перехватываются: холодный фронтенд (TextEncodeInput)
        отдаётся наверх как ok:false — повтором владеет worker.mts."""
        prepped = prep_ref(ref)
        set_all_random_seed(seed)
        if emotion:
            # формат байт-в-байт как в voice_batch.py (проверенный звук)
            instruct = 'You are a helpful assistant. {}.<|endofprompt|>'.format(
                emotion)
            gen = self.model.inference_instruct2(
                text, instruct, prepped, stream=False, speed=1.0,
                text_frontend=False)
        else:
            gen = self.model.inference_cross_lingual(
                CV3_PREFIX + text, prepped, stream=False, speed=1.0,
                text_frontend=False)
        for j in gen:
            return j['tts_speech']

    def cmd_ping(self, req):
        dev = 'cpu'
        if self.args.device == 'cuda' and torch.cuda.is_available():
            dev = 'cuda ({})'.format(torch.cuda.get_device_name(0))
        return {'ok': True, 'device': dev, 'model_loaded': self.model is not None}

    def cmd_gen(self, req):
        """Генерация одной фразы -> сырой PCM base64. Fail-soft -> ok:false."""
        text = req.get('text')
        ref = req.get('ref')
        if not text or not ref:
            return {'ok': False, 'error': 'нет text/ref в запросе'}
        if not os.path.exists(ref):
            return {'ok': False, 'error': 'реф не существует: {}'.format(ref)}
        seed = int(req.get('seed', DEFAULT_SEED))
        emotion = req.get('emotion') or None
        t0 = time.time()
        try:
            speech = self.gen_one(text, ref, seed, emotion)
            sr = int(self.sample_rate)
            arr = speech.detach().to('cpu').float().numpy()
            if arr.ndim == 2:
                if arr.shape[0] != 1:
                    return {'ok': False,
                            'error': 'мультиканальный выход не ожидаем: shape {}'.format(arr.shape)}
                arr = arr[0]
            elif arr.ndim != 1:
                return {'ok': False, 'error': 'неожиданная размерность: ndim {}'.format(arr.ndim)}
            if arr.size == 0:
                return {'ok': False, 'error': 'модель вернула пустой тензор'}
            arr = np.ascontiguousarray(arr, dtype='<f4')
            pcm = arr.tobytes()
            dur = arr.size / sr
            elog('  pcm {:.2f}s (gen {:.1f}s)'.format(dur, time.time() - t0))
            return {'ok': True,
                    'pcm_b64': base64.b64encode(pcm).decode('ascii'),
                    'sr': sr,
                    'raw_dur': round(dur, 2)}
        except Exception as e:
            elog('  !! FAIL: {!r}'.format(e))
            return {'ok': False, 'error': '{}: {}'.format(type(e).__name__, e)}

    def dispatch(self, req):
        """Маршрутизация одной команды (quit обрабатывается циклом)."""
        cmd = req.get('cmd')
        if cmd == 'ping':
            return self.cmd_ping(req)
        if cmd == 'gen':
            return self.cmd_gen(req)
        return {'ok': False, 'error': 'неизвестная команда: {!r}'.format(cmd)}


def main():
    ap = argparse.ArgumentParser(description='TSSR inference shim (CV3)')
    ap.add_argument('--device', default='cuda', choices=['cpu', 'cuda'],
                    help='устройство (default cuda)')
    ap.add_argument('--seed', type=int, default=DEFAULT_SEED)
    ap.add_argument('--top-p', type=float, default=SAMPLING[0])
    ap.add_argument('--top-k', type=int, default=SAMPLING[1])
    ap.add_argument('--tau-r', type=float, default=SAMPLING[2])
    ap.add_argument('--cfg-rate', type=float, default=CFG_RATE)
    ap.add_argument('--flow-temp', type=float, default=FLOW_TEMP)
    args = ap.parse_args()
    try:
        sys.stdout.reconfigure(encoding='utf-8', errors='replace')
        sys.stderr.reconfigure(encoding='utf-8', errors='replace')
        # stdin — тоже UTF-8: без этого (Windows/локаль cp1251) JSON от node
        # читался как мохибака — модель жевала мусор, отсюда runaway-длительности
        # (бага 2026-10-23). Очередь спасалась только PYTHONIOENCODING из
        # voice_queue.sh, прямые запуски voice_batch.mts — нет.
        sys.stdin.reconfigure(encoding='utf-8', errors='replace')
    except Exception:
        pass

    worker = Worker(args)
    worker.load_model()
    elog('worker: жду задания по stdin (JSON-lines)')

    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        try:
            req = json.loads(line)
        except Exception as e:
            respond({'ok': False, 'error': 'не-JSON во входе: {}'.format(e)})
            continue
        if req.get('cmd') == 'quit':
            respond({'ok': True})
            break
        resp = worker.dispatch(req)
        resp['id'] = req.get('id')
        respond(resp)

    elog('worker: quit, выхожу')
    return 0


if __name__ == '__main__':
    sys.exit(main())
