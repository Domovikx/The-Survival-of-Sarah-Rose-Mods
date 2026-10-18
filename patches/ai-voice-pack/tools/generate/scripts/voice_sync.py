#!/usr/bin/env python
"""voice_sync — актуализатор и мигратор voice-структуры TSSR.

Слои (источники правды):
  catalog/voices.json          кто есть в игре (собирается voice_catalog.py)
  voice_candidates/{Name}/     кто в работе (контракт + подпапки)
  каст-yaml (who_codes)      кого озвучиваем (озвучен = есть реф {Name}.wav)

КОМАНДЫ:
  status                       сводка слоёв и расхождений (console)
  update  [--apply]            создать структуру+заглушки новым персонажам,
                               пересобрать сводку voice_candidates.yaml
  migrate [--apply]            одноразовый переезд: refs/*.wav -> папки
                               персонажей, mp3 -> generated/gen_selected,
                               обновление структуры кастов
  report                       пересобрать missing_voices.md
                               + voice_sync_report.md

ПРАВИЛА: ничего не удалять и не перетирать; без --apply только план;
каждое действие логируется. Рефы НЕ создаются автоматически — только
структура и отчёты.
"""

import argparse
import datetime
import json
import os
import re
import sys
from collections import defaultdict

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import yaml

from voicekit import catalog, contract, fs, paths

SKIP_CAST_NAMES = {'Generic Female Mature', 'Generic Female Young',
                   'Generic Male Mature', 'Generic Male Young'}


def load_voices_safe():
    try:
        return catalog.load_voices()
    except Exception as e:
        print('!! каст: {}'.format(e))
        return {}


def char_files(name, sub):
    d = paths.char_subdir(name, sub)
    if not os.path.isdir(d):
        return []
    return sorted(os.listdir(d))


def count_files(name, sub):
    return len([f for f in char_files(name, sub)
                if os.path.isfile(os.path.join(paths.char_subdir(name, sub), f))])


def ref_files(name):
    """Реф-файлы каста в корне: {Name}.wav (активный) + {Name}_{v}.wav."""
    d = paths.char_dir(name)
    if not os.path.isdir(d):
        return []
    return sorted(f for f in os.listdir(d)
                  if f.endswith('.wav')
                  and (f.startswith(name + '.') or f.startswith(name + '_')))


def count_ref_files(name):
    return len(ref_files(name))


def mp3_classify(name, filename):
    """Куда деть mp3 из корня папки персонажа -> (подпапка, новое_имя)."""
    stem, ext = os.path.splitext(filename)
    if ext.lower() != '.mp3':
        return None
    if stem == name:
        return ('gen_selected', name + '.mp3')
    if stem.endswith(' ' + name):
        return ('gen_selected', name + '.mp3')
    if stem.startswith(name + '_'):
        return ('gen_selected', stem + '.mp3')
    first = name.split()[0]
    m = re.match(r'^' + re.escape(first) + r'\s+(\d+)$', stem)
    if m:
        return ('generated', m.group(1) + '.mp3')
    if re.match(r'^\d+$', stem):
        return ('generated', filename)
    if stem.lower().startswith('qwen_'):
        return ('generated', filename)
    return ('generated', filename)




def cmd_status(_):
    data = catalog.load_catalog()
    chars = sorted(set(data['characters'].values()))
    voices = load_voices_safe()
    casts = catalog.cast_names()
    print('СЛОИ:')
    print('  каталог (игра):        {:3d} персонажей'.format(len(chars)))
    print('  касты (voice_candidates): {:3d}'.format(len(casts)))
    print('  голоса (рефы в кастах): {:3d}'.format(len(voices)))
    print('  активные рефы в кастах: {:3d}'.format(
        sum(count_ref_files(c) for c in casts)))

    missing_casts = [c for c in chars if c not in casts and c not in SKIP_CAST_NAMES]
    print('\nВ каталоге, но БЕЗ каста ({}): {}'.format(
        len(missing_casts), ', '.join(sorted(missing_casts))))

    no_file = []
    for name in sorted(voices):
        if not os.path.exists(paths.ref_active(name)):
            no_file.append('{} -> {}'.format(name, paths.ref_voices(name)))
    if no_file:
        print('\nBROKEN рефы ({}):'.format(len(no_file)))
        for x in no_file:
            print('  ' + x)
    else:
        print('\nBROKEN ref: нет')

    ready_no_voice = []
    for c in casts:
        if c in voices:
            continue
        if count_ref_files(c) and os.path.exists(paths.ref_active(c)):
            ready_no_voice.append(c)
    if ready_no_voice:
        print('Каст без рефа ({}): {}'.format(
            len(ready_no_voice), ', '.join(ready_no_voice)))
    return 0


def ensure_structure(name, ops):
    ops.ensure_dir(paths.char_dir(name))
    for sub in paths.CHAR_SUBDIRS:
        ops.ensure_dir(paths.char_subdir(name, sub))


def cast_stub(name):
    return dict(name=name, gender='?', age='?', who='', instruct_en='', texts=[])


def cmd_update(args):
    ops = fs.Ops(apply=args.apply)
    data = catalog.load_catalog()
    chars = set(data['characters'].values())
    chars.add('Narrator')
    chars.difference_update(SKIP_CAST_NAMES)
    existing = set(catalog.cast_names())

    new, stub_files = [], []
    for name in sorted(chars):
        if name in existing:
            continue
        new.append(name)
        ensure_structure(name, ops)
        if not os.path.exists(paths.char_yaml(name)):
            stub_files.append(name)
            ops.ensure_dir(paths.char_dir(name))
            if args.apply:
                catalog.save_cast(name, cast_stub(name))
            else:
                print('  stub yaml: {}'.format(name))

    print('новых персонажей: {}'.format(len(new)))
    if new and not args.apply:
        print('dry-run: без --apply структура НЕ создаётся.')

    summary = build_summary()
    ops.ensure_dir(paths.CATALOG_DIR)
    if args.apply:
        with open(paths.CAST_SUMMARY_YAML, 'w', encoding='utf-8') as f:
            yaml.dump(summary, f, allow_unicode=True, sort_keys=False)
        print('-> {}'.format(paths.CAST_SUMMARY_YAML))
    else:
        print('сводка готова к записи ({} персонажей)'.format(len(summary['cast'])))
    if args.apply:
        print('-> {}'.format(catalog.gen_voice_list_json()))
    return 0


def build_summary():
    data = catalog.load_catalog()
    lines, arcs = catalog.characters_by_category()
    voices = load_voices_safe()
    cast = {}
    for name in catalog.cast_names():
        c = catalog.load_cast(name) or {}
        ref_file = os.path.exists(paths.ref_active(name))
        cast[name] = dict(
            gender=c.get('gender'),
            age=c.get('age'),
            status='voice_ready' if ref_file else 'in_progress',
            ref=os.path.basename(paths.ref_active(name)) if ref_file else None,
            generated=count_files(name, 'generated'),
            gen_selected=count_files(name, 'gen_selected'),
            variants=max(0, count_ref_files(name) - (1 if ref_file else 0)),
            in_voices=name in voices,
        )
    ready = sum(1 for v in cast.values() if v['status'] == 'voice_ready')
    return dict(
        updated=datetime.datetime.now().strftime('%Y-%m-%d %H:%M'),
        summary=dict(total=len(cast), voice_ready=ready,
                     in_progress=len(cast) - ready),
        cast=cast)



def cmd_migrate(args):
    """Переезд ref/ + in_progress/ -> корень каста (новая раскладка)."""
    ops = fs.Ops(apply=args.apply)
    moved, removed_dirs = [], []
    for name in sorted(catalog.cast_names()):
        d = paths.char_dir(name)
        for sub in ('ref', 'in_progress'):
            subdir = os.path.join(d, sub)
            if not os.path.isdir(subdir):
                continue
            for f in sorted(os.listdir(subdir)):
                if not f.endswith('.wav'):
                    continue
                src = os.path.join(subdir, f)
                dst = os.path.join(d, f)
                if os.path.exists(dst):
                    ops._rec('skip', name, f + ' (уже в корне)')
                    continue
                ops.move(src, dst)
                moved.append((name, sub, f))
            ops.remove_dir_if_empty(subdir)
            removed_dirs.append(subdir)

    print('=== ref/ + in_progress/ -> корень каста ===')
    for name, sub, f in moved:
        print('  {}: {}/{} -> {}'.format(name, sub, f, f))
    if not moved:
        print('  перенесено нечего')
    for d in removed_dirs:
        print('  удалена пустая папка: {}'.format(os.path.relpath(d, paths.ROOT)))

    if not args.apply:
        print('\nDRY-RUN: ничего не изменено. Запусти с --apply.')
    return 0


def cmd_report(_):
    write_missing_voices()
    write_sync_report()
    print('-> {}'.format(catalog.gen_voice_list_json()))
    return 0


def write_missing_voices():
    data = catalog.load_catalog()
    voices = load_voices_safe()
    who_to_voice = catalog.who_to_voice(voices)
    lines, arcs = catalog.characters_by_category()

    ready, missing = [], []
    for name in sorted(lines, key=lambda n: -sum(lines[n].values())):
        total = sum(lines[name].values())
        if total == 0:
            continue
        info = dict(name=name, dialogue=lines[name]['dialogue'],
                    narration=lines[name]['narration'], total=total,
                    arcs=len(arcs[name]),
                    voice=(who_to_voice.get(name, None)
                           or (name if name in voices else None)))
        if name in voices or name in who_to_voice:
            ready.append(info)
        else:
            missing.append(info)

    voiced_total = sum(i['total'] for i in ready)
    missing_total = sum(i['total'] for i in missing)
    with open(paths.MISSING_VOICES_MD, 'w', encoding='utf-8') as f:
        f.write('# Голоса, которых не хватает (заглушки)\n\n')
        f.write('Правило: озвучен = у каста есть реф {Name}.wav.\n')
        f.write('Файл генерируется: `python tools/voice_sync.py report`\n\n')
        f.write('## Готово ({}, {} реплик)\n\n'.format(len(ready), voiced_total))
        f.write('| Голос | Реплик | Диалог | Наррация | Арок |\n')
        f.write('|---|---|---|---|---|\n')
        for i in ready:
            f.write('| {} | {} | {} | {} | {} |\n'.format(
                i['name'], i['total'], i['dialogue'], i['narration'], i['arcs']))
        f.write('\n## Найти ({} персонажей, {} реплик)\n\n'.format(
            len(missing), missing_total))
        f.write('| # | Персонаж | Реплик | Диалог | Наррация | Арок |\n')
        f.write('|---|---|---|---|---|---|\n')
        for n, i in enumerate(missing, 1):
            f.write('| {} | {} | {} | {} | {} | {} |\n'.format(
                n, i['name'], i['total'], i['dialogue'], i['narration'],
                i['arcs']))
    print('-> {}'.format(paths.MISSING_VOICES_MD))


def write_sync_report():
    data = catalog.load_catalog()
    chars = sorted(set(data['characters'].values()))
    voices = load_voices_safe()
    casts = catalog.cast_names()

    new = [c for c in chars if c not in casts and c not in SKIP_CAST_NAMES]
    ready = []
    for c in casts:
        if c not in voices and os.path.exists(paths.ref_active(c)):
            ready.append(c)
    broken = [name for name in sorted(voices)
              if not os.path.exists(paths.ref_active(name))]

    orphan = []
    for c in casts:
        if c not in voices:
            for f in ref_files(c):
                if f.endswith('.wav'):
                    orphan.append((c, f))

    lines = []
    lines.append('# Отчёт voice_sync ({})\n'.format(
        __import__('datetime').datetime.now().strftime('%Y-%m-%d %H:%M')))
    lines.append('Источник: `python tools/voice_sync.py report`\n')
    lines.append('## NEW — персонажи игры без каста ({}):\n'.format(len(new)))
    lines.append('| # | Персонаж |\n|---|---|\n')
    for n, c in enumerate(new, 1):
        lines.append('| {} | {} |\n'.format(n, c))
    lines.append('\n## BROKEN — каст есть, но нет активного рефа ({}):\n'.format(
        len(broken)))
    lines.append('| Персонаж | Ожидаемый файл |\n|---|---|\n')
    for name in broken:
        lines.append('| {} | `{}` |\n'.format(name, paths.ref_voices(name)))
    lines.append('\n## ORPHAN — рабочие рефы без каста ({}):\n'.format(
        len(orphan)))
    lines.append('| Персонаж | Файл |\n|---|---|\n')
    for c, f in orphan:
        lines.append('| {} | {} |\n'.format(c, f))
    if not (new or broken or orphan):
        lines.append('\nРасхождений нет.\n')

    os.makedirs(paths.CATALOG_DIR, exist_ok=True)
    with open(paths.SYNC_REPORT_MD, 'w', encoding='utf-8') as f:
        f.write(''.join(lines))
    print('-> {}'.format(paths.SYNC_REPORT_MD))


def main():
    ap = argparse.ArgumentParser(description='Актуализатор voice-структуры')
    s = ap.add_subparsers(dest='cmd')
    s.add_parser('status', help='сводка слоёв и расхождений')
    upd = s.add_parser('update', help='структура новым + сводка')
    upd.add_argument('--apply', action='store_true')
    mig = s.add_parser('migrate', help='ref/ + in_progress/ -> корень каста')
    mig.add_argument('--apply', action='store_true')
    s.add_parser('report', help='missing_voices.md + voice_sync_report.md')
    args = ap.parse_args()

    try:
        sys.stdout.reconfigure(encoding='utf-8', errors='replace')
        sys.stderr.reconfigure(encoding='utf-8', errors='replace')
    except Exception:
        pass

    if args.cmd == 'status':
        return cmd_status(args)
    if args.cmd == 'update':
        return cmd_update(args)
    if args.cmd == 'migrate':
        return cmd_migrate(args)
    if args.cmd == 'report':
        return cmd_report(args)
    ap.print_help()
    return 1


if __name__ == '__main__':
    sys.exit(main())