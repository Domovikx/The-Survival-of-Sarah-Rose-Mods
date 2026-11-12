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

# LEGACY: порт на .mts — tools/build/build_pack.mts; правки только в .mts.

import json
import shutil
import subprocess
import sys
import tempfile
import zipfile
from pathlib import Path

# ai-voice-pack/tools/build/build_pack.py -> parents[2] = patches/ai-voice-pack
PATCH = Path(__file__).resolve().parents[2]
REPO = PATCH.parents[1]  # [0] = patches/, [1] = корень репы
DIST = REPO / "dist"

# Языки озвучки: каталог в репо -> каталог при установке (все 11 языков
# матрицы патча; пакет строится только если каталог непустой).
VOICE_LANGS = {
    "ru": PATCH / "audio" / "ru",
    "en": PATCH / "audio" / "en",
    "de": PATCH / "audio" / "de",
    "es": PATCH / "audio" / "es",
    "fr": PATCH / "audio" / "fr",
    "it": PATCH / "audio" / "it",
    "ja": PATCH / "audio" / "ja",
    "ko": PATCH / "audio" / "ko",
    "pl": PATCH / "audio" / "pl",
    "pt": PATCH / "audio" / "pt",
    "zh": PATCH / "audio" / "zh",
}

# Атомарная папка мода при установке (относительно корня игры)
MOD_DIR = "mods/tssr-ai-voice-pack"

# Dev-only в КОРНЕ патча — НЕ в дистрибутив (корень патча = зеркало
# установки 2026-10-19, поэтому исключения — имена ВЕРХНЕГО уровня):
# dev-дерево, аудио (уезжает отдельным voice-zip), каталог целиком (в зип
# идут только два runtime-JSON, см. CATALOG_RUNTIME), рефы голосов (casts —
# сырьё генерации), исходники переводов (po — рантайм читает их продукт tl/),
# кэши тестов + defensive-имена диагностик, которые мод пишет в свою папку
# в установке.
MOD_EXCLUDE = {"audio", "tools", "tests", "catalog", "README.md", "MOD.md",
               "casts", "po", ".pytest_cache",
               "update_check.txt", "last_menu_hook.txt", "voice_debug.log"}

# Рантайм-каталог: voice_config.rpy грузит ТОЛЬКО эти два JSON (label -> arc,
# who -> variant); в zip идут как АРТЕФАКТЫ СБОРКИ — в репе каталог/ не живёт
# (легаси выпищен 2026-10-22), генерит catalog_gen.mts из POT + casts.
CATALOG_RUNTIME = ("label_arc.json", "voice_list.json")
CATALOG_GEN = PATCH / "tools" / "generate" / "scripts" / "catalog_gen.mts"

ENVIRONMENT_TXT = """\
# TSSR mod: внешний search path (Ren'Py читает этот файл в корне игры при старте).
# Путь ОТНОСИТЕЛЬНЫЙ корню игры — работает при любой локации установки.
# В папку mods/ можно класть и другие моды (папка на мод) — движок подхватит.
# Multiple mods: add more paths separated by ::  (example: "mods::mods_other")
RENPY_SEARCHPATH = "mods"
"""

INSTALL_TXT = """\
THE SURVIVAL OF SARAH ROSE — AI Voice Pack + Localization (11 languages)
=========================================================================

СОСТАВ / FILES
  TSSR-AI-Voice-Pack-main.zip      — ядро БЕЗ АУДИО: тексты 11 языков, все
                                     шрифты, меню, установщик (обязательный) /
                                     core, NO audio: texts, fonts, menu
  TSSR-AI-Voice-Pack-voice-<lang>.zip — голоса языка (СКАЧИВАЕТСЯ ОТДЕЛЬНО,
                                     сколько хочешь: ru, en, de, es, fr, it,
                                     ja, ko, pl, pt, zh) / voice packs are
                                     SEPARATE downloads, pick 1..N

ПОРЯДОК / ORDER:
  1. СНАЧАЛА main (обязательно) — его установщик ставит ядро: тексты 11
     языков, все шрифты, меню. Аудио в main НЕТ.
  2. ПОТОМ голоса — захочешь: скачай voice-пакеты нужных языков (1..N) и
     у КАЖДОГО запусти ЕГО install.cmd — пакет ставится атомарно, один за
     другим. Установщик пакета проверит, что main стоит (без ядра попросит
     поставить его первым).
     FIRST main (required) — core only: texts, fonts, menu. NO audio.
     THEN voices: download the packs you want (1..N), run EACH pack's own
     install.cmd — each installs atomically. The pack installer checks the
     core is present (asks for main first otherwise).

УСТАНОВКА / INSTALL (папка игры = папка с TheSurvivalofSarahRose.exe):
  А. main.zip: распакуй куда угодно и запусти install.cmd — он сам найдёт
     игру и поставит ядро. ИЛИ вручную: распакуй main.zip в корень игры.
     Unpack main.zip anywhere and run its install.cmd (finds the game), or
     manually unpack into the game root.
  Б. каждый voice-<lang>.zip: распакуй куда угодно и запусти ЕГО install.cmd
     — поставит только свой язык, атомарно. ИЛИ вручную: распакуй в корень
     игры. Unpack each voice zip anywhere and run its own install.cmd, or
     manually unpack into the game root.
  В. Запусти игру. Настройки: кнопка языка в меню — 11 языков.
     Launch the game. Settings: language button in the menu — 11 languages.

ВАЖНО / IMPORTANT: перед установкой ЗАКРОЙ игру (игра держит шрифты и файлы
мода; установщик ждёт закрытия до 3 минут, потом попросит). / Close the game
before installing (it locks fonts and mod files; the installer waits up to
3 minutes, then asks you to close it).

ПРИМЕЧАНИЕ / NOTE: если Windows показала предупреждение при запуске install.cmd —
файл скачан из интернета («Mark of the Web»). Скрипт открытый, исходники на
GitHub; ручная установка (пункты 1–2) — равноценный путь.
If Windows showed a warning running install.cmd — the file came from the
internet (Mark of the Web). The script is open source on GitHub; manual
install (steps 1-2) is an equal alternative.

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

    exclude — имена ВЕРХНЕГО УРОВНЯ (dev-only), которые не шиппим; такие
    каталоги не обходятся вовсе (audio/ — 134k файлов).
    .rpyc не шиппим (решение 2026-10-19): двойной источник правды
    (rpy + rpyc) = тихая рассинхронизация; движок скомпилирует .rpy
    при первом запуске. В git .rpyc тоже не коммитятся.
    """
    files = []
    for entry in sorted(root.iterdir()):
        if entry.name in exclude:
            continue
        if entry.is_file():
            files.append(entry)
        else:
            files.extend(p for p in entry.rglob("*")
                         if p.is_file() and "__pycache__" not in p.parts
                         and p.suffix != ".rpyc")
    return sorted(files)


_catalog_cache = None


def _catalog_payload():
    """Сборочные рантайм-мапы: node catalog_gen.mts -> {имя файла: bytes}.

    Единственный источник правды — po/template.pot (инвентарь label → arc)
    и casts/voices.mts (войсы); в репе каталог/ не живёт. Любая проблема
    генератора = ПОНИЯТНАЯ ошибка сборки: в дистрибутив не попадает пустой
    или неполный каталог (edge-контракт приёмки).
    """
    global _catalog_cache
    if _catalog_cache is None:
        staging = tempfile.mkdtemp(prefix="tssr_catalog_")
        try:
            r = subprocess.run(
                ["node", str(CATALOG_GEN), "--out-dir", staging],
                capture_output=True, text=True, encoding="utf-8", errors="replace",
            )
            if r.returncode != 0:
                sys.exit(
                    "СБОРКА ОСТАНОВЛЕНА: генератор рантайм-каталога упал "
                    "(%s):\n%s%s" % (CATALOG_GEN, r.stdout or "", r.stderr or "")
                )
            payload = {}
            for fn in CATALOG_RUNTIME:
                p = Path(staging) / fn
                if not p.is_file() or p.stat().st_size == 0:
                    sys.exit("СБОРКА ОСТАНОВЛЕНА: %s не сгенерирован (%s)"
                             % (fn, CATALOG_GEN))
                data = p.read_bytes()
                try:
                    doc = json.loads(data.decode("utf-8"))
                except Exception as e:
                    sys.exit("СБОРКА ОСТАНОВЛЕНА: %s — битый JSON: %s" % (fn, e))
                if not isinstance(doc, dict) or not doc:
                    sys.exit("СБОРКА ОСТАНОВЛЕНА: %s пустой объект" % fn)
                payload[fn] = data
            _catalog_cache = payload
        finally:
            shutil.rmtree(staging, ignore_errors=True)
    return _catalog_cache


def build_main(out_dir):
    """Ядро патча: атомарная папка мода mods/tssr-ai-voice-pack/ + корень.

    Сборка = КОПИЯ ДЕРЕВА патча (зеркало установки 2026-10-19): arcname =
    относительный путь файла — «карта путей» отсутствует, новый файл в репе
    попадает в дистрибутив сам.
    """
    name = "TSSR-AI-Voice-Pack-main.zip"
    target = out_dir / name
    nfiles, nbytes = 0, 0
    with zipfile.ZipFile(target, "w", zipfile.ZIP_DEFLATED, compresslevel=9) as zf:
        # Корень установки
        # Установщик «для ленивых» — в КОРНЕ архива (рядом с mods/):
        # двойной клик по install.cmd находит игру и ставит всё сам.
        for fn in ("install.cmd", "install.ps1"):
            _add(zf, PATCH / "tools" / "build" / "installer" / fn, fn)
        for arcname, content in (("INSTALL.txt", INSTALL_TXT),
                                 ("environment.txt", ENVIRONMENT_TXT)):
            zf.writestr(arcname, content)
        # Зеркало установки: всё дерево патча кроме dev-only (MOD_EXCLUDE).
        # Шрифты ВСЕ едут в main (владелец 2026-11-12: шрифт = часть текста,
        # текст живёт в main; без шрифта иероглифы — квадраты).
        for p in _tree_files(PATCH, MOD_EXCLUDE):
            _add(zf, p, MOD_DIR + "/" + p.relative_to(PATCH).as_posix())
        # Рантайм-каталог — артефакт сборки (каталог/ в репе нет): генератор
        # валит сборку сам, если POT/войсы не дают полные мапы.
        for fn in CATALOG_RUNTIME:
            zf.writestr(MOD_DIR + "/catalog/" + fn, _catalog_payload()[fn],
                        compress_type=zipfile.ZIP_DEFLATED)
    with zipfile.ZipFile(target) as zf:
        infos = zf.infolist()
        nfiles, nbytes = len(infos), sum(i.file_size for i in infos)
    return name, target, nfiles, nbytes


def build_voice(lang, out_dir):
    """Озвучка одного языка: audio/<lang>/** -> mods/.../ai_voice/<lang>/**.
    Плюс СВОЙ атомарный установщик в корне зипа (владелец 2026-11-12:
    «отдельные аудио-установщики, атомарно»; предохранитель на ядро main)."""
    src = VOICE_LANGS[lang]
    if not src.is_dir() or not any(src.rglob("*")):
        print("  voice-%s: пропущен (каталог пуст — аудио ещё генерится)" % lang)
        return None
    name = "TSSR-AI-Voice-Pack-voice-%s.zip" % lang
    target = out_dir / name
    with zipfile.ZipFile(target, "w", zipfile.ZIP_STORED) as zf:
        for p in _tree_files(src):
            _add(zf, p, MOD_DIR + "/ai_voice/%s/%s" % (lang, p.relative_to(src).as_posix()))
        _add(zf, PATCH / "tools" / "build" / "installer" / "install.cmd", "install.cmd")
        _add(zf, PATCH / "tools" / "build" / "installer" / "voice_install.ps1", "install.ps1")
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
    results += [r for r in (build_voice(lang, DIST) for lang in langs) if r]
    print("СОБРАНО:", DIST)
    for name, target, nfiles, nbytes in results:
        mib = nbytes / (1 << 20)
        print(
            "  %-34s файлов: %6d  несжатое: %8.1f MiB  zip: %7.1f MiB"
            % (name, nfiles, mib, target.stat().st_size / (1 << 20))
        )


if __name__ == "__main__":
    main()
