"""Тесты voicekit: пути, контракт, безопасные операции."""

import os
import sys

import pytest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, 'tools', 'generate', 'scripts'))

from voicekit import catalog, contract, fs, paths  # noqa: E402


def test_paths_layout():
    assert paths.ROOT == os.path.join(ROOT, 'tools', 'generate')
    assert paths.PRESETS_MTS == os.path.join(
        paths.SCRIPTS_DIR, 'voice_presets.mts')
    assert os.path.normpath(paths.char_dir('Alaric')).endswith(
        os.path.normpath('casts/Alaric'))
    assert os.path.normpath(paths.ref_active('Alaric')).endswith(
        os.path.normpath('casts/Alaric/Alaric.wav'))
    assert paths.ref_voices('Alaric') == \
        'casts/Alaric/Alaric.wav'
    assert os.path.normpath(paths.ref_variant('Alaric', '3')).endswith(
        os.path.normpath('casts/Alaric/Alaric_3.wav'))
    # легаси-префикс registry/casts/ (старый дом БД) редиректится в casts/
    assert os.path.normpath(paths.resolve_ref(
        'registry/casts/Alaric/Alaric.wav')) == os.path.normpath(
        os.path.join(paths.PKG_ROOT, 'casts', 'Alaric', 'Alaric.wav'))
    with pytest.raises(ValueError):
        paths.char_subdir('Alaric', 'nope')


def test_char_subdirs_all_valid():
    for sub in paths.CHAR_SUBDIRS:
        assert os.path.normpath(paths.char_subdir('X', sub)).startswith(
            os.path.normpath(paths.char_dir('X')))


def test_contract_valid():
    text = dict(text='Я пошёл туда.', emotion_en='Simply, in passing',
                emotion_ru='Мимоходом, между делом')
    data = dict(name='Alaric', gender='M', age='25-30', who='жулик',
                instruct_en='Male baritone', texts=[text])
    m, err = contract.validate_file.__wrapped__ if False else (None, None)
    import yaml
    import tempfile
    with tempfile.NamedTemporaryFile('w', suffix='.yaml', delete=False,
                                     encoding='utf-8') as f:
        yaml.dump(data, f, allow_unicode=True)
        p = f.name
    try:
        model, err = contract.validate_file(p)
        if contract.PYDANTIC:
            assert err is None and model.name == 'Alaric'
            extra = dict(data, status={'ref': 'Alaric.wav'})
            with open(p, 'w', encoding='utf-8') as f:
                yaml.dump(extra, f, allow_unicode=True)
            model2, err2 = contract.validate_file(p)
            assert err2 is None
            assert model2.status == {'ref': 'Alaric.wav'}
    finally:
        os.unlink(p)


def test_contract_invalid():
    import yaml
    import tempfile
    cases = [
        'name: 123\n',                                    # name должен быть строкой
        'name: X\ntexts:\n- старый формат-строка\n',      # CastText только dict
        'name: X\ntexts:\n- text: фраза\n',               # emotion_en/ru обязательны
    ]
    for i, content in enumerate(cases):
        with tempfile.NamedTemporaryFile('w', suffix='.yaml', delete=False,
                                         encoding='utf-8') as f:
            f.write(content)
            p = f.name
        try:
            _, err = contract.validate_file(p)
            if contract.PYDANTIC:
                assert err is not None, 'case {}: ждали ошибку'.format(i)
        finally:
            os.unlink(p)


def test_fs_ops_dry_run_creates_nothing(tmp_path):
    ops = fs.Ops(apply=False)
    target = tmp_path / 'generated'
    ops.ensure_dir(str(target))
    assert not target.exists()
    ops2 = fs.Ops(apply=True)
    ops2.ensure_dir(str(target))
    assert target.is_dir()


def test_fs_move_skip_existing(tmp_path):
    src = tmp_path / 'a.wav'
    dst = tmp_path / 'b.wav'
    src.write_bytes(b'1')
    dst.write_bytes(b'2')
    ops = fs.Ops(apply=True)
    assert not ops.move(str(src), str(dst))
    assert src.exists() and dst.read_bytes() == b'2'


def test_fs_move_applies(tmp_path):
    src = tmp_path / 'a.wav'
    src.write_bytes(b'1')
    ops = fs.Ops(apply=True)
    assert ops.move(str(src), str(tmp_path / 'sub' / 'b.wav'))
    assert (tmp_path / 'sub' / 'b.wav').exists()
    assert not src.exists()


def test_catalog_cast_names_ok():
    names = catalog.cast_names()
    assert 'Alaric' in names
    assert 'Carolyn' in names


def test_catalog_who_to_voice():
    m = catalog.who_to_voice()
    assert m.get('narrator') == 'Narrator'
    assert m.get('al') == 'Alaric'