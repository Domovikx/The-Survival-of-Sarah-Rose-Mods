#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""build_pack.py — сборка дистрибутивных zip'ов AI Voice Pack (патч TSSR).

Схема zip'ов (решение 2026-10-18, одна Nexus-страница = хаб патчей):
  main      — ядро: mods/tssr-ai-voice-pack/ (scripts, catalog, tl/),
              environment.txt, INSTALL.txt
  voice-<l> — озвучка языка: mods/tssr-ai-voice-pack/ai_voice/<l>/

Раскладка ВНУТРИ zip = РАСКЛАДКА УСТАНОВКИ: распаковка в корень папки игры
(там, где TheSurvivalofSarahRose.exe). ВСЁ живёт в атомарной папке
mods/tssr-ai-voice-pack/ — установка мода = распаковка, удаление = удалить
эту папку (+ environment.txt, если других модов нет). Другие моды кладутся
в mods/<своя-папка>/ — движок подхватывает их автоматически (RENPY_SEARCHPATH
= "mods", обход рекурсивный). Аудио кладём без сжатия (opus и так сжат;
ZIP_STORED = заметно быстрее, размер тот же).

Запуск (из anywhere):  python patches/ai-voice-pack/tools/build/build_pack.py
Артефакты: <repo>/dist/*.zip  (dist/ в .gitignore — зипы не коммитим).
"""

import sys
import zipfile
from pathlib import Path

# ai-voice-pack/tools/build/build_pack.py -> parents[2] = patches/ai-voice-pack
PATCH = Path(__file__).resolve().parents[2]
REPO = PATCH.parents[1]  # [0] = patches/, [1] = корень репы
DIST = REPO / "dist"

# Языки озвучки: каталог в репо -> каталог при установке
VOICE_LANGS = {
    "ru": PATCH / "audio" / "vo_ru",
    "en": PATCH / "audio" / "vo_en",
}

# Атомарная папка мода при установке (относительно корня игры)
MOD_DIR = "mods/tssr-ai-voice-pack"

# Служебное mod/, что НЕ попадает в дистрибутив (диагностика/доки репы)
MOD_EXCLUDE = {"README.md", "update_check.txt", "last_menu_hook.txt",
               "voice_debug.log"}

# Рантайм-каталог: voice_config.rpy грузит ТОЛЬКО эти два JSON (label -> arc,
# who -> variant); остальные 29M catalog/ — вспомогательные, в zip не идут.
CATALOG_RUNTIME = ("label_arc.json", "voice_list.json")

ENVIRONMENT_TXT = """\
# TSSR mod: внешний search path (Ren'Py читает этот файл в корне игры при старте).
# Путь ОТНОСИТЕЛЬНЫЙ корню игры — работает при любой локации установки.
# В папку mods/ можно класть и другие моды (папка на мод) — движок подхватит.
# Multiple mods: add more paths separated by ::  (example: "mods::mods_other")
RENPY_SEARCHPATH = "mods"
"""

INSTALL_TXT = """\
THE SURVIVAL OF SARAH ROSE — AI Voice Pack (RU+EN) / AI-озвучка и перевод
=========================================================================

СОСТАВ / FILES
  TSSR-AI-Voice-Pack-main.zip      — ядро (обязательный) / core (required)
  TSSR-AI-Voice-Pack-voice-ru.zip  — голоса русского перевода / Russian voice
  TSSR-AI-Voice-Pack-voice-en.zip  — голоса английского текста / English voice

УСТАНОВКА / INSTALL (папка игры = папка с TheSurvivalofSarahRose.exe):
  1. Распакуй main.zip в корень папки игры.
     Unpack main.zip into the game root folder.
  2. Распакуй нужные voice-zip'ы туда же.
     Unpack the voice zip(s) you need into the same folder.
  3. Запусти игру. Настройки: кнопка языка в меню / «Sarah Rose — AI Voice Pack».
     Launch the game. Settings: language button in the menu / settings page.

Всё лежит в одной папке mods/tssr-ai-voice-pack/ (плюс служебный
environment.txt в корне игры). Другие моды можно класть в mods/ рядом.
Everything lives in mods/tssr-ai-voice-pack/ (plus the service file
environment.txt in the game root). Other mods can go into mods/ next to it.

УДАЛЕНИЕ / UNINSTALL:
  Удали папку mods/tssr-ai-voice-pack и файл environment.txt.
  Delete the mods/tssr-ai-voice-pack folder and the environment.txt file.

Совместимость / Requires: официальная игра v0.79 (The Survival of Sarah Rose).
Проверено / Verified: 2026-10-19.
"""


def _add(zf, src, arcname):
    """Файл в zip: opus — store (уже сжат), остальное — deflate."""
    compress = (
        zipfile.ZIP_STORED if src.suffix.lower() == ".opus" else zipfile.ZIP_DEFLATED
    )
    zf.write(str(src), arcname, compress_type=compress)


def _tree_files(root, exclude=frozenset()):
    """Отсортированный список файлов дерева (для воспроизводимости сборки).

    .rpyc не шиппим (решение 2026-10-19): двойной источник правды
    (rpy + rpyc) = тихая рассинхронизация; движок скомпилирует .rpy
    при первом запуске. В git .rpyc тоже не коммитятся.
    """
    return sorted(
        p for p in root.rglob("*")
        if p.is_file() and p.name not in exclude and "__pycache__" not in p.parts
        and p.suffix != ".rpyc"
    )


def build_main(out_dir):
    """Ядро патча: атомарная папка мода mods/tssr-ai-voice-pack/ + корень."""
    langs = sorted(VOICE_LANGS)
    name = "TSSR-AI-Voice-Pack-main.zip"
    target = out_dir / name
    nfiles, nbytes = 0, 0
    with zipfile.ZipFile(target, "w", zipfile.ZIP_DEFLATED, compresslevel=9) as zf:
        # Корень установки
        for arcname, content in (("INSTALL.txt", INSTALL_TXT),
                                 ("environment.txt", ENVIRONMENT_TXT)):
            zf.writestr(arcname, content)
        # Скрипты/шрифты/картинки мода (без служебного)
        for p in _tree_files(PATCH / "mod", MOD_EXCLUDE):
            _add(zf, p, MOD_DIR + "/" + p.relative_to(PATCH / "mod").as_posix())
        # runtime-конфиг озвучки (в папке мода, НЕ в game/)
        _add(zf, PATCH / "voice_config.rpy", MOD_DIR + "/voice_config.rpy")
        # Переводы: все языки сразу (в main)
        for lang in langs:
            src = PATCH / "tl" / lang
            for p in _tree_files(src):
                _add(zf, p, MOD_DIR + "/tl/" + lang + "/" + p.relative_to(src).as_posix())
        # Рантайм-каталог (label->arc, who->variant)
        for fn in CATALOG_RUNTIME:
            _add(zf, PATCH / "tools" / "generate" / "catalog" / fn,
                 MOD_DIR + "/catalog/" + fn)
    with zipfile.ZipFile(target) as zf:
        infos = zf.infolist()
        nfiles, nbytes = len(infos), sum(i.file_size for i in infos)
    return name, target, nfiles, nbytes


def build_voice(lang, out_dir):
    """Озвучка одного языка: audio/vo_<lang>/** -> mods/.../ai_voice/<lang>/**."""
    src = VOICE_LANGS[lang]
    name = "TSSR-AI-Voice-Pack-voice-%s.zip" % lang
    target = out_dir / name
    with zipfile.ZipFile(target, "w", zipfile.ZIP_STORED) as zf:
        for p in _tree_files(src):
            _add(zf, p, MOD_DIR + "/ai_voice/%s/%s" % (lang, p.relative_to(src).as_posix()))
    with zipfile.ZipFile(target) as zf:
        infos = zf.infolist()
        nfiles, nbytes = len(infos), sum(i.file_size for i in infos)
    return name, target, nfiles, nbytes


def main():
    langs = sys.argv[1:] or sorted(VOICE_LANGS)
    for lang in langs:
        if lang not in VOICE_LANGS:
            sys.exit("неизвестный язык %r (есть: %s)" % (lang, ", ".join(VOICE_LANGS)))
    DIST.mkdir(exist_ok=True)
    results = [build_main(DIST)]
    results += [build_voice(lang, DIST) for lang in langs]
    print("СОБРАНО:", DIST)
    for name, target, nfiles, nbytes in results:
        mib = nbytes / (1 << 20)
        print(
            "  %-34s файлов: %6d  несжатое: %8.1f MiB  zip: %7.1f MiB"
            % (name, nfiles, mib, target.stat().st_size / (1 << 20))
        )


if __name__ == "__main__":
    main()
