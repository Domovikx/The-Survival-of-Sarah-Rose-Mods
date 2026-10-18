#!/usr/bin/env python
"""TSSR Voice Catalog builder.

Строит каталог озвучки из tl/ru переводов и script.rpy:

  - uid = md5(old) — полный 32-hex (язык-независимый ключ)
  - catalog/voices.json   — uid, old, new, who, arc, scene, category
  - catalog/label_arc.json — label -> arc (рантайм-мапа для auto_voice)

Категории: dialogue / narration / menu / ui (ui и menu не озвучиваются).

Запуск:
  python tools/voice_catalog.py
"""

import glob
import hashlib
import json
import os
import re
import sys

GAME_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TL_RU = os.path.join(GAME_DIR, 'game', 'tl', 'ru')
SCRIPT = os.path.join(GAME_DIR, 'game', 'script.rpy')
CATALOG_DIR = os.path.join(GAME_DIR, 'catalog')

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


def build():
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

    voices_path = os.path.join(CATALOG_DIR, 'voices.json')
    with open(voices_path, 'w', encoding='utf-8') as f:
        json.dump(dict(
            version=1,
            uid_source='md5(old utf-8) hexdigest 32',
            characters=char_names,
            totals=dict(total=len(entries), **cats),
            entries=entries,
        ), f, ensure_ascii=False, indent=1)
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
    build()
