"""Тесты пульта tools/voice_ctl.py (только чистые хелперы, без процессов)."""

import pytest

import voice_ctl


def test_norm_langs():
    assert voice_ctl.norm_langs(None) == ['ru', 'en']
    assert voice_ctl.norm_langs('all') == ['ru', 'en']
    assert voice_ctl.norm_langs('ru') == ['ru']
    assert voice_ctl.norm_langs('en') == ['en']
    with pytest.raises(ValueError):
        voice_ctl.norm_langs('de')


def test_parse_progress_line():
    assert voice_ctl.parse_progress_line(
        '[5139/5207] 1633b069 UnionKingdom Sarah: текст') == (5139, 5207)
    assert voice_ctl.parse_progress_line('  saved ... wav (2.7s)') is None
    assert voice_ctl.parse_progress_line('=== START ru Prologue 13:46 ===') is None
    assert voice_ctl.parse_progress_line('') is None


def test_parse_log_state_active():
    text = ('=== START ru Prologue 07:25 ===\n'
            '=== DONE ru Prologue 07:25 ===\n'
            '=== START ru UnionKingdom 07:26 ===\n'
            '[5138/5207] fa38ff35 UnionKingdom Sarah: текст\n'
            '[5139/5207] 1633b069 UnionKingdom Sarah: текст\n')
    arc, prog = voice_ctl.parse_log_state(text)
    assert arc == 'UnionKingdom'
    assert prog == (5139, 5207)


def test_parse_log_state_done():
    text = ('=== START ru UnionKingdom 16:47 ===\n'
            '=== DONE ru UnionKingdom 07:22 ===\n')
    arc, prog = voice_ctl.parse_log_state(text)
    assert arc is None
    assert prog is None


def test_parse_log_state_empty():
    assert voice_ctl.parse_log_state('') == (None, None)


def test_format_age():
    assert voice_ctl.format_age(12) == '12 сек'
    assert voice_ctl.format_age(300) == '5 мин'
    assert voice_ctl.format_age(7200) == '2 ч'
    assert voice_ctl.format_age(259200) == '3 дн'


def test_count_saved():
    assert voice_ctl.count_saved('') == 0
    text = ('[1/2] a Arc Who: текст\n'
            '  saved out/a.wav (1.0s), eta ~1 мин\n'
            '[2/2] b Arc Who: текст\n'
            '  saved out/b.wav (2.0s), eta ~0 мин\n')
    assert voice_ctl.count_saved(text) == 2
    assert voice_ctl.count_saved('[1/2] a Arc Who: текст\n') == 0


def test_main_no_args_runs_status(capsys):
    rc = voice_ctl.main([])
    assert rc == 0
    out = capsys.readouterr().out
    assert 'RU' in out and 'EN' in out
