#!/usr/bin/env python
"""cosyworker.py — ИНФЕРЕНС-ШИМ CosyVoice (единственный python пайплайна).

Роль (tasks/2026-10-21-voice-pipeline-ts-migration.md): оркестрация пайплайна
на TS (.mts), python остаётся ТОЛЬКО здесь — torch в node невозможен.
Модель грузится ОДИН раз на процесс; TS-клиент (voicekit/worker.mts) шлёт
задания по JSON-lines (stdin/stdout, без портов).

ПРОТОКОЛ (stdout — только JSON-ответы, логи — в stderr):
  -> {"id": 1, "cmd": "ping"}
  <- {"id": 1, "ok": true, "device": "cuda ...", "model_loaded": true}
  -> {"id": 2, "cmd": "gen", "text": "...", "ref": "C:/.../X.wav",
      "emotion": "..."|null, "seed": 42, "out": "C:/.../uid__X.wav",
      "keep_wav": false}
  <- {"id": 2, "ok": true, "dur": 6.6, "saved": "C:/.../uid__X.opus"}
     или {"id": 2, "ok": false, "error": "..."}
  -> {"cmd": "quit"}  -> ответ {"ok": true}, процесс завершается (код 0)

Аудио-цепочка та же, что у voice_batch.py (проверена 2026-10-14/21):
тензор -> f32le pipe ffmpeg -> loudnorm -16 LUFS/TP -1.5 -> libopus 24k mono
-> .part -> атомарный rename; при сбое pipe — wav-фолбэк (levelnorm+конверт).

ЗАПУСК (TS-клиент сам спавнит):
  C:\\tools\\cosyvoice3\\.venv\\Scripts\\python.exe cosyworker.py --device cuda
"""

import argparse
import json
import logging
import os
import subprocess
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from voicekit import config as _cfg  # noqa: E402
from voicekit import paths, tts_env  # noqa: E402

REPO_DIR = tts_env.cosy_repo_dir()
sys.path.insert(0, REPO_DIR)
sys.path.insert(0, os.path.join(REPO_DIR, 'third_party', 'Matcha-TTS'))

import numpy as np  # noqa: E402
import torch  # noqa: E402
import torchaudio  # noqa: E402
from cosyvoice.cli.cosyvoice import AutoModel  # noqa: E402
from cosyvoice.utils.common import set_all_random_seed  # noqa: E402

from levelnorm import LOUD_ARGS, normalize_file  # noqa: E402
from trim_tail_burst import trim as pattern_trim  # noqa: E402
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


def wav_to_opus(wav_path):
    """Атомарная конвертация свежего wav -> opus 24k mono (рядом).

    Fail-soft: False -> вызывающая сторона оставляет wav-фолбэк (игра
    ищет opus -> wav). .part защищает от битого opus при обрыве."""
    opus = os.path.splitext(wav_path)[0] + '.opus'
    part = opus + '.part'
    try:
        r = subprocess.run(
            ['ffmpeg', '-y', '-loglevel', 'error', '-i', wav_path,
             '-c:a', 'libopus', '-b:a', '24k', '-ac', '1', '-f', 'opus', part],
            capture_output=True, timeout=120)
        if r.returncode == 0 and os.path.exists(part) and os.path.getsize(part) > 0:
            os.replace(part, opus)
            return True
        if os.path.exists(part):
            os.remove(part)
    except Exception:
        if os.path.exists(part):
            try:
                os.remove(part)
            except OSError:
                pass
    return False


def tensor_to_opus(tensor, sr, wav_path):
    """Тензор речи -> opus 24k mono ОДНИМ ffmpeg-проходом, без wav на диске.

    Тензор [1, N] float32 -> сырые f32le в stdin ffmpeg -> loudnorm (уровни
    из levelnorm.LOUD_ARGS — единый источник правды) -> libopus 24k mono
    -> .part -> атомарный os.replace в .opus. wav не создаётся.

    Эквивалентность старой цепочке проверена замером 2026-10-14
    (tasks/2026-10-14-direct-opus-generation-research.md): стадия loudnorm
    bit-identical для wav- и pipe-входа, декодированная длина совпадает,
    |dLUFS| <= 0.08 LU."""
    opus = os.path.splitext(wav_path)[0] + '.opus'
    part = opus + '.part'
    try:
        arr = tensor.detach().to('cpu').float().numpy()
        if arr.ndim == 2:
            if arr.shape[0] != 1:
                return False  # мультиканальный вход не ожидаем
            arr = arr[0]
        elif arr.ndim != 1:
            return False
        if arr.size == 0:
            return False
        arr = np.ascontiguousarray(arr, dtype='<f4')
        r = subprocess.run(
            ['ffmpeg', '-y', '-loglevel', 'error',
             '-f', 'f32le', '-ar', str(int(sr)), '-ac', '1', '-i', 'pipe:0',
             '-af', LOUD_ARGS,
             '-c:a', 'libopus', '-b:a', '24k', '-ac', '1', '-f', 'opus', part],
            input=arr.tobytes(), capture_output=True, timeout=120)
        if r.returncode == 0 and os.path.exists(part) and os.path.getsize(part) > 0:
            os.replace(part, opus)
            return True
        if os.path.exists(part):
            os.remove(part)
    except Exception:
        if os.path.exists(part):
            try:
                os.remove(part)
            except OSError:
                pass
    return False


def save_wav_chain(trimmed, sr, wav_path):
    """Старая цепочка (она же wav-фолбэк): wav -> levelnorm -> opus рядом."""
    torchaudio.save(wav_path, trimmed, sr,
                    encoding='PCM_S', bits_per_sample=16)
    try:
        normalize_file(wav_path)
    except Exception:
        pass
    if not wav_to_opus(wav_path):
        elog('  WARN: opus-конверт не удался, wav остаётся фолбэком')


class Worker:
    """Модель + обработчики команд протокола."""

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
        аргументом); без неё — cross_lingual (тот же промпт-формат)."""
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
        """Генерация одной фразы по запросу. Fail-soft: ошибка -> ok:false."""
        a = self.args
        text = req.get('text')
        ref = req.get('ref')
        out = req.get('out')
        if not text or not ref or not out:
            return {'ok': False, 'error': 'нет text/ref/out в запросе'}
        if not os.path.exists(ref):
            return {'ok': False, 'error': 'реф не существует: {}'.format(ref)}
        seed = int(req.get('seed', DEFAULT_SEED))
        emotion = req.get('emotion') or None
        keep_wav = bool(req.get('keep_wav', False))
        t0 = time.time()
        try:
            speech = self.gen_one(text, ref, seed, emotion)
            sr = self.sample_rate
            trimmed, cuts = pattern_trim(speech, sr)
            os.makedirs(os.path.dirname(out), exist_ok=True)
            dur = trimmed.shape[1] / sr
            if keep_wav:
                save_wav_chain(trimmed, sr, out)
                saved = out
            elif tensor_to_opus(trimmed, sr, out):
                saved = os.path.splitext(out)[0] + '.opus'
            else:
                elog('  WARN: pipe-конверт не удался — пишу wav-фолбэк')
                save_wav_chain(trimmed, sr, out)
                saved = out
            if cuts:
                elog('  trim: ' + ', '.join(
                    'burst {:.0f}ms after {:.0f}ms gap'.format(c['dur_ms'], c['gap_ms'])
                    for c in cuts))
            elog('  saved {} ({:.1f}s, gen {:.1f}s)'.format(saved, dur, time.time() - t0))
            return {'ok': True, 'dur': round(dur, 2), 'saved': saved}
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
