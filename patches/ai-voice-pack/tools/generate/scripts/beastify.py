#!/usr/bin/env python
"""Нелюдские голоса: пресеты orc / demon / monster из человеческого рефа.

ПРИНЦИП (классика VO-озвучки монстров):
  - pitch + форманты вниз УМЕРЕННО (asetrate+atempo; 0.84 ≈ -3 полутона,
    НЕ октава — иначе «замедленная плёнка»)
  - тёмный EQ (bass boost, срез верхов) — «из бочки»
  - зерно/хрип (acrusher), компрессия
  - СУБ-ТОН: низкий гул (sine 55-75 Гц) с tremolo под голосом — рычание
  - демон: дрожащая модуляция + глубокий реверб-гул

После цепочки — loudnorm two-pass (-16 LUFS / TP -1.5).

ИСПОЛЬЗОВАНИЕ:
  python tools/beastify.py --file voice_candidates/Atilla/Atilla_05.wav
  -> рядом Atilla_05_orc.wav, _demon.wav, _monster.wav
  python tools/beastify.py --file X.wav --only demon
"""

import argparse
import json
import os
import re
import subprocess
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from levelnorm import LOUD_I, LOUD_TP, LOUD_LRA  # noqa: E402

FFMPEG = 'ffmpeg'
FFPROBE = 'ffprobe'
from voicekit import config as _cfg  # noqa: E402
SR = int(_cfg.get('audio', 'sr', 24000))

# пресеты живут в config/voice_presets.yaml -> beastify (см. voicekit.config).
# Здесь только минимальный фолбэк, если файла конфига нет.
_FALLBACK = {
    'orc': dict(k=0.84, chain='bass=g=4:f=120,highshelf=f=4000:g=-8,'
                              'acompressor=threshold=-25dB:ratio=3:attack=5:release=80,'
                              'acrusher=bits=12:mode=log:aa=1',
                sub_hz=75, sub_vol=0.08, sub_trem=18),
}


def presets():
    """Пресеты из config/voice_presets.yaml (beastify)."""
    from voicekit import config
    sec = config.section('beastify')
    if not sec:
        return _FALLBACK
    out = {}
    for name, pr in sec.items():
        if isinstance(pr, dict):
            out[name] = dict(
                k=float(pr.get('k', 0.84)),
                chain=str(pr.get('chain', '')),
                sub_hz=float(pr.get('sub_hz', 70)),
                sub_vol=float(pr.get('sub_vol', 0.08)),
                sub_trem=float(pr.get('sub_trem', 16)))
    return out


def duration(path):
    out = subprocess.run(
        [FFPROBE, '-v', 'error', '-show_entries', 'format=duration',
         '-of', 'csv=p=0', path], capture_output=True, text=True).stdout.strip()
    return float(out)


def measure(path):
    p = subprocess.run(
        [FFMPEG, '-i', path, '-af',
         'loudnorm=I={}:TP={}:LRA={}:print_format=json'.format(
             LOUD_I, LOUD_TP, LOUD_LRA),
         '-f', 'null', '-'], capture_output=True, text=True)
    m = re.search(r'\{.*\}', p.stderr, re.S)
    return json.loads(m.group(0)) if m else {}


def loudnorm_apply(src, dst, meas):
    args = ('loudnorm=I={}:TP={}:LRA={}:measured_I={}:measured_TP={}'
            ':measured_LRA={}:measured_thresh={}:offset={}:linear=true').format(
        LOUD_I, LOUD_TP, LOUD_LRA, meas['input_i'], meas['input_tp'],
        meas['input_lra'], meas['input_thresh'], meas['target_offset'])
    subprocess.run([FFMPEG, '-y', '-i', src, '-af', args,
                    '-ac', '1', '-ar', str(SR), dst],
                   check=True, capture_output=True)


def main():
    ap = argparse.ArgumentParser(description='Нелюдские голоса: orc/demon/monster')
    ap.add_argument('--file', required=True, help='исходный wav')
    ap.add_argument('--only', default=None,
                    help='только пресет (orc/demon/monster)')
    args = ap.parse_args()

    src = args.file
    if not os.path.exists(src):
        print('нет файла:', src)
        return 1
    stem = os.path.splitext(src)[0]
    d0 = measure(src)
    print('исходник: {:.1f} LUFS / TP {:.1f}'.format(
        float(d0.get('input_i', -99)), float(d0.get('input_tp', -99))))

    for name, pr in sorted(presets().items()):
        if args.only and args.only != name:
            continue
        dur = duration(src)
        tmp = stem + '_{}_tmp.wav'.format(name)
        # голос: pitch+форманты вниз + цепочка
        pitch = 'asetrate={}*{},aresample={},atempo={}'.format(
            SR, pr['k'], SR, round(1 / pr['k'], 5))
        chain = pitch + ',' + pr['chain']
        # суб-тон (только если sub_hz > 0)
        if pr.get('sub_hz', 0) > 0:
            sub = ('sine=f={}:duration={:.3f}'.format(pr['sub_hz'], dur))
            subf = 'tremolo=f={}:d=0.7,volume={}'.format(
                pr['sub_trem'], pr['sub_vol'])
            subprocess.run([
                FFMPEG, '-y',
                '-i', src,
                '-f', 'lavfi', '-i', sub,
                '-filter_complex',
                '[0:a]{}[v];[1:a]{}[g];[v][g]amix=inputs=2:duration=first:normalize=0[m]'.format(
                    chain, subf),
                '-map', '[m]', '-ac', '1', '-ar', str(SR), tmp],
                check=True, capture_output=True)
        else:
            subprocess.run([
                FFMPEG, '-y',
                '-i', src,
                '-af', chain,
                '-ac', '1', '-ar', str(SR), tmp],
                check=True, capture_output=True)
        m = measure(tmp)
        dst = '{}_{}.wav'.format(stem, name)
        loudnorm_apply(tmp, dst, m)
        os.remove(tmp)
        d = measure(dst)
        print('{}: {:.1f} LUFS / TP {:.1f}'.format(
            os.path.basename(dst),
            float(d.get('input_i', -99)), float(d.get('input_tp', -99))))
    print('готово.')
    return 0


if __name__ == '__main__':
    sys.exit(main())