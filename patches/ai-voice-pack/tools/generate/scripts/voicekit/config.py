"""Доступ к voice_presets.mts — единой карте конфигов озвучки.

Источник истины — TS-модуль scripts/voice_presets.mts (yaml-файл
config/voice_presets.yaml в корне репы удалён при миграции 2026-10-21 —
конфиг переехал к скриптам и переписан на TS). python читает JSON-дамп:
`node voice_presets.mts` печатает весь конфиг; ответ кэшируется на процесс.
Если файла нет или node недоступен — {} и потребители используют свои
фолбэк-дефолты.

Использование:
  cfg = config.load()            # весь словарь (кэшируется)
  cfg = config.section('batch')  # секция (dict, или {})
  cfg = config.preset('beastify', 'orc')  # пресет (dict, или {})
  val = config.get('design', 'temperature', 0.9)  # значение с дефолтом
"""

import json
import os
import subprocess

from . import paths

_CACHE = None


def load():
    """Весь конфиг (кэшируется после первого чтения)."""
    global _CACHE
    if _CACHE is None:
        data = {}
        p = paths.PRESETS_MTS
        if os.path.exists(p):
            try:
                out = subprocess.check_output(['node', p], encoding='utf-8')
                loaded = json.loads(out)
                if isinstance(loaded, dict):
                    data = loaded
            except Exception:
                data = {}
        _CACHE = data
    return _CACHE


def section(name):
    """Секция конфига (например 'batch') -> dict (или {})."""
    d = load().get(name)
    return d if isinstance(d, dict) else {}


def preset(group, name):
    """Пресет внутри секции (например beastify/orc) -> dict (или {})."""
    p = section(group).get(name)
    return p if isinstance(p, dict) else {}


def get(group, key, default=None):
    """Значение ключа секции с дефолтом."""
    return section(group).get(key, default)
