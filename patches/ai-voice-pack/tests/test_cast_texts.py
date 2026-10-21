# -*- coding: utf-8 -*-
"""Гард формата texts: каждая фраза каста — dict {text, emotion_en, emotion_ru}.

Новый формат (2026-10-21): пофразовая эмоция диктора для voice_design
(text_item) и будущей генерации. Строки-старый-формат запрещены — они
молча генерировались без эмоции. Плюс гигиена: emotion_en только латиница
(иначе акцент), emotion_ru непустой.
"""
import glob
import os
import re
import sys

import yaml

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, 'tools', 'generate', 'scripts'))

from voicekit import paths  # noqa: E402


def cast_files():
    return sorted(glob.glob(os.path.join(paths.VOICE_CANDIDATES, '*', '*.yaml')))


def test_every_cast_has_texts():
    files = cast_files()
    assert files, 'касты не найдены: {}'.format(paths.VOICE_CANDIDATES)
    for path in files:
        cfg = yaml.safe_load(open(path, encoding='utf-8')) or {}
        assert cfg.get('texts'), '{}: нет texts'.format(path)


def test_texts_are_dicts_with_emotions():
    """Каждая запись — dict с непустыми text/emotion_en/emotion_ru."""
    for path in cast_files():
        rel = os.path.relpath(path, paths.VOICE_CANDIDATES)
        cfg = yaml.safe_load(open(path, encoding='utf-8')) or {}
        for i, item in enumerate(cfg.get('texts') or []):
            assert isinstance(item, dict), \
                '{}: запись {} — строка (старый формат), нужен dict'.format(rel, i + 1)
            for key in ('text', 'emotion_en', 'emotion_ru'):
                assert (item.get(key) or '').strip(), \
                    '{}: запись {} — пустой {}'.format(rel, i + 1, key)


def test_emotion_lang_hygiene():
    """emotion_en — без кириллицы (кириллица даёт акцент); emotion_ru — непустой."""
    cyr = re.compile(r'[Ѐ-ӿ]')
    for path in cast_files():
        rel = os.path.relpath(path, paths.VOICE_CANDIDATES)
        cfg = yaml.safe_load(open(path, encoding='utf-8')) or {}
        for i, item in enumerate(cfg.get('texts') or []):
            if not isinstance(item, dict):
                continue
            assert not cyr.search(item.get('emotion_en') or ''), \
                '{}: запись {} — кириллица в emotion_en'.format(rel, i + 1)
            assert len((item.get('emotion_en') or '').split()) >= 2, \
                '{}: запись {} — emotion_en слишком короткая'.format(rel, i + 1)
