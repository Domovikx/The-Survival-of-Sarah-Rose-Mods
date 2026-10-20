# -*- coding: utf-8 -*-
"""Bootstrap who_map.jsonl: сборка реестра из текущего состояния игры и кастов.

Схема DRY: запись хранит только дельту от дефолта (who — только легаси,
voice — только если ≠ character, names — только лишние написания, status —
только deprecated). Повторный запуск после апдейта игры добавляет НОВЫХ
персонажей и НЕ трогает рукописные дельты существующих записей.
"""
import glob
import io
import json
import os
import re
import sys

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from voicekit import who_map  # noqa: E402

# Легаси: исторические короткие who-id (касты используют эти who_codes).
LEGACY = {'Orc': 'orc', 'Gorak': 'gor', 'Raza': 'raza',
          'Basilisk': 'bsk', 'Woodland Spirit': 'wsp'}

# Deprecated-дубли игры (опечатки): удалим после миграции реестра.
SEEDS = [
    {'character': 'Emmissary', 'status': 'deprecated', 'merged_into': 'Emissary',
     'note': 'Опечатка игры (33 реплики), сшита в Emissary; '
             'удалить после миграции реестра.'},
    {'character': 'Court Offical', 'status': 'deprecated',
     'merged_into': 'Court Official',
     'note': 'Опечатка игры (1 реплика), сшита в Court Official; '
             'удалить после миграции реестра.'},
]

# «Один персонаж — N ключей» (предварительно, на утверждение владельца).
ENTITY = 'void-god'
ENTITY_NOTES = {
    'Voice': 'Тег-маска «голос из ниоткуда»: ~80 строк = существо (entity void-god), '
             'остальные — чужие персонажи (см. registry/overrides.jsonl).',
    'Master': 'Повелитель/«A God» арок Black Monolith/Demon; самоприсвоенный титул '
              '(script.rpy:83482). Тот же entity, что Voice и Daemon — '
              'на утверждении владельцем.',
    'Daemon': 'Demon-арка: реплики того же существа под именем Daemon; '
              'голос каста Daemon.',
}
DUAL_NOTES = {
    'Sarah and Thomas in unison': 'Дуэт: Сара+Томас одновременно — нужен дуэтный кейс.',
    'Both': '«Both» — одновременная речь двух персонажей, нужен дуэтный кейс.',
}

DEFINE_RE = re.compile(r'^define\s+(\w+)\s*=\s*Character\(\s*"([^"]+)"')
STRING_SAY_RE = re.compile(r'^\s*"([^"]+)"\s+"((?:[^"\\]|\\.)*)"')


def scan_game(game_dir):
    """(defines [(id, display)] в порядке игры, строки-спикеры [display] по
    первому появлению)."""
    defines = []
    strings = []
    seen = set()
    for path in sorted(glob.glob(os.path.join(game_dir, '*.rpy'))):
        with io.open(path, encoding='utf-8', errors='replace') as f:
            for line in f:
                m = DEFINE_RE.match(line)
                if m:
                    defines.append((m.group(1), m.group(2)))
                    continue
                m = STRING_SAY_RE.match(line)
                if m and m.group(1) not in seen:
                    seen.add(m.group(1))
                    strings.append(m.group(1))
    return defines, strings


def main():
    from voicekit import paths
    game_dir = os.path.join(paths.GAME_INSTALL, 'game')
    defines_list, strings = scan_game(game_dir)
    print('game: define {}, строковых спикеров {}'.format(
        len(defines_list), len(strings)))

    # авто-дельта каждой character: define из игры (+ легаси who)
    auto = {}
    for did, disp in defines_list:
        auto[disp] = {'character': disp, 'define': [did]}
    for disp in strings:
        auto.setdefault(disp, {'character': disp, 'define': []})
    for disp in LEGACY:
        if disp in auto:
            auto[disp]['who'] = LEGACY[disp]

    existing = who_map.load()  # рукописные дельты — не трогаем
    merged = {}
    for ch, a in auto.items():
        if ch in existing:
            rec = dict(existing[ch])  # ручные who/names/voice/status/entity/note
            rec['define'] = a['define']  # освежаем только define
        else:
            rec = dict(a)
        merged[ch] = rec
    for seed in SEEDS:
        # опечаточник — это спикер игры: сид перекрывает обычную запись,
        # сохраняя освежённый define
        rec = dict(merged.get(seed['character'], {}))
        rec.update(seed)
        merged[seed['character']] = rec
    for ch, note in ENTITY_NOTES.items():
        if ch in merged:
            merged[ch].setdefault('entity', ENTITY)
            merged[ch].setdefault('note', note)
    for ch, note in DUAL_NOTES.items():
        if ch in merged:
            merged[ch].setdefault('note', note)

    # порядок записи: как в игре — define-блок (порядок script.rpy), затем
    # строковые по первому появлению, затем сиды.
    order = [d for _i, d in defines_list] + strings + [s['character'] for s in SEEDS]
    seen = set()
    ordered = []
    for ch in order + sorted(merged):
        if ch in merged and ch not in seen:
            seen.add(ch)
            ordered.append(ch)

    path = who_map.WHO_MAP_PATH
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, 'w', encoding='utf-8', newline='\n') as f:
        for ch in ordered:
            f.write(json.dumps(merged[ch], ensure_ascii=False) + '\n')

    # сводка по производным статусам
    resolves = who_map.resolve(defines=dict(defines_list))
    counts = {}
    for rec in resolves.values():
        counts[rec['status']] = counts.get(rec['status'], 0) + 1
    print('wrote {} (записей: {}, новых персонажей: {})'.format(
        path, len(merged), len(set(auto) - set(existing))))
    for status, n in sorted(counts.items()):
        print('  {}: {}'.format(status, n))
    print('  entity {} ключей: {}'.format(
        ENTITY, ', '.join(sorted(r['character'] for r in resolves.values()
                                 if r.get('entity') == ENTITY))))


if __name__ == '__main__':
    main()
