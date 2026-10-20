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

from collections import defaultdict

from voicekit import paths
from voicekit import who_map

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
SAY_STRING_RE = re.compile(r'^\s*"([^"]+)"\s+"((?:[^"\\]|\\.)*)"')
NARR_RE = re.compile(r'^\s*"((?:[^"\\]|\\.)*)"\s*(?:nointeract|with\b.*)?\s*$')
MENU_RE = re.compile(r'^\s*"([^"]*)"\s*(?:if\b.*)?:\s*$')
DEFINE_RE = re.compile(r'^define\s+(\w+)\s*=\s*Character\(\s*"([^"]+)"')

# Легаси-алиасы: исторические who-id пяти ранних строковых спикеров — те же
# who_codes лежат в каст-yaml (registry/casts/*/*.yaml), менять их нельзя.
LEGACY_WHO = {
    'Orc': 'orc',
    'Gorak': 'gor',
    'Raza': 'raza',
    'Basilisk': 'bsk',
    'Woodland Spirit': 'wsp',
}


# Автосlug — общий с реестром who_map (фолбэк для спикеров вне реестра).
slug_who = who_map.slug_who


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


def parse_game():
    """Parse ALL game/*.rpy -> speaker maps.

    Бага 2026-10-20 (фиксируется здесь): раньше читался только script.rpy
    (replay_gallery.rpy был не виден), строковые спикеры вне хардкод-списка
    проваливались в NARR_RE с искажённым ключом (кто затёрт), а
    old_who.setdefault оставлял первого победившего спикера (коллизии текстов).

    Возвращает:
      text_speakers — {text: set(who_id | None)}: все спикеры текста
                      (None — есть нарраторское вхождение);
      text_labels   — {text: set(label)};
      menu_texts    — set(текстов-выборов меню);
      labels        — все label'ы всех файлов;
      char_names    — {who_id: отображаемое имя} (define + строковые).
    """
    game_dir = os.path.dirname(SCRIPT)
    text_speakers = defaultdict(set)
    text_labels = defaultdict(set)
    menu_texts = set()
    labels = []
    char_names = {}
    define_by_display = {}
    # Реестр who_map — источник истины имён (LEGACY_WHO/define — фолбэки).
    defines = {}
    for path in sorted(glob.glob(os.path.join(game_dir, '*.rpy'))):
        with open(path, encoding='utf-8', errors='replace') as f:
            for line in f:
                m = DEFINE_RE.match(line)
                if m:
                    defines[m.group(1)] = m.group(2)
    reg_exact, reg_cf = who_map.name_index(defines=defines)
    # Точечные uid-исключения (registry/overrides.jsonl): размеченные реплики
    # со спикером-маской Voice, принадлежащие реальным персонажам.
    uid_overrides = who_map.override_by_uid()
    for path in sorted(glob.glob(os.path.join(game_dir, '*.rpy'))):
        label = None
        with open(path, encoding='utf-8', errors='replace') as f:
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
                define_by_display[m.group(2)] = m.group(1)
                continue
            m = MENU_RE.match(line)
            if m and label is not None:
                menu_texts.add(unescape(m.group(1)))
                continue
            m = SAY_STRING_RE.match(line)
            if m:
                # ВСЕ строковые спикеры, а не белый список 5 имён:
                # легаси-алиас -> define с тем же именем -> автосlug.
                speaker = m.group(1)
                text = unescape(m.group(2))
                who = (reg_exact.get(speaker)
                       or reg_cf.get(speaker.casefold())
                       or LEGACY_WHO.get(speaker)
                       or define_by_display.get(speaker)
                       or slug_who(speaker))
                who = uid_overrides.get(
                    hashlib.md5(text.encode('utf-8')).hexdigest(), who)
                char_names.setdefault(who, speaker)
                text_speakers[text].add(who)
                text_labels[text].add(label)
                continue
            m = SAY_RE.match(line)
            if m:
                who, text = m.group(1), unescape(m.group(2))
                who = uid_overrides.get(
                    hashlib.md5(text.encode('utf-8')).hexdigest(), who)
                text_speakers[text].add(who)
                text_labels[text].add(label)
                continue
            m = NARR_RE.match(line)
            if m:
                text = unescape(m.group(1))
                text_speakers[text].add(None)
                text_labels[text].add(label)
    return text_speakers, text_labels, menu_texts, labels, char_names


def write_delta_manifests(old_jsonl, entries):
    """added/changed/dropped uid-манифесты: прежний каталог vs свежая сборка.

    added   — uid только в свежем каталоге (новые строки: генерировать ru+en);
    changed — uid в обоих, но ru-текст new отличается (переозвучить ru --force;
              en-текст old по определению не менялся — uid = md5(old));
    dropped — uid только в прежнем (сироты-кандидаты на чистку audio/vo_*).

    Пишет tmp/voice_delta/{added,changed,dropped}.txt (по uid на строку,
    gitignored tmp/ репы) и печатает сводку.
    """
    # Сравнение по (uid, who): один uid может обслуживать несколько спикеров
    # (манифесты остаются на уровне uid — voice_batch --uid переозвучивает
    # все варианты слова сразу).
    old_pairs = {}
    with open(old_jsonl, encoding='utf-8') as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            rec = json.loads(line)
            if 'uid' in rec:
                old_pairs[(rec['uid'], rec.get('who'))] = rec
    new_pairs = {(e['uid'], e['who']): e for e in entries}
    added = sorted({u for u, _w in set(new_pairs) - set(old_pairs)})
    dropped = sorted({u for u, _w in set(old_pairs) - set(new_pairs)})
    changed = sorted({u for (u, _w) in set(new_pairs) & set(old_pairs)
                      if old_pairs[(u, _w)].get('new')
                      != new_pairs[(u, _w)].get('new')})
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
    print('parsing game scripts ...')
    text_speakers, old_labels, menu_texts, labels, char_names = parse_game()
    print('  say texts in game: {}'.format(len(text_speakers)))
    print('  labels: {}'.format(len(labels)))
    print('  menu texts: {}'.format(len(menu_texts)))
    print('  characters: {}'.format(len(char_names)))

    # Одна запись на (uid, who): один и тот же текст могут говорить несколько
    # персонажей («привет»-кейс) — каждому своё аудио uid__{variant}.
    # Меню и UI всегда одна запись без спикера; смешанные нарратор+персонаж
    # тексты получают и narration-запись, и записи говорящих.
    seen = set()
    conflicts = []
    entries = []
    for e in tl_entries:
        old = e['old']
        rel = e['rel']
        speakers = set(text_speakers.get(old, set()))
        narr = (None in speakers) or not speakers
        who_set = sorted(speakers - {None})
        if rel.startswith(SKIP_FILES):
            pairs = [(None, 'ui')]
        else:
            # Пункт меню, который персонаж тут же проговаривает (частый паттерн
            # автора: "Tell me.": → s "Tell me.") — и меню, и реплики с автором.
            pairs = []
            if old in menu_texts:
                pairs.append((None, 'menu'))
            if who_set:
                pairs.extend((w, 'dialogue') for w in who_set)
            if narr and (who_set or not pairs):
                pairs.append((None, 'narration'))
        uid = hashlib.md5(old.encode('utf-8')).hexdigest()
        if old in old_labels and len(old_labels[old]) > 1:
            conflicts.append(dict(uid=uid, old=old, labels=sorted(old_labels[old])))
        for who, category in pairs:
            key = (uid, who)
            if key in seen:
                continue
            seen.add(key)
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

    # Покрытие голосами: какие who-id (реплики) пока не привязаны ни к одному
    # касту в voice_candidates — их нельзя отдавать в генерацию.
    from voicekit.catalog import who_to_voice
    wm = who_to_voice()
    who_ids = {e['who'] for e in entries if e['who']}
    unvoiced = sorted(w for w in who_ids if w not in wm)
    print('=== who-id без привязки к касту: {} ==='.format(len(unvoiced)))
    for w in unvoiced:
        print('  {:28s} {} (реплик: {})'.format(
            w, char_names.get(w, '?'),
            sum(1 for e in entries if e['who'] == w)))


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
