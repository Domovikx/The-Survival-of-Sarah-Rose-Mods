"""Тесты voice_autocommit: парсинг porcelain, settled по возрасту."""

import os

from voice_autocommit import _unquote, parse_porcelain, settled


def test_parse_plain_sorted():
    out = ('?? ai_voice/ru/B/b.wav\n'
           '?? ai_voice/ru/A/a.wav\n'
           'M  tools/x.py\n')
    assert parse_porcelain(out) == ['ai_voice/ru/A/a.wav',
                                    'ai_voice/ru/B/b.wav']


def test_parse_keeps_spaces_unquoted():
    # с core.quotePath=false пробелы идут как есть (раньше были кавычки
    # и settled() не находил файл на диске)
    out = ('?? ai_voice/en/SailorPath/00e4__Captain Belmont.wav\n')
    assert parse_porcelain(out) == [
        'ai_voice/en/SailorPath/00e4__Captain Belmont.wav']


def test_parse_strips_git_quotes():
    # porcelain квотит пути с пробелами даже при quotePath=false
    out = ('?? "ai_voice/en/SailorPath/00e4__Captain Belmont.wav"\n')
    assert parse_porcelain(out) == [
        'ai_voice/en/SailorPath/00e4__Captain Belmont.wav']


def test_unquote_octal_utf8():
    # \303\251 = UTF-8 байты é
    assert _unquote('"caf\\303\\251.wav"') == 'café.wav'
    assert _unquote('plain.wav') == 'plain.wav'
    assert _unquote('"a\\"b.wav"') == 'a"b.wav'


def test_parse_ignores_non_untracked():
    out = 'A  ai_voice/ru/A/a.wav\n!! ai_voice/ru/B/b.wav\n'
    assert parse_porcelain(out) == []


def test_settled_min_age(tmp_path, monkeypatch):
    import voice_autocommit as va
    old = tmp_path / 'old.wav'
    new = tmp_path / 'new.wav'
    old.write_bytes(b'x')
    new.write_bytes(b'y')
    monkeypatch.setattr(va, 'REPO_ROOT', str(tmp_path))
    now = os.path.getmtime(str(new))
    os.utime(str(old), (now - 600, now - 600))
    got = settled(['old.wav', 'new.wav', 'missing.wav'], 180)
    assert got == ['old.wav']
