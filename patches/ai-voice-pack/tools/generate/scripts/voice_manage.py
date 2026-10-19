#!/usr/bin/env python3
"""Быстрое управление голосами: list, status, select.

A/B-сравнение: voice_batch.py --ref voice_candidates/{Name}/{Name}_v.wav
генерит {uid}__{Name}_v.opus в audio/vo_ru/ — слушаешь варианты рядом,
победителя фиксируешь через `select` ({Name}_v.wav -> {Name}.wav).
"""

import argparse
import os
import shutil
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from voicekit import catalog, paths  # noqa: E402


def cmd_list(_):
    voices = catalog.load_voices()
    for name, v in voices.items():
        has_active = os.path.exists(paths.ref_active(name))
        cdir = paths.char_dir(name)
        variants = sorted(
            f[:-4] for f in os.listdir(cdir)
            if f.endswith('.wav') and f.startswith(name + '_'))             if os.path.isdir(cdir) else []
        gen_sel = paths.char_subdir(name, 'gen_selected')
        cands = sorted(
            f[:-4] for f in os.listdir(gen_sel)
            if f.endswith('.mp3')) if os.path.isdir(gen_sel) else []
        print('{} {}'.format('[OK]' if has_active else '[--]', name))
        if variants:
            print('  варианты: {}'.format(', '.join(variants)))
        if cands:
            print('  gen_selected: {}'.format(', '.join(cands)))


def cmd_select(args):
    if not os.path.exists(paths.ref_active(args.name)):
        print('✗ нет активного рефа {}/{}'.format(args.name, args.name))
        return 1

    variant = args.name if not args.variant else '{}_{}'.format(args.name, args.variant)
    src = os.path.join(paths.char_dir(args.name), variant + '.wav')
    if not os.path.isfile(src):
        print('✗ нет {}/{}.wav в корне каста'.format(args.name, variant))
        return 1

    dst = paths.ref_active(args.name)
    os.makedirs(os.path.dirname(dst), exist_ok=True)
    shutil.copy2(src, dst)
    catalog.gen_voice_list_json()
    print('✓ {} → {}'.format(
        os.path.relpath(src, paths.ROOT),
        os.path.relpath(dst, paths.ROOT)))
    print('  ✓ voice_list.json обновлён — в игре зазвучит этот вариант')
    return 0


def cmd_status(_):
    voices = catalog.load_voices()
    print('Статус озвучки:')
    for name, v in voices.items():
        has = os.path.exists(paths.ref_active(name))
        print('  {} {}'.format('[OK]' if has else '[--]', name))


def main():
    p = argparse.ArgumentParser(description='Управление голосами')
    s = p.add_subparsers(dest='cmd')

    s.add_parser('list', help='Показать все голоса и варианты')
    s.add_parser('status', help='Статус активных рефов')

    sel = s.add_parser('select', help='Выбрать активный вариант')
    sel.add_argument('name', help='Имя голоса (Sarah)')
    sel.add_argument('variant', help='Номер варианта (1, 3, ...)')

    args = p.parse_args()
    try:
        sys.stdout.reconfigure(encoding='utf-8', errors='replace')
        sys.stderr.reconfigure(encoding='utf-8', errors='replace')
    except Exception:
        pass
    if args.cmd == 'list':
        return cmd_list(args)
    elif args.cmd == 'select':
        return cmd_select(args)
    elif args.cmd == 'status':
        return cmd_status(args)
    else:
        p.print_help()
        return 1


if __name__ == '__main__':
    sys.exit(main())