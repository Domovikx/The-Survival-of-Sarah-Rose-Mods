#!/usr/bin/env python
"""Чистка рефов голосов: денойз + EQ + громкость (ffmpeg, без нейронок).

ПРОБЛЕМЫ ИСТОЧНИКОВ (обе решаем здесь):
  1. Лёгкое «подшипливание» (шум/яркость >8 кГц) — CV3 клонирует тембр
     вместе с шумом, поэтому чистим рефы ДО генерации.
  2. РАЗНАЯ ГРОМКОСТЬ рефов — голоса «гуляли» (где-то тихо, где-то громко),
     и генерация наследовала уровень. Выравниваем все рефы в один
     стандарт: EBU R128 loudnorm, цель -16 LUFS, TP -1.5 dB.

ЦЕПОЧКА ffmpeg (порядок важен):
  1. highpass f=60            — срез низкочастотного гула/постоянки
  2. afftdn nr=15              — FFT-денойз (убирает равномерный шип)
  3. deesser i=0.5             — срез сибилянтов «с/ш» (i: 0..1)
  4. highshelf f=8000 g=-6     — приглушение яркости >8 кГц (фикс из W40KRT)
  5. loudnorm I=-16 (2 прохода) — выравнивание громкости (EBU R128)
  6. afade in/out 30мс        — защита от кликов по краям

ПО УМОЛЧАНИЮ IN-PLACE: refs/ -> refs/, существующие скипаются.
Пересборка: --force. Или отдельные папки --src/--dst.

Запуск:
  python tools/clean_refs.py
  python tools/clean_refs.py --force
"""

import argparse
import json
import os
import re
import subprocess
import sys

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from voicekit import config as _cfg  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# Цепочка фильтров чистки (до loudnorm; тот идёт вторым проходом)
FILTERS = 'highpass=f=60,afftdn=nr=10,deesser=i=0.3,highshelf=f=8000:g=-4'

# Наборы фильтров для A/B вариантов (от лёгкого к агрессивному)
FILTER_PRESETS = {
    'light':  'highpass=f=60,afftdn=nr=10,deesser=i=0.3,highshelf=f=8000:g=-4',
    'default': 'highpass=f=60,afftdn=nr=10,deesser=i=0.3,highshelf=f=8000:g=-4',
    'strong': 'highpass=f=60,afftdn=nr=30,deesser=i=0.7,highshelf=f=8000:g=-8,lowpass=f=14000',
}

# Фейды по краям (защита от кликов/щелчков)
FADE = 0.03   # 30 мс в начале и в конце

# Длина рефа (для расчёта точки старта fade-out)
TARGET_LEN = 10.0

# Параметры loudnorm: цель громкости и допустимый пик (EBU R128)
LOUD_I = -16.0   # интегральная громкость, LUFS
LOUD_TP = -1.5   # true peak, dB
LOUD_LRA = 11.0  # диапазон громкости

def pause_params():
    """(target, silence_db) из конфига (в рантайме — кэш-безопасно)."""
    c = _cfg.section('refs').get('pause_compress', {})
    target = float(c.get('target', 0.35))
    silence_db = float(_cfg.get('refs', 'silence_db', -45.0))
    return target, silence_db


def compress_pauses(x, sr):
    """Сжать ВСЕ паузы длиннее target до target (окна 20мс).

    Любая пауза > 0.35с — уже «длинная» и сжимается до 0.35с.
    Возвращает (y, max_pause_before, n_cut).
    """
    target, silence_db = pause_params()
    win = max(int(0.02 * sr), 1)
    frames = len(x) // win
    if frames < 4:
        return x, 0.0, 0
    rms = np.sqrt((x[:frames * win].reshape(frames, win) ** 2).mean(axis=1))
    thr = 10 ** (silence_db / 20)
    silent = rms < thr

    segs = []
    start = 0
    cur = silent[0]
    for i in range(1, frames):
        if silent[i] != cur:
            segs.append((cur, start, i))
            start = i
            cur = silent[i]
    segs.append((cur, start, frames))

    out = []
    max_pause = 0.0
    n_cut = 0
    for is_silent, a, b in segs:
        dur = (b - a) * 0.02
        if not is_silent:
            out.append(x[a * win:b * win])
            continue
        if dur > max_pause:
            max_pause = dur
        if dur > target:
            keep = min(int(target * sr / win), b - a)
            out.append(x[a * win:(a + keep) * win])
            n_cut += 1
        else:
            out.append(x[a * win:b * win])
    y = np.concatenate(out) if out else x[:0]
    return y, round(max_pause, 2), n_cut


def read_wav_pcm(path, sr):
    import wave
    with wave.open(path, 'rb') as w:
        if w.getframerate() != sr or w.getnchannels() != 1:
            return None
        raw = w.readframes(w.getnframes())
    return np.frombuffer(raw, dtype=np.int16).astype(np.float32) / 32768.0


def write_wav_pcm(path, x, sr):
    import wave
    data = (np.clip(x, -1.0, 1.0) * 32767).astype(np.int16)
    with wave.open(path, 'wb') as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(sr)
        w.writeframes(data.tobytes())


def compress_pauses_file(path, sr):
    """Сжать паузы в WAV-файле на месте. Возвращает (n_cut, max_pause)."""
    x = read_wav_pcm(path, sr)
    if x is None:
        return 0, 0.0
    y, mx, n = compress_pauses(x, sr)
    if n:
        write_wav_pcm(path, y, sr)
    return n, mx


def loudnorm_two_pass(path, dst):
    """Выравнивание громкости в 2 прохода (анализ + применение).

    1-й проход: ffmpeg меряет вход (print_format=json в stderr).
    2-й проход: применяет с measured_*-параметрами.
    linear=false (ДИНАМИЧЕСКИЙ режим): loudnorm сам жмёт/растягивает динамику
    к LRA-цели, поэтому ВСЕ рефы сходятся к -16 LUFS вплотную (±0.5),
    даже тихие с редкими пиками (у них linear-режим упирался в TP-лимит
    и давал разброс -15...-19).
    """
    probe = subprocess.run(
        ['ffmpeg', '-i', path, '-af',
         'loudnorm=I={}:TP={}:LRA={}:print_format=json'.format(
             LOUD_I, LOUD_TP, LOUD_LRA),
         '-f', 'null', '-'],
        capture_output=True, text=True)
    m = re.search(r'\{.*\}', probe.stderr, re.S)
    if not m:
        raise RuntimeError('loudnorm probe: нет json в выводе ffmpeg')
    d = json.loads(m.group(0))
    args = ('loudnorm=I={}:TP={}:LRA={}:measured_I={}:measured_TP={}:'
            'measured_LRA={}:measured_thresh={}:linear=false'.format(
                LOUD_I, LOUD_TP, LOUD_LRA,
                d['input_i'], d['input_tp'], d['input_lra'], d['input_thresh']))
    tmp = dst + '.tmp.wav'
    subprocess.run(['ffmpeg', '-y', '-i', path, '-af', args,
                    '-ac', '1', '-ar', '24000', tmp],
                   check=True, capture_output=True)
    os.replace(tmp, dst)


def clean_file(src, dst, force=False, preset=None):
    """Один WAV: чистка (денойз+EQ) -> loudnorm -> фейды. True если обработан.

    force=False: существующий dst не трогаем.
    force=True: пересобираем. При in-place (src == dst) копии не нужны —
    src читается ffmpeg'ом только в начале, поэтому писать поверх безопасно.
    preset: 'light'/'default'/'strong' или None = FILTERS по умолчанию.
    """
    if os.path.exists(dst) and not force:
        return False  # уже чищеный — не трогаем
    filters = FILTER_PRESETS.get(preset, FILTERS) if preset else FILTERS
    tmp = dst + '.tmp1.wav'
    subprocess.run(['ffmpeg', '-y', '-i', src, '-af', filters,
                    '-ac', '1', '-ar', '24000', tmp],
                   check=True, capture_output=True)
    loudnorm_two_pass(tmp, dst)
    os.remove(tmp)
    # Фейды по краям (30мс) — глушим клики.
    # st рассчитываем от РЕАЛЬНОЙ длительности (клип может быть короче 10с).
    dur = float(subprocess.check_output(
        ['ffprobe', '-v', 'error', '-show_entries', 'format=duration',
         '-of', 'csv=p=0', dst]).decode().strip().splitlines()[0])
    st_out = max(0.0, dur - FADE)
    tmp_fade = dst + '.tmp2.wav'
    subprocess.run(['ffmpeg', '-y', '-i', dst,
                    '-af', 'afade=t=in:d={},afade=t=out:st={:.3f}:d={}'.format(
                        FADE, st_out, FADE),
                    '-ac', '1', '-ar', '24000', tmp_fade],
                   check=True, capture_output=True)
    os.replace(tmp_fade, dst)
    return True


def main():
    ap = argparse.ArgumentParser(
        description='Чистка рефов голосов (ffmpeg). По умолчанию in-place:'
                    ' refs/ -> refs/ (без --force существующие скипаются).')
    ap.add_argument('--src', default=os.path.join(ROOT, 'refs'))
    ap.add_argument('--dst', default=os.path.join(ROOT, 'refs'))
    ap.add_argument('--force', action='store_true', help='пересобрать существующие')
    args = ap.parse_args()

    if os.path.abspath(args.src) != os.path.abspath(args.dst):
        os.makedirs(args.dst, exist_ok=True)
    files = sorted(f for f in os.listdir(args.src) if f.endswith('.wav'))
    print('фильтры: {}'.format(FILTERS))
    for f in files:
        src = os.path.join(args.src, f)
        dst = os.path.join(args.dst, f)
        made = clean_file(src, dst, force=args.force)
        print('  {:<28s} {}'.format(f, 'OK' if made else 'skip (уже есть)'))
    print('готово: {} -> {}'.format(args.src, args.dst))


if __name__ == '__main__':
    main()
