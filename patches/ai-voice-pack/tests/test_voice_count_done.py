"""Тесты подсчёта готовых файлов: стем wav|opus считается один раз.

Корпус смешанный (легаси-wav + новые opus-only) — счётчики статуса/пульта
должны считать реплики, а не файлы: пара wav+opus = одна реплика.
"""

import os

import voice_status
import voice_ctl


UID1 = '0' * 32
UID2 = '1' * 32
UID3 = '2' * 32
UID4 = '3' * 32
UID5 = '4' * 32


def make_corpus(root):
    """ai_voice/{lang}/{arc}/ со смешанным корпусом."""
    arc = os.path.join(root, 'ru', 'Prologue')
    os.makedirs(arc)
    # пара wav+opus (легаси после конвертации) -> одна реплика
    open(os.path.join(arc, UID1 + '__Sarah.wav'), 'wb').close()
    open(os.path.join(arc, UID1 + '__Sarah.opus'), 'wb').close()
    # opus-only (новая генерация) -> реплика
    open(os.path.join(arc, UID2 + '__Sarah.opus'), 'wb').close()
    # wav-only (не сконвертирован) -> реплика
    open(os.path.join(arc, UID3 + '__Narrator.wav'), 'wb').close()
    # сирота loudnorm -> НЕ реплика
    open(os.path.join(arc, UID4 + '__Narrator.wav.ln.tmp.wav'), 'wb').close()
    # недописанный .part -> НЕ реплика
    open(os.path.join(arc, UID5 + '__Narrator.opus.part'), 'wb').close()


def test_voice_status_count_done_mixed(tmp_path, monkeypatch):
    make_corpus(str(tmp_path))
    monkeypatch.setattr(voice_status.paths, 'AI_VOICE_DIR', str(tmp_path))
    made, total = voice_status.count_done('ru')
    assert made['Prologue'] == 3
    assert total == 3
    made_en, total_en = voice_status.count_done('en')
    assert total_en == 0  # каталога en нет


def test_voice_status_char_made_stem_dedup(tmp_path, monkeypatch):
    make_corpus(str(tmp_path))
    monkeypatch.setattr(voice_status.paths, 'AI_VOICE_DIR', str(tmp_path))
    out = voice_status.char_made()
    assert out['Sarah'] == 2  # пара + opus-only
    assert out['Narrator'] == 1  # wav-only, сирота не считается


def test_voice_ctl_count_done_mixed(tmp_path, monkeypatch):
    # voice_ctl считает от ROOT/ai_voice (voice_status — от AI_VOICE_DIR)
    make_corpus(os.path.join(str(tmp_path), 'ai_voice'))
    monkeypatch.setattr(voice_ctl, 'ROOT', str(tmp_path))
    assert voice_ctl.count_done('ru') == 3
    assert voice_ctl.count_done('ru', arc='Prologue') == 3
    assert voice_ctl.count_done('en') == -1  # каталога нет
    assert voice_ctl.count_done('ru', arc='Nope') == -1


def test_voice_ctl_count_done_empty(tmp_path, monkeypatch):
    monkeypatch.setattr(voice_ctl, 'ROOT', str(tmp_path))
    os.makedirs(os.path.join(str(tmp_path), 'ai_voice', 'ru'))
    assert voice_ctl.count_done('ru') == 0
