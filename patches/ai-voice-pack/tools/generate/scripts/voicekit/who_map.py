# -*- coding: utf-8 -*-
"""who_map: реестр «кто есть кто» — единый источник истины спикеров игры.

Игра (установка) даёт идентичность (define + строковые спикеры), касты
(voice_candidates) — голоса, а реестр связывает одно с другим и переживает
апдейты игры (rename/опечатки/новые ипостаси).

Одна строка who_map.jsonl = один персонаж; хранится ТОЛЬКО дельта от дефолта
(DRY — всё производное выводится из игры и кастов при загрузке):

  character    — каноническое имя персонажа (ключ записи; джойн с папкой
                 каста 1:1);
  define       — define-id из игры (["s"]; [] у строковых спикеров);
  who          — ТОЛЬКО если отличается от производного (легаси-код: bsk, orc;
                 дефолт: define[0], иначе slug(character));
  names        — ТОЛЬКО лишние игровые написания (опечатки, будущие rename;
                 дефолт = [character]);
  voice        — ТОЛЬКО если ≠ character (реюзы/пулы; дефолт: каст-папка
                 с именем character);
  status       — ТОЛЬКО если не выводится (deprecated; дефолт: active при
                 наличии голоса, иначе pending-voice);
  entity       — «один персонаж — N ключей» (void-god: Voice/Master/Daemon);
  merged_into  — для deprecated-дублей: имя character-канона;
  note         — почему запись такая (обязательно для deprecated).

Сборочные артефакты (voices.jsonl, voice_list.json) остаются ДЕРИВИРОВАННЫМИ;
реестр — руками/инструментами поддерживаемый источник. Bootstrap-скRIPT
(who_map_bootstrap.py) умеет освежать авто-поля после апдейта игры, сохраняя
ручные (entity/note/merged_into/ручной voice).
"""

import json
import os

from voicekit import paths

WHO_MAP_PATH = os.path.join(paths.ROOT, 'registry', 'who_map.jsonl')
OVERRIDES_PATH = os.path.join(paths.ROOT, 'registry', 'overrides.jsonl')


def load(path=None):
    """character -> запись реестра (пустой dict, если файла ещё нет)."""
    path = path or WHO_MAP_PATH
    records = {}
    if not os.path.isfile(path):
        return records
    with open(path, encoding='utf-8') as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            rec = json.loads(line)
            records[rec['character']] = rec
    return records


def slug_who(name):
    """Автосlug: 'Guard Captain' -> 'guard-captain' (дефолтный who для строковых)."""
    import re
    s = re.sub(r'[^A-Za-z0-9]+', '-', name.strip().lower()).strip('-')
    return s or 'unknown'


def resolve(records=None, defines=None, vc_dir=None):
    """Полные записи из декларативных дельт: дефолты из игры и кастов.

    defines  — {define-id: display} игры (для вывода who);
    vc_dir   — каталог кастов (для вывода voice по имени character).
    Возвращает {who: record} с полями character/who/kind/names/voice/status
    + декларативные поля файла (entity/note/merged_into/ручные who/names/...).
    """
    defines = defines or {}
    by_disp = {d: i for i, d in defines.items()}
    vc = vc_dir or paths.VOICE_CANDIDATES
    out = {}
    for rec in (load() if records is None else records).values():
        r = dict(rec)
        ch = r['character']
        define_ids = list(r.get('define') or [])
        did = define_ids[0] if define_ids else (by_disp.get(ch) if defines else None)
        slug = slug_who(ch)
        r['define'] = define_ids
        r['who'] = r.get('who') or did or slug
        r['kind'] = 'define' if did else ('legacy' if r['who'] != slug else 'string')
        r['names'] = [ch] + [n for n in r.get('names', []) if n != ch]
        if 'voice' not in r:
            r['voice'] = ch if os.path.isdir(os.path.join(vc, ch)) else None
        r.setdefault('status', 'active' if r['voice'] else 'pending-voice')
        out[r['who']] = r
    return out


def name_index(records=None, defines=None):
    """Все игровые написания -> who-id: (точный индекс, casefold-фолбэк).

    Deprecated-дубли индексируются С ПЕРЕНАПРАВЛЕНИЕМ на канон (merged_into):
    опечатки игры (Emmissary/Court Offical) продолжают резолвиться, пока
    записи не удалим после миграции.
    """
    resolved = resolve() if records is None else records
    target_by_character = {r['character']: r['who'] for r in resolved.values()}
    exact = {}
    cf = {}
    for who, rec in resolved.items():
        target = target_by_character.get(rec.get('merged_into') or '', None) or who
        keys = [who] + list(rec.get('names') or []) + list(rec.get('legacy') or [])
        for name in keys:
            exact.setdefault(name, target)
            cf.setdefault(name.casefold(), target)
    return exact, cf


def overrides(path=None):
    """Точечные исключения парсера: [{uid, old, who, note}, ...]."""
    path = path or OVERRIDES_PATH
    items = []
    if not os.path.isfile(path):
        return items
    with open(path, encoding='utf-8') as f:
        for line in f:
            line = line.strip()
            if line:
                items.append(json.loads(line))
    return items


def override_by_uid(path=None):
    """uid -> who (для применения на сборке каталога)."""
    return {o['uid']: o['who'] for o in overrides(path) if o.get('uid')}
