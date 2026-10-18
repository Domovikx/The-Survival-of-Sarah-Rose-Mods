#!/usr/bin/env python
"""Выравнивание уровня реплик до -16 LUFS (рефы и легаси-wav).

Зачем: CV3 гуляет по уровню (реплики -14...-18 LUFS, встречается TP до
+0.2 dB = клиппинг). Выравниваем КАЖДЫЙ файл тем же стандартом, что и рефы:
EBU R128, -16 LUFS, TP -1.5 (loudnorm, dynamic — на коротких фразах
сходится вплотную и сам держит TP).

С 2026-10-14 в ai_voice только opus (wav удалены) — этот CLI работает по
*.wav в рефах/легаси. В генерации озвучки отдельного шага levelnorm НЕТ:
те же LOUD_ARGS применяются внутри одного ffmpeg-прохода, который пишет
opus (voice_batch.tensor_to_opus), а normalize_file() зовётся только в
старой цепочке (--keep-wav / wav-фолбэк).

Использование:
  # существующие wav-файлы (все файлы папки, in-place):
  python tools/levelnorm.py --dir voice_candidates
  # один файл:
  python tools/levelnorm.py --file voice_candidates/Alfred/Alfred.wav
  # отчёт без правки:
  python tools/levelnorm.py --dir voice_candidates --dry-run
"""

import argparse
import json
import os
import re
import subprocess
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from voicekit import config  # noqa: E402

_LOUD = config.section('audio').get('loudness', {})
LOUD_I = float(_LOUD.get('i', -16.0))   # целевая интегрированная громкость, LUFS
LOUD_TP = float(_LOUD.get('tp', -1.5))  # целевой true peak, dB
LOUD_LRA = float(_LOUD.get('lra', 11.0))  # диапазон громкости
LOUD_ARGS = 'loudnorm=I={}:TP={}:LRA={}'.format(LOUD_I, LOUD_TP, LOUD_LRA)


def probe(path):
    """Меряем интегрированную громкость и TP файла."""
    p = subprocess.run(
        ['ffmpeg', '-i', path, '-af',
         'loudnorm=print_format=json', '-f', 'null', '-'],
        capture_output=True, text=True)
    m = re.search(r'\{.*\}', p.stderr, re.S)
    try:
        return json.loads(m.group(0)) if m else {}
    except Exception:
        return {}


def normalize_file(src, dst=None):
    """Один WAV -> -16 LUFS / TP -1.5 (loudnorm dynamic, in-place по умолчанию).

    ffmpeg пишет в tmp (не умеет in-place), затем os.replace — атомарно.
    При сбое ffmpeg tmp удаляется (не копим сироты). При жёстком kill
    (ребут/убийство процесса) сирота может остаться — финальный файл при
    этом НЕ страдает (остаётся прошлой валидной версией).
    """
    dst = dst or src
    tmp = dst + '.ln.tmp.wav'
    try:
        subprocess.run(['ffmpeg', '-y', '-i', src, '-af', LOUD_ARGS,
                        '-ac', '1', '-ar', '24000', tmp],
                       check=True, capture_output=True)
        os.replace(tmp, dst)
    except Exception:
        if os.path.exists(tmp):
            try:
                os.remove(tmp)
            except OSError:
                pass
        raise
    return True


def main():
    ap = argparse.ArgumentParser(description='Выравнивание уровня реплик')
    ap.add_argument('--dir', default=None, help='папка с .wav (рекурсивно)')
    ap.add_argument('--file', default=None, help='один файл')
    ap.add_argument('--dry-run', action='store_true', help='только замеры')
    args = ap.parse_args()

    if args.file:
        files = [args.file]
    elif args.dir:
        files = []
        for root, _dirs, names in os.walk(args.dir):
            files += [os.path.join(root, n) for n in names if n.endswith('.wav')]
        files.sort()
    else:
        ap.print_help()
        return 1

    print('файлов: {}'.format(len(files)))
    ok = bad = 0
    for f in files:
        before = probe(f)
        bi = float(before.get('input_i', -99))
        btp = float(before.get('input_tp', -99))
        if args.dry_run:
            print('  {:7.2f} LUFS  TP {:6.2f}  {}'.format(
                bi, btp, os.path.basename(f)[:60]))
            continue
        try:
            normalize_file(f)
            d = probe(f)
            print('  {:7.2f} -> {:6.2f} LUFS  TP {:6.2f}  {}'.format(
                bi, float(d.get('input_i', -99)),
                float(d.get('input_tp', -99)), os.path.basename(f)[:45]))
            ok += 1
        except Exception as e:
            bad += 1
            print('  !! {} : {}'.format(os.path.basename(f)[:40], e))
    print('OK={} FAIL={}'.format(ok, bad))
    return 0


if __name__ == '__main__':
    sys.exit(main())
