#!/usr/bin/env python
"""TSSR Voice Catalog builder.

Строит каталог озвучки из переводов тл мода и script.rpy установки:

  - uid = md5(old) — полный 32-hex (язык-независимый ключ)
  - catalog/voices.jsonl  — uid, old, new, who, arc, scene, category
                            (JSONL: строка 1 = метаданные, далее по записи)
  - catalog/label_arc.json — label -> arc (рантайм-мапа для auto_voice)

Источники (2026-10-20): tl — модовый patches/ai-voice-pack/tl/ru (репо),
script.rpy — read-only установка игры (TSSR_GAME или Steam-дефолт из
voicekit.paths). Раньше оба брались из game_dir, но установка своего tl не
имеет (тл живёт в моде) — дефолты были мертвы после переезда в mods-repo.

Категории: dialogue / narration / menu / ui (ui и menu не озвучиваются).

Запуск:
  python tools/generate/scripts/voice_catalog.py [game_dir] [--tl DIR]
      [--out DIR] [--diff OLD_JSONL]
"""

import argparse
import glob
import hashlib
import json
import os
import re
import sys

from voicekit import paths

# Тл переводов мода (репо) и каталог-приёмник — раскладка voicekit.paths.
TL_RU = os.path.join(paths.PKG_ROOT, 'tl', 'ru')
CATALOG_DIR = paths.CATALOG_DIR
# script.rpy — только read-only установка (env TSSR_GAME / Steam-дефолт).
SCRIPT = os.path.join(paths.GAME_INSTALL, 'game', 'script.rpy')

SKIP_FILES = ('renpy_common', 'screens', 'misc_strings')

OLD_RE = re.compile(r'^\s*old\s+"(.*)"\s*$')
NEW_RE = re.compile(r'^\s*new\s+"(.*)"\s*$')
HEADER_RE = re.compile(r'^# Arc:\s*(\S+)\s*\|\s*Scene:\s*(\S+)')
LABEL_RE = re.compile(r'^label\s+([A-Za-z0-9_.]+)')
SAY_RE = re.compile(r'^\s*(\w+)\s+"((?:[^"\\]|\\.)*)"')
# Строковые спикеры: "Orc" "Walk!" — безымянные существа без define-переменной.
# Им присваиваем стабильные who-id, чтобы они не уходили в Narrator.
SAY_STRING_RE = re.compile(r'^\s*"([^"]+)"\s+"((?:[^"\\]|\\.)*)"')
NARR_RE = re.compile(r'^\s*"((?:[^"\\]|\\.)*)"\s*(?:nointeract|with\b.*)?\s*$')
MENU_RE = re.compile(r'^\s*"([^"]*)"\s*(?:if\b.*)?:\s*$')
DEFINE_RE = re.compile(r'^define\s+(\w+)\s*=\s*Character\(\s*"([^"]+)"')

# Каких строковых спикеров признаём персонажами (кто -> who-id).
STRING_SPEAKERS = {
    'Orc': 'orc',
    'Gorak': 'gor',
    'Raza': 'raza',
    'Basilisk': 'bsk',
    'Woodland Spirit': 'wsp',
}


def unescape(s):
    out = []
    i = 0
    while i < len(s):
        if s[i] == '\\' and i + 1 < len(s):
            c = s[i + 1]
            if c == 'n':
                out.append('\n')
            elif c == 't':
                out.append('\t')
            elif c in '"\'':
                out.append(c)
            elif c == '\\':
                out.append('\\')
            else:
                out.append('\\')
                out.append(c)
            i += 2
        else:
            out.append(s[i])
            i += 1
    return ''.join(out)


def norm_label(label):
    return label.replace('.', '_')


def parse_tl():
    """Parse tl/ru files -> list of entries (arc, scene, old, new, path)."""
    entries = []
    for path in sorted(glob.glob(os.path.join(TL_RU, '**', '*.rpy'), recursive=True)):
        rel = os.path.relpath(path, TL_RU).replace(os.sep, '/')
        arc, scene = None, None
        with open(path, encoding='utf-8', errors='replace') as f:
            lines = f.readlines()
        for line in lines:
            m = HEADER_RE.match(line)
            if m:
                arc, scene = m.group(1), m.group(2)
        if arc is None:
            arc = '(root)'
        old = None
        for line in lines:
            m = OLD_RE.match(line)
            if m:
                old = unescape(m.group(1))
                continue
            m = NEW_RE.match(line)
            if m and old is not None:
                entries.append(dict(arc=arc, scene=scene, old=old,
                                    new=unescape(m.group(1)), rel=rel))
                old = None
    return entries


def parse_script():
    """Parse script.rpy -> who map, menu set, labels, char names."""
    old_who = {}
    old_labels = {}
    menu_texts = set()
    labels = []
    char_names = {}
    label = None
    with open(SCRIPT, encoding='utf-8', errors='replace') as f:
        lines = f.readlines()
    for line in lines:
        m = LABEL_RE.match(line)
        if m:
            label = m.group(1)
            labels.append(label)
            continue
        m = DEFINE_RE.match(line)
        if m:
            char_names[m.group(1)] = m.group(2)
            continue
        m = MENU_RE.match(line)
        if m and label is not None:
            menu_texts.add(unescape(m.group(1)))
            continue
        m = SAY_STRING_RE.match(line)
        if m:
            speaker, text = m.group(1), unescape(m.group(2))
            sid = STRING_SPEAKERS.get(speaker)
            if sid:
                char_names.setdefault(sid, speaker)
                old_who.setdefault(text, (sid, label))
                old_labels.setdefault(text, set()).add(label)
                continue
        m = SAY_RE.match(line)
        if m:
            who, text = m.group(1), unescape(m.group(2))
            old_who.setdefault(text, (who, label))
            old_labels.setdefault(text, set()).add(label)
            continue
        m = NARR_RE.match(line)
        if m:
            text = unescape(m.group(1))
            old_who.setdefault(text, (None, label))
            old_labels.setdefault(text, set()).add(label)
    return old_who, old_labels, menu_texts, labels, char_names


def write_delta_manifests(old_jsonl, entries):
    """added/changed/dropped uid-манифесты: прежний каталог vs свежая сборка.

    added   — uid только в свежем каталоге (новые строки: генерировать ru+en);
    changed — uid в обоих, но ru-текст new отличается (переозвучить ru --force;
              en-текст old по определению не менялся — uid = md5(old));
    dropped — uid только в прежнем (сироты-кандидаты на чистку audio/vo_*).

    Пишет tmp/voice_delta/{added,changed,dropped}.txt (по uid на строку,
    gitignored tmp/ репы) и печатает сводку.
    """
    old_by_uid = {}
    with open(old_jsonl, encoding='utf-8') as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            rec = json.loads(line)
            if 'uid' in rec:
                old_by_uid[rec['uid']] = rec
    new_by_uid = {e['uid']: e for e in entries}
    added = sorted(set(new_by_uid) - set(old_by_uid))
    dropped = sorted(set(old_by_uid) - set(new_by_uid))
    changed = sorted(u for u in set(new_by_uid) & set(old_by_uid)
                     if old_by_uid[u].get('new') != new_by_uid[u].get('new'))
    out_dir = os.path.join(paths.REPO_ROOT, 'tmp', 'voice_delta')
    os.makedirs(out_dir, exist_ok=True)
    for name, uids in (('added', added), ('changed', changed),
                       ('dropped', dropped)):
        with open(os.path.join(out_dir, name + '.txt'), 'w',
                  encoding='utf-8', newline='\n') as f:
            for u in uids:
                f.write(u + '\n')
    print('=== diff vs {} ==='.format(old_jsonl))
    print('  added   (генерировать ru+en): {}'.format(len(added)))
    print('  changed (переозвучить ru --force): {}'.format(len(changed)))
    print('  dropped (сироты-кандидаты на чистку): {}'.format(len(dropped)))
    print('  манифесты: {}'.format(out_dir))
    return added, changed, dropped


def build(game_dir=None, out_dir=None, tl_dir=None, diff_with=None):
    """Сборка каталога.

    game_dir — установка игры: берётся оттуда script.rpy (по умолчанию
               TSSR_GAME/Steam-дефолт из voicekit.paths);
    tl_dir   — tl-каталог переводов (по умолчанию — тл мода patches/ai-voice-pack/tl/ru);
    out_dir  — куда писать catalog/ (по умолчанию — каталог репы);
    diff_with — прежний voices.jsonl: записать added/changed/dropped
                uid-манифесты в tmp/voice_delta/ (генерация/переозвучка/чистка).
    """
    global TL_RU, SCRIPT, CATALOG_DIR
    if tl_dir:
        TL_RU = tl_dir
    if game_dir:
        SCRIPT = os.path.join(game_dir, 'game', 'script.rpy')
    if out_dir:
        CATALOG_DIR = out_dir
    if not os.path.isdir(TL_RU):
        sys.exit('tl-каталог не найден: {} (передай --tl)'.format(TL_RU))
    if not os.path.isfile(SCRIPT):
        sys.exit('script.rpy не найден: {} (передай game_dir или TSSR_GAME)'.format(SCRIPT))
    print('parsing tl/ru ...')
    tl_entries = parse_tl()
    print('  tl entries: {}'.format(len(tl_entries)))
    print('parsing script.rpy ...')
    old_who, old_labels, menu_texts, labels, char_names = parse_script()
    print('  say texts in script: {}'.format(len(old_who)))
    print('  labels: {}'.format(len(labels)))
    print('  menu texts: {}'.format(len(menu_texts)))
    print('  characters: {}'.format(len(char_names)))

    seen = set()
    conflicts = []
    entries = []
    for e in tl_entries:
        old = e['old']
        if old in seen:
            continue
        seen.add(old)
        uid = hashlib.md5(old.encode('utf-8')).hexdigest()
        rel = e['rel']
        if rel.startswith(SKIP_FILES):
            category = 'ui'
        elif old in menu_texts:
            category = 'menu'
        else:
            category = 'dialogue' if (old_who.get(old) and old_who[old][0]) else 'narration'
        who_pair = old_who.get(old)
        who = who_pair[0] if who_pair else None
        if old in old_labels and len(old_labels[old]) > 1:
            conflicts.append(dict(uid=uid, old=old, labels=sorted(old_labels[old])))
        entries.append(dict(
            uid=uid, old=old, new=e['new'],
            who=who, who_name=char_names.get(who) if who else None,
            arc=e['arc'], scene=e['scene'],
            category=category,
        ))

    # label -> arc: scene->arc из заголовков + labels из script
    scene_arc = {}
    for e in tl_entries:
        if e['scene']:
            scene_arc[norm_label(e['scene'])] = e['arc']
    label_arc = {}
    missing = []
    for lab in labels:
        nlab = norm_label(lab)
        if nlab in scene_arc:
            label_arc[nlab] = scene_arc[nlab]
        else:
            missing.append(lab)
    # резолв пропущенных label'ов по текстам: label -> его say-тексты -> arc из tl
    arc_by_old = {}
    for e in tl_entries:
        arc_by_old.setdefault(e['old'], e['arc'])
    resolved = []
    still_missing = []
    for lab in missing:
        nlab = norm_label(lab)
        found = None
        for text, labs in old_labels.items():
            if lab in labs:
                found = arc_by_old.get(text)
                if found:
                    break
        if found:
            label_arc[nlab] = found
            resolved.append((lab, found))
        else:
            still_missing.append(lab)
    unmatched_scenes = sorted(set(s for s in scene_arc if s not in set(map(norm_label, labels))))

    # stats
    cats = {}
    for e in entries:
        cats[e['category']] = cats.get(e['category'], 0) + 1

    os.makedirs(CATALOG_DIR, exist_ok=True)

    # diff читает прежний каталог ДО перезаписи (частый случай — тот же путь).
    if diff_with:
        write_delta_manifests(diff_with, entries)

    voices_path = os.path.join(CATALOG_DIR, 'voices.jsonl')
    meta = dict(
        version=1,
        uid_source='md5(old utf-8) hexdigest 32',
        characters=char_names,
        totals=dict(total=len(entries), **cats),
    )
    with open(voices_path, 'w', encoding='utf-8', newline='\n') as f:
        f.write(json.dumps(meta, ensure_ascii=False) + '\n')
        for e in entries:
            f.write(json.dumps(e, ensure_ascii=False) + '\n')
    print('wrote {} ({:,} entries)'.format(voices_path, len(entries)))

    la_path = os.path.join(CATALOG_DIR, 'label_arc.json')
    with open(la_path, 'w', encoding='utf-8') as f:
        json.dump(label_arc, f, ensure_ascii=False, indent=1, sort_keys=True)
    print('wrote {} ({} labels -> arc)'.format(la_path, len(label_arc)))

    print()
    print('=== stats ===')
    for k, v in sorted(cats.items(), key=lambda x: -x[1]):
        print('  {:12s} {:6d}'.format(k, v))
    print('=== who conflicts (same old, several labels) ===')
    print('  total: {}'.format(len(conflicts)))
    for c in conflicts[:10]:
        print('  {}  {}'.format(c['uid'][:8], c['old'][:60]))
    print('=== labels without arc: {} ==='.format(len(still_missing)))
    for lab in still_missing[:20]:
        print('  {}'.format(lab))
    if resolved:
        print('=== resolved by text matching: {} ==='.format(len(resolved)))
        for lab, arc in resolved:
            print('  {} -> {}'.format(lab, arc))
    print('=== tl scenes not matching labels: {} ==='.format(len(unmatched_scenes)))
    for s in unmatched_scenes[:10]:
        print('  {}'.format(s))


if __name__ == '__main__':
    ap = argparse.ArgumentParser(description='Сборка каталога озвучки TSSR')
    ap.add_argument('game_dir', nargs='?', default=None,
                    help='установка игры (берётся script.rpy; по умолчанию '
                         'TSSR_GAME или Steam-дефолт)')
    ap.add_argument('--tl', default=None,
                    help='tl-каталог переводов (по умолчанию — тл мода '
                         'patches/ai-voice-pack/tl/ru)')
    ap.add_argument('--out', default=None,
                    help='куда писать catalog/ (по умолчанию — реальный)')
    ap.add_argument('--diff', default=None, metavar='OLD_JSONL',
                    help='прежний voices.jsonl: записать added/changed/dropped '
                         'uid-манифесты в tmp/voice_delta/')
    a = ap.parse_args()
    build(game_dir=a.game_dir, out_dir=a.out, tl_dir=a.tl, diff_with=a.diff)
