"""Гарды выпила мёртвого python (задача 2026-10-24, применено 2026-11-01).

Риски, которые закрывают тесты:
1. `beastify.py` лишился импорта `levelnorm` — константы выравнивания
   (LOUD_I/LOUD_TP/LOUD_LRA) встроены и обязаны совпадать с дефолтами
   пайплайна (-16 / -1.5 / 11).
2. `voicekit/__init__.py` больше НЕ реэкспортирует contract/fs — импорт
   пакета обязан работать и без них.
3. Удалённые модули не возвращаются в дерево.
4. Остаток python компилируется (py_compile) — синтаксическая целостность
   после правок.
"""

import os
import py_compile

import pytest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SCRIPTS = os.path.join(ROOT, 'tools', 'generate', 'scripts')

DELETED = (
    'trim_tail_burst.py',
    'levelnorm.py',
    'gen_ui_round.py',
    'voice_autocommit.py',
    'voice-autocommit.cmd',
    os.path.join('voicekit', 'contract.py'),
    os.path.join('voicekit', 'fs.py'),
)


@pytest.mark.parametrize('rel', DELETED)
def test_deleted_module_is_gone(rel):
    assert not os.path.exists(os.path.join(SCRIPTS, rel)), f'{rel} вернулся в дерево'


def test_wake_at_23_gone():
    p = os.path.join(ROOT, 'tools', 'generate', 'output', 'voice', 'wake_at_23.py')
    assert not os.path.exists(p), 'wake_at_23.py вернулся в output/voice'


def test_all_remaining_py_compile():
    compiled = 0
    for base in (SCRIPTS, os.path.join(ROOT, 'tools', 'build')):
        for dirpath, dirnames, filenames in os.walk(base):
            dirnames[:] = [d for d in dirnames if d != '__pycache__']
            for f in filenames:
                if f.endswith('.py'):
                    py_compile.compile(os.path.join(dirpath, f), doraise=True)
                    compiled += 1
    assert compiled >= 10, f'скомпилировано всего {compiled} — остаток python уменьшился?'
    assert os.path.exists(os.path.join(SCRIPTS, 'cosyworker.py')), 'cosyworker.py — шим инференса'


def test_beastify_inlined_loud_constants():
    """Константы выравнивания встроены в beastify (были import из levelnorm)."""
    import beastify

    assert beastify.LOUD_I == -16.0
    assert beastify.LOUD_TP == -1.5
    assert beastify.LOUD_LRA == 11.0


def test_voicekit_imports_without_contract_fs():
    import voicekit

    assert not hasattr(voicekit, 'contract'), 'voicekit.contract должен быть удалён'
    assert not hasattr(voicekit, 'fs'), 'voicekit.fs должен быть удалён'
    for mod in ('paths', 'tts_env', 'model_dir'):
        assert hasattr(voicekit, mod), f'voicekit.{mod} обязан остаться'
