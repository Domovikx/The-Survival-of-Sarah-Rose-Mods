"""Контракт каста voice_candidates/{Name}/{Name}.yaml.

Контрактные поля валидируются строго; отчёт-поля (status, last_run, ...)
проходят свободно (extra='allow') — «свои поля для своих дел».
"""

import os

import yaml

from . import paths

try:
    from pydantic import BaseModel, ConfigDict, Field

    class CastContract(BaseModel):
        model_config = ConfigDict(extra='allow')

        name: str
        gender: str = '?'
        age: str = '?'
        who: str = ''
        who_codes: list = Field(default_factory=list)
        instruct_en: str = ''
        instruct_ru: str = ''
        texts: list = Field(default_factory=list)

    PYDANTIC = True
except ImportError:
    PYDANTIC = False

    class CastContract(dict):
        pass


def validate_file(path):
    """(model, None) или (None, ошибка). model=None при отсутствии pydantic."""
    if not os.path.exists(path):
        return None, 'файл не найден'
    with open(path, encoding='utf-8') as f:
        data = yaml.safe_load(f) or {}
    if not isinstance(data, dict):
        return None, 'не объект'
    if not PYDANTIC:
        return None, 'pydantic не установлен'
    try:
        return CastContract.model_validate(data), None
    except Exception as e:
        return None, str(e)


def validate_cast_dir():
    """(ok: [(name, model)], errors: [(name, ошибка)]) по всем кастам."""
    ok, errors = [], []
    for name in paths_casts():
        m, err = validate_file(paths.char_yaml(name))
        if err:
            errors.append((name, err))
        else:
            ok.append((name, m))
    return ok, errors


def paths_casts():
    if not os.path.isdir(paths.VOICE_CANDIDATES):
        return []
    out = []
    for name in sorted(os.listdir(paths.VOICE_CANDIDATES)):
        d = os.path.join(paths.VOICE_CANDIDATES, name)
        if os.path.isdir(d) and os.path.exists(os.path.join(d, name + '.yaml')):
            out.append(name)
    return out


def export_schema(out_path):
    """JSON Schema контракта -> файл (для IDE-автокомплита yaml)."""
    import json
    if not PYDANTIC:
        return False
    schema = CastContract.model_json_schema()
    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    with open(out_path, 'w', encoding='utf-8') as f:
        json.dump(schema, f, ensure_ascii=False, indent=2)
    return True