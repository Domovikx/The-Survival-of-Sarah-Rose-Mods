#!/usr/bin/env python
"""Добавление нового голоса-кандидата в проект (инкрементально).

ЧТО ДЕЛАЕТ (по шагам, существующие файлы НЕ пересоздаются):
  1. Сканирует voice_candidates/{Голос}/gen_selected/*.mp3
     (ОДИН файл с ЛЮБЫМ именем -> станет {Голос}.wav;
      если файлов несколько: первый -> {Голос}.wav, остальные -> {Голос}_{i}.wav)
  2. Первые 10 секунд -> чистка -> voice_candidates/{Голос}/корень каста/
     (рабочая зона: рефы для A/B и экспериментов с фильтрами)
  3. Активный реф (после A/B) = {Голос}.wav в корне каста
     (voice_manage select {Голос} {вариант})

ЗАПУСК:
  python tools/add_candidate.py
  python tools/add_candidate.py --only "King Orwell Rose"
"""

import argparse
import os
import re
import subprocess
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from clean_refs import clean_file, compress_pauses_file, pause_params  # noqa: E402
from voicekit import catalog, paths  # noqa: E402

from voicekit import config as _cfg

TARGET_LEN = float(_cfg.get('refs', 'target_len', 10.0))
SR_RATE = int(_cfg.get('audio', 'sr', 24000))


def find_candidates():
    """{имя_голоса: [пути_к_mp3]} по gen_selected/ всех персонажей."""
    found = {}
    if not os.path.isdir(paths.VOICE_CANDIDATES):
        return found
    for name in sorted(os.listdir(paths.VOICE_CANDIDATES)):
        folder = paths.char_subdir(name, 'gen_selected')
        if not os.path.isdir(folder):
            continue
        mp3s = sorted(
            f for f in os.listdir(folder)
            if f.lower().endswith('.mp3')
        )
        if mp3s:
            found[name] = [os.path.join(folder, f) for f in mp3s]
    return found


def cut_and_clean(name, mp3_path, variant=None, preset=None):
    """Нарезка 10с + чистка -> корень каста: {name}[_{variant}].wav."""
    suffix = '_{}'.format(variant) if variant else ''
    dst = os.path.join(paths.char_dir(name),
                       name + suffix + '.wav')
    if os.path.exists(dst):
        return dst, False

    os.makedirs(os.path.dirname(dst), exist_ok=True)

    tmp_cut = os.path.join(paths.char_dir(name), name + '_tmp.wav')
    dur = float(subprocess.check_output(
        ['ffprobe', '-v', 'error', '-show_entries', 'stream=duration',
         '-of', 'csv=p=0', mp3_path]).decode().strip().splitlines()[0])
    cut_end = min(TARGET_LEN, dur)
    subprocess.run(['ffmpeg', '-y', '-ss', '0', '-to', '{:.3f}'.format(cut_end),
                    '-i', mp3_path, '-ac', '1', '-ar', str(SR_RATE), tmp_cut],
                   check=True, capture_output=True)

    n_cut, max_pause = compress_pauses_file(tmp_cut, SR_RATE)
    if n_cut:
        print('    паузы: сжато {} (макс {:.2f}с -> {:.2f}с)'.format(
            n_cut, max_pause, pause_params()[0]))

    clean_file(tmp_cut, dst, preset=preset)
    os.remove(tmp_cut)
    return dst, True


def load_who_map():
    """Из catalog/voices.json достаём {имя: [who]}."""
    import json
    path = paths.VOICES_JSON
    if not os.path.exists(path):
        return {}
    with open(path, encoding='utf-8') as f:
        data = json.load(f)
    chars = data.get('characters', {})
    who_map = {}
    for who, name in chars.items():
        who_map.setdefault(name, []).append(who)
    return who_map


def main():
    ap = argparse.ArgumentParser(description='Добавление голоса-кандидата')
    ap.add_argument('--only', default=None,
                    help='обработать только этот голос (имя папки)')
    ap.add_argument('--variants', action='store_true',
                    help='сгенерировать _1/_2/_3 с разными пресетами чистки (light/default/strong)')
    args = ap.parse_args()

    candidates = find_candidates()
    if args.only:
        if args.only not in candidates:
            print('НЕТ кандидата "{}". Есть: {}'.format(
                args.only, ', '.join(sorted(candidates)) or '—'))
            return 1
        candidates = {args.only: candidates[args.only]}

    if not candidates:
        print('В gen_selected/ нет ни одного .mp3.')
        return 0

    who_map = load_who_map()
    print('Кандидатов: {} голосов'.format(len(candidates)))

    for name, mp3s in sorted(candidates.items()):
        print('\n=== {} ==='.format(name))
        if args.variants:
            preset_names = ['light', 'default', 'strong']
            for i, mp3_path in enumerate(mp3s):
                for pi, preset in enumerate(preset_names):
                    variant = pi + 1
                    ref_path, made = cut_and_clean(name, mp3_path, variant, preset=preset)
                    print('  {:<40s} {} [{}] (из {})'.format(
                        os.path.relpath(ref_path, paths.ROOT),
                        'НОВЫЙ' if made else 'уже был',
                        preset,
                        os.path.basename(mp3_path)))
        elif len(mp3s) == 1:
            ref_path, made = cut_and_clean(name, mp3s[0], None)
            print('  {:<40s} {}'.format(
                os.path.relpath(ref_path, paths.ROOT),
                'НОВЫЙ' if made else 'уже был'))
        else:
            print('  в gen_selected/ {} mp3 — нейминг игнорируем:'.format(
                len(mp3s)))
            for i, mp3_path in enumerate(mp3s, 1):
                variant = None if i == 1 else i
                ref_path, made = cut_and_clean(name, mp3_path, variant)
                print('  {:<40s} {} (из {})'.format(
                    os.path.relpath(ref_path, paths.ROOT),
                    'НОВЫЙ' if made else 'уже был',
                    os.path.basename(mp3_path)))
        if name in who_map:
            print('  who_codes в касте: {}'.format(
                ', '.join(sorted(who_map[name]))))

    print('\nГотово. Рабочие рефы в корне каста. '
          'Финальный реф: voice_manage select.')
    from voicekit import catalog as _cat
    print('-> {}'.format(_cat.gen_voice_list_json()))
    return 0


if __name__ == '__main__':
    sys.exit(main())