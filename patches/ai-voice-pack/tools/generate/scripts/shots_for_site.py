#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Скриншоты игры -> лендинг: tmp/shots/*.png -> site/public/shots/*.jpg.

Отбор кадров (харнесс zz_capture.rpy из scripts/, деплой драйвером в
<игра>/mods/_tssr-test, запуск — scripts/shots_capture.ps1;
game-режим: 24 кадра каждые 2.5с, лучшие с ОТКРЫТЫМ текстовым окном — ревью
владельца 2026-10-16: «кадры без текста скучноватые»). Порядок в галерее
задаёт Screenshots.tsx, здесь — только соответствие stem -> кадр:
  main_menu          <- {ru|en}_menu.png           главное меню (бейдж яркий)
  language_settings  <- {ru|en}_settings.png       страница патча (ПЕРВЫМ в галерее)
  dialogue_1         <- {ru|en}_dialogue5.png      CG: объятия с репликой
  dialogue_2         <- {ru|en}_dialogue3.png      король в дверях + наррация
  dialogue_3         <- ru: dialogue11, en: 12     у окна, длинные реплики
  dialogue_4         <- {ru|en}_dialogue1.png      панорама столицы + наррация
Имена файлов сайта: {name}_{russian|english}.jpg (суффикс = версия игры,
её выбирает Screenshots.tsx по i18n-языку).

Обработка: ресайз 1920x1080 (16:9, сайт кладёт width:100%), JPEG q=3
(~совпадает с прежними 2080x1170 по качеству, меньше по весу).

Запуск из корня репы:
    python patches/ai-voice-pack/tools/generate/scripts/shots_for_site.py
"""
import os
import subprocess
import sys

def _find_repo_root():
    """Корень репы: поднимаемся от scripts/ до site/public/ (маяк) + patches/."""
    p = os.path.dirname(os.path.abspath(__file__))
    while True:
        if (os.path.isdir(os.path.join(p, "site", "public")) and
                os.path.isdir(os.path.join(p, "patches"))):
            return p
        parent = os.path.dirname(p)
        if parent == p:
            sys.exit("не найден корень репы (site/public) от %s" %
                     os.path.abspath(__file__))
        p = parent


ROOT = _find_repo_root()
SRC = os.path.join(ROOT, "tmp", "shots")
DST = os.path.join(ROOT, "site", "public", "shots")

# суффикс файла сайта -> префикс кадра в tmp/shots и набор отобранных снимков
PLAN = {
    "russian": ("ru", {
        "main_menu": "menu",
        "language_settings": "settings",
        "dialogue_1": "dialogue5",
        "dialogue_2": "dialogue3",
        "dialogue_3": "dialogue11",
        "dialogue_4": "dialogue1",
    }),
    "english": ("en", {
        "main_menu": "menu",
        "language_settings": "settings",
        "dialogue_1": "dialogue5",
        "dialogue_2": "dialogue3",
        "dialogue_3": "dialogue12",  # EN-текст длиннее — реплика позже в кадре
        "dialogue_4": "dialogue1",
    }),
}


def main():
    if not os.path.isdir(SRC):
        sys.exit("нет каталога %s (сначала съёмка: scripts/shots_capture.ps1)" % SRC)
    if not os.path.isdir(DST):
        os.makedirs(DST)

    failed = 0
    for suffix, (prefix, picks) in sorted(PLAN.items()):
        for name, stem in sorted(picks.items()):
            src = os.path.join(SRC, "%s_%s.png" % (prefix, stem))
            dst = os.path.join(DST, "%s_%s.jpg" % (name, suffix))
            if not os.path.isfile(src):
                print("MISS %s" % os.path.relpath(src, ROOT))
                failed += 1
                continue
            subprocess.check_call([
                "ffmpeg", "-y", "-v", "error",
                "-i", src,
                "-vf", "scale=1920:1080:flags=lanczos",
                "-q:v", "3",
                dst,
            ])
            print("OK   %-44s %6.0f KB" % (
                os.path.relpath(dst, ROOT), os.path.getsize(dst) / 1024.0))
    sys.exit(1 if failed else 0)


if __name__ == "__main__":
    main()
