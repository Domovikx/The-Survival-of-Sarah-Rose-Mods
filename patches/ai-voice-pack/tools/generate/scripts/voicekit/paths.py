"""Раскладка проекта — ЕДИНСТВЕННОЕ место, где живут пути.

Структура voice_candidates/{Name}/:
  generated/     сырьё от voice_design (01.mp3, 02.mp3, ...)
  gen_selected/  отобранные вручную ({Name}.mp3, {Name}_1.mp3)
  {Name}.wav     АКТИВНЫЙ реф в корне каста (voices.yaml ссылается сюда);
                 варианты A/B рядом: {Name}_1.wav, {Name}_2.wav (неактивные)

Правило: скриптам запрещено хардкодить пути — только через этот модуль.
"""

import os

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

TOOLS_DIR = os.path.join(ROOT, 'tools')
VOICE_CANDIDATES = os.path.join(ROOT, 'voice_candidates')
CATALOG_DIR = os.path.join(ROOT, 'catalog')
CONFIG_DIR = os.path.join(ROOT, 'config')
OUTPUT_DIR = os.path.join(ROOT, 'output')
AI_VOICE_DIR = os.path.join(ROOT, 'ai_voice')

VOICES_JSON = os.path.join(CATALOG_DIR, 'voices.json')
VOICE_LIST_JSON = os.path.join(CATALOG_DIR, 'voice_list.json')
LABEL_ARC_JSON = os.path.join(CATALOG_DIR, 'label_arc.json')
CAST_SUMMARY_YAML = os.path.join(VOICE_CANDIDATES, 'voice_candidates.yaml')
MISSING_VOICES_MD = os.path.join(CATALOG_DIR, 'missing_voices.md')
SYNC_REPORT_MD = os.path.join(CATALOG_DIR, 'voice_sync_report.md')

CHAR_SUBDIRS = ('generated', 'gen_selected')


def char_dir(name):
    return os.path.join(VOICE_CANDIDATES, name)


def char_subdir(name, sub):
    if sub not in CHAR_SUBDIRS:
        raise ValueError('неизвестная подпапка: {!r}'.format(sub))
    return os.path.join(char_dir(name), sub)


def char_yaml(name):
    return os.path.join(char_dir(name), name + '.yaml')


def ref_active(name):
    return os.path.join(char_dir(name), name + '.wav')


def ref_voices(name):
    return 'voice_candidates/{}/{}.wav'.format(name, name)


def ref_variant(name, variant):
    """Путь A/B-варианта в корне каста ({Name}_{variant}.wav)."""
    return os.path.join(char_dir(name), '{}_{}.wav'.format(name, variant))


def resolve_ref(ref):
    return ref if os.path.isabs(ref) else os.path.join(ROOT, ref)


def batch_log():
    return os.path.join(OUTPUT_DIR, 'voice', 'batch.log')