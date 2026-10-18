"""Загрузка config/voice_presets.yaml — единой карты конфигов озвучки.

Использование:
  cfg = config.load()            # весь словарь (кэшируется)
  cfg = config.section('batch')  # секция (dict, или {})
  cfg = config.preset('beastify', 'orc')  # пресет (dict, или {})
  val = config.get('design', 'temperature', 0.9)  # значение с дефолтом

Если файла нет — секции пустые, скрипты используют свои фолбэк-дефолты.
"""

import os

import yaml

from . import paths

_CACHE = None


def load():
    """Весь конфиг (кэшируется после первого чтения)."""
    global _CACHE
    if _CACHE is None:
        p = os.path.join(paths.CONFIG_DIR, 'voice_presets.yaml')
        data = {}
        if os.path.exists(p):
            try:
                with open(p, encoding='utf-8') as f:
                    loaded = yaml.safe_load(f)
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