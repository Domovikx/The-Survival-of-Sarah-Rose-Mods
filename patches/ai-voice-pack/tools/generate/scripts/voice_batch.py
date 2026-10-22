#!/usr/bin/env python
"""Voice batch generator for TSSR (по мотивам W40KRT tools/cosyvoice3_batch.py).

ВХОД:
  - catalog/voices.jsonl    каталог реплик (uid, old, new, who, arc, category)
  - касты: озвучен = есть реф {Голос}.wav (иначе пропуск)

ВЫХОД:
  audio/vo_{lang}/{arc}/{uid}__{variant}.opus 24k mono   (resumable: существующие скипаются)
  + манифест рядом {uid}__{variant}.wav.txt (база .stem — путь исторический)
  wav на диск больше НЕ пишется (2026-10-14): тензор речи -> pipe f32le в ffmpeg,
  loudnorm -16 LUFS/TP -1.5 + libopus 24k ЗА ОДИН проход (см. tensor_to_opus).
  Fail-soft: pipe не удался -> пишется wav-фолбэк старой цепочкой (игра: opus -> wav).
  --keep-wav принудительно пишет wav, как раньше (старая цепочка levelnorm+конверт).

КОНФИГ (официальные параметры FunAudioLLM, 2026-09-03):
  cross_lingual + RL + flow-temp 0.8 + cfg 0.7 + RAS (0.8, 25, 0.1)
  + silent-token-trim ON + seed 42 + s16

ТРИМ: наш trim_tail_burst (паттерн «тишина → короткий всплеск у конца файла»).

Реф = casts/{Голос}/{Голос}.wav (правило); нет рефа = не озвучиваем.
--ref перезаписывает путь (для A/B по вариантам {Name}_{v}.wav).

ЗАПУСК (ОБЯЗАТЕЛЬНО через venv CosyVoice):
  C:\\tools\\cosyvoice3\\.venv\\Scripts\\python.exe tools/voice_batch.py \\
      [--arc Prologue] [--char Sarah] [--uid uid1 uid2 ...] [--limit N]
      [--force] [--lang ru|en] [--dry-run]

Лог прогона: output/voice/batch.log
"""

import argparse
import hashlib
import json
import logging
import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from voicekit import catalog, paths, tts_env  # noqa: E402

REPO_DIR = tts_env.cosy_repo_dir()
sys.path.insert(0, REPO_DIR)
sys.path.insert(0, os.path.join(REPO_DIR, 'third_party', 'Matcha-TTS'))
sys.path.insert(0, tts_env.W40K_TOOLS)
sys.path.insert(0, paths.SCRIPTS_DIR)

if any(a == '--device' and sys.argv[i + 1:i + 2] == ['dml']
       for i, a in enumerate(sys.argv[:-1])):
    os.environ['TSSR_DML'] = '1'

import numpy as np  # noqa: E402
import torch  # noqa: E402
import torchaudio  # noqa: E402
from cosyvoice.cli.cosyvoice import AutoModel  # noqa: E402
from cosyvoice.utils.common import set_all_random_seed  # noqa: E402

from cosyvoice3_demo import (CV3_PREFIX, prep_ref, patch_flow_temperature,  # noqa: E402
                             patch_silent_token_trim)
from trim_tail_burst import trim as pattern_trim  # noqa: E402

from voicekit import config as _cfg
from voicekit.model_dir import ensure_model_yaml, make_tuned_model_dir  # noqa: E402

_B = _cfg.section('batch')
FLOW_TEMP = float(_B.get('flow_temp', 0.8))
CFG_RATE = float(_B.get('cfg_rate', 0.7))
_smp = _B.get('sampling', [0.8, 25.0, 0.1])
SAMPLING = (float(_smp[0]), float(_smp[1]), float(_smp[2]))
DEFAULT_SEED = int(_B.get('seed', 42))
_pres = _B.get('instruct_presets', {})
INSTRUCT_PRESETS = {k: str(v) for k, v in _pres.items()}

LOG_PATH = paths.batch_log()


def log(msg):
    """Пишем строку в консоль и в лог прогона."""
    print(msg)
    try:
        os.makedirs(os.path.dirname(LOG_PATH), exist_ok=True)
        with open(LOG_PATH, 'a', encoding='utf-8') as f:
            f.write(time.strftime('%H:%M:%S ') + msg + '\n')
    except Exception:
        pass


def silence_benign_warnings():
    """Глушим безвредный warning transformers про sliding window."""
    for name in ('transformers', 'transformers.modeling_utils',
                 'transformers.models.qwen2.modeling_qwen2'):
        logging.getLogger(name).setLevel(logging.CRITICAL)


def load_inputs():
    """Каталог и конфиг голосов. Возвращает (entries, voices, who_to_voice)."""
    return (catalog.load_catalog()['entries'],
            catalog.load_voices(),
            catalog.who_to_voice())


_EMO_CACHE = None


def load_emotions():
    """catalog/emotions.json: {uid: emotion_en} (пофразовая разметка)."""
    global _EMO_CACHE
    if _EMO_CACHE is None:
        p = os.path.join(paths.CATALOG_DIR, 'emotions.json')
        if os.path.exists(p):
            try:
                with open(p, encoding='utf-8') as f:
                    _EMO_CACHE = json.load(f)
            except Exception:
                _EMO_CACHE = {}
        else:
            _EMO_CACHE = {}
    return _EMO_CACHE


def select_phrases(entries, voices, who_to_voice, args):
    """Фильтруем каталог до списка фраз к генерации.

    Критерии: категория dialogue/narration, у голоса есть реф {Name}.wav,
    фильтры args. Реф — по правилу (или --ref).
    --text переопределяет всё: одна фраза с произвольным текстом
    (uid = md5(text), arc = --arc or 'Demo').
    """
    if args.text:
        uid = hashlib.md5(args.text.encode('utf-8')).hexdigest()
        arc = args.arc or 'Demo'
        char = args.char or ''
        if args.ref:
            ref = os.path.abspath(args.ref)
            variant = os.path.splitext(os.path.basename(args.ref))[0]
        elif os.path.exists(paths.ref_active(char)):
            ref = paths.resolve_ref(paths.ref_voices(char))
            variant = char
        else:
            return []
        if args.emotion:
            variant += '_{}'.format(args.emotion_tag)
        out = os.path.join(paths.ai_voice_dir(args.lang),
                           arc, uid + '__' + variant + '.wav')
        return [dict(
            uid=uid, arc=arc, voice=args.char or 'Demo', ref=ref, out=out,
            variant=variant, lang=args.lang,
            text=args.text, text_old=args.text, text_new=args.text,
            emotion=(None if args.no_emotion else args.emotion),
            emotion_ru=args.emotion_ru,
        )]
    phrases = []
    for e in entries:
        cat = e['category']
        if cat not in ('dialogue', 'narration'):
            continue
        if cat == 'narration':
            voice = who_to_voice.get('narrator')
        else:
            voice = who_to_voice.get(e['who'])
        if voice is None:
            continue
        if args.arc and e['arc'] != args.arc:
            continue
        if getattr(args, 'scene', None) and e.get('scene') != args.scene:
            continue
        if args.char and (e['who_name'] or 'Narrator') != args.char:
            continue
        if args.uid and e['uid'] not in args.uid:
            continue
        if args.ref:
            ref = os.path.abspath(args.ref)
            variant = os.path.splitext(os.path.basename(args.ref))[0]
        elif os.path.exists(paths.ref_active(voice)):
            ref = paths.resolve_ref(paths.ref_voices(voice))
            variant = voice
        else:
            continue  # нет активного рефа {Name}.wav -> не озвучиваем
        if args.emotion:
            variant += '_{}'.format(args.emotion_tag)
        elif args.no_emotion:
            variant += '_plain'
        emo = (None if args.no_emotion
               else args.emotion or load_emotions().get(e['uid']))
        out = os.path.join(paths.ai_voice_dir(args.lang),
                           e['arc'], e['uid'] + '__' + variant + '.wav')
        phrases.append(dict(
            uid=e['uid'], arc=e['arc'], voice=voice, ref=ref, out=out,
            variant=variant, lang=args.lang,
            text=(e['new'] if args.lang == 'ru' else e['old']),
            text_old=e['old'], text_new=e['new'],
            emotion=emo, emotion_ru=args.emotion_ru,
        ))
    return phrases


def write_manifest(p, args):
    """Манифест рядом с wav: по какому рефу/конфигу сгенерировано.

    Пишется ДО генерации — файл-описание существует даже если генерация
    упадёт. Путь: {out}.txt (рядом с wav).
    """
    cfg_line = 'flow-temp {}, cfg {}, RAS {}, seed {}, silent-trim ON, speed 1.0'.format(
        args.flow_temp, args.cfg_rate, (args.top_p, args.top_k, args.tau_r),
        args.seed)
    lines = [
        '# TSSR voice manifest',
        'uid: {}'.format(p['uid']),
        'arc: {}'.format(p['arc']),
        'voice: {}'.format(p['voice']),
        'variant: {}'.format(p['variant']),
        'lang: {}'.format(p['lang']),
        'ref: {}'.format(os.path.relpath(p['ref'], paths.ROOT).replace(os.sep, '/')),
        'emotion: {}'.format(p['emotion'] or '-'),
        'emotion_ru: {}'.format(p.get('emotion_ru') or '-'),
        'text_ru: {}'.format(p['text_new']),
        'text_en: {}'.format(p['text_old']),
        'config: {}'.format(cfg_line),
        'generated: {}'.format(time.strftime('%Y-%m-%d %H:%M')),
    ]
    try:
        os.makedirs(os.path.dirname(p['out']), exist_ok=True)
        with open(p['out'] + '.txt', 'w', encoding='utf-8') as f:
            f.write('\n'.join(lines) + '\n')
    except Exception as e:
        log('  !! manifest fail: {}'.format(e))


def wav_to_opus(wav_path):
    """Атомарная конвертация свежего wav -> opus 24k mono (рядом).

    Вызывается после levelnorm: wav финальный. Fail-soft: при ошибке ffmpeg
    возвращает False, wav остаётся — игра возьмёт его фолбэком (voice_config.rpy
    ищет opus -> wav). .part защищает от битого opus при обрыве.
    """
    import subprocess
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
    берём из levelnorm.LOUD_ARGS — единый источник правды) -> libopus 24k mono
    -> .part -> атомарный os.replace в .opus. wav не создаётся вообще.

    Эквивалентность старой цепочке проверена замером 2026-10-14
    (tasks/2026-10-14-direct-opus-generation-research.md): стадия loudnorm
    bit-identical для wav- и pipe-входа, декодированная длина совпадает,
    |dLUFS| <= 0.08 LU.

    False = что-то пошло не так, вызывающая сторона пишет wav-фолбэк.
    """
    import subprocess
    from levelnorm import LOUD_ARGS  # e/i: -16 LUFS, TP -1.5 (см. config)
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
        from levelnorm import normalize_file
        normalize_file(wav_path)
    except Exception:
        pass
    if not wav_to_opus(wav_path):
        log('  WARN: opus-конверт не удался, wav остаётся фолбэком')


def gen_one(cosyvoice, text, ref, seed, emotion=None):
    """Одна фраза: реф + текст -> тензор речи.

    emotion — стилевая инструкция: используем instruct2-режим
    (инструкция отдельным аргументом, тот же промпт-формат, что у
    cross_lingual, но модель точно знает, что это стиль).
    """
    prepped = prep_ref(ref)
    set_all_random_seed(seed)
    if emotion:
        instruct = 'You are a helpful assistant. {}.<|endofprompt|>'.format(
            emotion)
        gen = cosyvoice.inference_instruct2(
            text, instruct, prepped, stream=False, speed=1.0,
            text_frontend=False)
    else:
        gen = cosyvoice.inference_cross_lingual(CV3_PREFIX + text, prepped,
                                                stream=False, speed=1.0,
                                                text_frontend=False)
    for j in gen:
        return j['tts_speech']


def main():
    ap = argparse.ArgumentParser(description='TSSR voice batch (CV3)')
    ap.add_argument('--arc', default=None, help='только эта арка')
    ap.add_argument('--scene', default=None, help='только эта сцена (arc=Other)')
    ap.add_argument('--char', default=None, help='только этот персонаж (who_name)')
    ap.add_argument('--uid', nargs='*', default=None, help='только эти uid')
    ap.add_argument('--limit', type=int, default=None, help='максимум фраз за прогон')
    ap.add_argument('--force', action='store_true', help='перегенерировать существующие')
    ap.add_argument('--keep-wav', action='store_true',
                    help='писать wav (старая цепочка levelnorm+конверт); '
                         'по умолчанию — сразу opus, wav не создаётся')
    ap.add_argument('--lang', default='ru', choices=['ru', 'en'])
    ap.add_argument('--seed', type=int, default=DEFAULT_SEED)
    ap.add_argument('--dry-run', action='store_true',
                    help='только список к генерации, без модели')
    ap.add_argument('--ref', default=None,
                    help='путь к рефу (перезаписывает yaml)')
    ap.add_argument('--emotion', default=None,
                    help='стиль: пресет (angry/sad/happy/fast/slow/loud/soft/'
                         'whisper/russian) или свободная инструкция')
    ap.add_argument('--emotion-tag', default='em',
                    help='суффикс файла для эмоции (default em)')
    ap.add_argument('--emotion-ru', default=None,
                    help='русский перевод эмоции (для манифеста/ревью)')
    ap.add_argument('--no-emotion', action='store_true',
                    help='отключить пофразовую эмоцию из emotions.json '
                         '(суффикс _plain)')
    ap.add_argument('--text', default=None,
                    help='произвольный текст (демо): одна фраза, '
                         'uid = md5(text), arc = --arc or Demo')
    ap.add_argument('--top-p', type=float, default=SAMPLING[0],
                    help='LLM nucleus sampling (default 0.5)')
    ap.add_argument('--top-k', type=int, default=SAMPLING[1],
                    help='LLM top-k кандидатов (default 10)')
    ap.add_argument('--tau-r', type=float, default=SAMPLING[2],
                    help='RAS штраф повторов (default 0.15)')
    ap.add_argument('--cfg-rate', type=float, default=CFG_RATE,
                    help='LLM classifier-free guidance (default 0.9)')
    ap.add_argument('--device', default='cpu', choices=['cpu', 'cuda', 'dml'],
                    help='устройство: cpu (default), cuda (NVIDIA GPU) или dml (DirectML/AMD, не работает)')
    ap.add_argument('--flow-temp', type=float, default=FLOW_TEMP,
                    help='температура flow-декодера (default 1.2)')
    args = ap.parse_args()
    if args.emotion and args.emotion in INSTRUCT_PRESETS:
        args.emotion = INSTRUCT_PRESETS[args.emotion]
    try:
        sys.stdout.reconfigure(encoding='utf-8', errors='replace')
        sys.stderr.reconfigure(encoding='utf-8', errors='replace')
    except Exception:
        pass

    entries, voices, who_to_voice = load_inputs()
    phrases = select_phrases(entries, voices, who_to_voice, args)
    log('фраз к генерации: {} (lang={}, force={})'.format(
        len(phrases), args.lang, args.force))
    for p in phrases[:10]:
        log('  {} | {} | {} | [{}] {}'.format(
            p['uid'][:8], p['arc'], p['voice'],
            (p.get('emotion') or '-')[:40], p['text'][:60]))
    if len(phrases) > 10:
        log('  ...')
    if args.dry_run:
        return

    model_dir = make_tuned_model_dir(args.top_p, args.top_k, args.tau_r,
                                     rl=True, cfg_rate=args.cfg_rate)
    log('model: {}'.format(model_dir))
    if ensure_model_yaml(model_dir, args.top_p, args.top_k, args.tau_r,
                         cfg_rate=args.cfg_rate):
        log('WARN: cosyvoice3.yaml был сломан — восстановлен из базовой модели')
    silence_benign_warnings()
    if args.device == 'dml':
        os.environ['TSSR_DML'] = '1'
        torch.inference_mode = lambda *a, **k: (lambda f: f)
        log('device: DML (DirectML)')
    elif args.device == 'cuda':
        if not torch.cuda.is_available():
            log('ERROR: --device cuda запрошен, но torch.cuda.is_available()=False '
                '(torch без CUDA-сборки? нужен torch с cu128+, см. AGENTS.md)')
            sys.exit(1)
        log('device: CUDA ({}, {:.0f} ГБ)'.format(
            torch.cuda.get_device_name(0),
            torch.cuda.get_device_properties(0).total_memory / 2**30))
    t0 = time.time()
    cosyvoice = AutoModel(model_dir=model_dir,
                          fp16=(args.device in ('dml', 'cuda')))
    patch_flow_temperature(args.flow_temp)
    patch_silent_token_trim()
    log('model loaded in {:.1f}s (flow-temp {}, cfg {}, RAS {}, silent-trim ON)'.format(
        time.time() - t0, args.flow_temp, args.cfg_rate,
        (args.top_p, args.top_k, args.tau_r)))

    done = skipped = failed = healed = 0
    total = len(phrases)
    t_start = time.time()
    for idx, p in enumerate(phrases):
        opus_path = os.path.splitext(p['out'])[0] + '.opus'
        if not args.force:
            if os.path.exists(opus_path):
                skipped += 1
                continue
            if os.path.exists(p['out']):
                # легаси (wav есть, opus нет): доконвертить, не перегенерировать
                if wav_to_opus(p['out']):
                    healed += 1
                    continue
        if args.limit and done >= args.limit:
            break
        log('[{}/{}] {} {} {}: {}'.format(
            idx + 1, total, p['uid'][:8], p['arc'], p['voice'], p['text'][:60]))
        try:
            speech = gen_one(cosyvoice, p['text'], p['ref'], args.seed,
                             p.get('emotion'))
            sr = cosyvoice.sample_rate
            trimmed, cuts = pattern_trim(speech, sr)
            os.makedirs(os.path.dirname(p['out']), exist_ok=True)
            dur = trimmed.shape[1] / sr
            if args.keep_wav:
                save_wav_chain(trimmed, sr, p['out'])
                saved = p['out']
            elif tensor_to_opus(trimmed, sr, p['out']):
                saved = opus_path
            else:
                log('  WARN: pipe-конверт не удался — пишу wav-фолбэк')
                save_wav_chain(trimmed, sr, p['out'])
                saved = p['out']
            trim_info = ''
            if cuts:
                trim_info = ' | trim: ' + ', '.join(
                    'burst {:.0f}ms after {:.0f}ms gap'.format(c['dur_ms'], c['gap_ms'])
                    for c in cuts)
            eta = (time.time() - t_start) / max(done + 1, 1) * (total - idx - 1)
            log('  saved {} ({:.1f}s){}, eta ~{:.0f} мин'.format(
                saved, dur, trim_info, eta / 60))
            done += 1
        except Exception as e:
            failed += 1
            log('  !! FAIL {}: {}'.format(p['uid'], e))

    log('done={} skipped={} healed={} failed={} total={}'.format(
        done, skipped, healed, failed, total))


if __name__ == '__main__':
    main()