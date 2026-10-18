"""Загрузка каталога реплик, конфига голосов и каста персонажей."""

import json
import os

import yaml

from . import paths


def load_catalog():
    """catalog/voices.json -> dict (entries, characters, totals, ...)."""
    with open(paths.VOICES_JSON, encoding='utf-8') as f:
        return json.load(f)


def load_voices():
    """{имя_голоса: {'who': [коды]}} из КАСТОВ (voice_candidates/{Name}.yaml).

    Озвучен = у каста есть активный реф {Name}.wav (правило, без voices.yaml).
    """
    out = {}
    for name in cast_names():
        if not os.path.exists(paths.ref_active(name)):
            continue
        cast = load_cast(name) or {}
        codes = cast.get('who_codes') or []
        out[name] = {'who': codes if isinstance(codes, list) else [codes]}
    return out


def save_voices(voices):
    """Совместимость: переносит who-коды в каст-yaml (voices.yaml не существует)."""
    for name, vcfg in (voices or {}).items():
        codes = vcfg.get('who') or []
        if isinstance(codes, str):
            codes = [codes]
        cast = load_cast(name) or {}
        if name not in cast_names():
            cast.setdefault('name', name)
        cast['who_codes'] = sorted(set(codes))
        save_cast(name, cast)


def who_to_voice(voices=None):
    """who-код -> имя голоса (из who_codes кастов с активным рефом)."""
    if voices is None:
        voices = load_voices()
    m = {}
    for vname, vcfg in voices.items():
        for w in vcfg.get('who', []) or []:
            m[w] = vname
    return m


def gen_voice_list_json():
    """catalog/voice_list.json для РАНТАЙМА (Ren'Py): имя -> variant, код -> имя.

    variant = имя персонажа (активный реф всегда {Name}.wav). Пишется при
    изменениях кастов (voice_sync report / voice_manage select / add_candidate).
    """
    voices = load_voices()
    names = {n: n for n in voices}
    by_who = {}
    for vname, vcfg in voices.items():
        for w in vcfg.get('who', []) or []:
            by_who[w] = vname
    doc = {'names': names, 'by_who': by_who,
           'narrator': 'Narrator' if 'Narrator' in voices else ''}
    os.makedirs(paths.CATALOG_DIR, exist_ok=True)
    out = os.path.join(paths.CATALOG_DIR, 'voice_list.json')
    with open(out, 'w', encoding='utf-8', newline='\n') as f:
        json.dump(doc, f, ensure_ascii=False, indent=1)
    return out


def load_cast(name):
    """voice_candidates/{Name}/{Name}.yaml -> dict (или None)."""
    p = paths.char_yaml(name)
    if not os.path.exists(p):
        return None
    with open(p, encoding='utf-8') as f:
        return yaml.safe_load(f) or {}


def save_cast(name, data):
    os.makedirs(paths.char_dir(name), exist_ok=True)
    with open(paths.char_yaml(name), 'w', encoding='utf-8', newline='\n') as f:
        yaml.dump(data, f, allow_unicode=True,
                  default_flow_style=False, sort_keys=False)


def cast_names():
    """Имена персонажей, у которых есть контракт {Name}.yaml."""
    if not os.path.isdir(paths.VOICE_CANDIDATES):
        return []
    out = []
    for name in sorted(os.listdir(paths.VOICE_CANDIDATES)):
        d = os.path.join(paths.VOICE_CANDIDATES, name)
        if os.path.isdir(d) and os.path.exists(os.path.join(d, name + '.yaml')):
            out.append(name)
    return out


def characters_by_category(categories=('dialogue', 'narration')):
    """{имя_персонажа: {dialogue: n, narration: n, arcs: set}} из каталога."""
    from collections import defaultdict
    data = load_catalog()
    lines = defaultdict(lambda: defaultdict(int))
    arcs = defaultdict(set)
    for e in data['entries']:
        if e['category'] not in categories:
            continue
        if e['category'] == 'narration':
            name = 'Narrator'
        else:
            name = e['who_name'] or e['who'] or '(unknown)'
        lines[name][e['category']] += 1
        arcs[name].add(e['arc'])
    return lines, arcs