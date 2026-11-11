################################################################################
## zz_capture.rpy — авто-съёмка скриншотов игры (лендинг gh-pages + UI-тесты)
##
## ХАРНЕСС ДЛЯ ТЕСТОВ (граница установки: в игре — только mods/!). Деплой и
## уборка автоматизированы драйвером: копируется в <игра>/mods/_tssr-test/,
## по завершении съёмки удаляется вместе с .rpyc (источник — этот файл рядом
## со scripts/shots_capture.ps1).
## Управление — через окружение (штатный драйвер: shots_capture.ps1):
##   TSSR_SHOTS=1              — включает капчу (без неё файл бездействует)
##   TSSR_SHOTS_MODE=menu|game — меню+страница настроек / кадры пролога (AFM)
##   TSSR_SHOTS_LANG=ru|en     — язык при съёмке
##   TSSR_SHOTS_SAVE=1         — разрешить запись в persistent (один раз!)
##   TSSR_SHOTS_DIR=<путь>     — куда писать (ставит драйвер: <репа>/tmp/shots)
## Скриншоты: {TSSR_SHOTS_DIR}/{lang}_{menu,settings,dialogue1..24}.png;
## фолбэк без драйвера — <игра>/mods/tssr-ai-voice-pack/shots/ (в границе mods/).
##
## Восстановлено 2026-10-19 из game/zz_capture.rpyc (tssr-clean-test): исходник
## на диске не сохранился, тело блока дословно из PyCode внутри .rpyc.
################################################################################

init python:

    import os

    if os.environ.get("TSSR_SHOTS") == "1":

        _zz_lang = os.environ.get("TSSR_SHOTS_LANG", "ru")
        _zz_mode = os.environ.get("TSSR_SHOTS_MODE", "menu")

        if os.environ.get("TSSR_SHOTS_SAVE") != "1":
            renpy.persistent.should_save_persistent = False

        preferences.language = None if _zz_lang == "en" else _zz_lang

        if _zz_mode == "game":

            config.afm_callback = lambda: True
            preferences.afm_time = 1
            preferences.afm_enable = True

        def _zz_dir():
            import os
            # Артефакты — за пределы установки: репа (TSSR_SHOTS_DIR ставит
            # shots_capture.ps1); фолбэк без драйвера — строго внутри
            # <игра>/mods/ (граница установки: ничего вне mods/).
            d = os.environ.get("TSSR_SHOTS_DIR") or os.path.join(
                config.basedir, "mods", "tssr-ai-voice-pack", "shots")
            if not os.path.isdir(d):
                os.makedirs(d)
            return d

        def _zz_shot(name):
            import os
            fn = os.path.join(_zz_dir(), "%s_%s.png" % (_zz_lang, name))
            ok = renpy.screenshot(fn)
            renpy.write_log("TSSR_SHOTS: saved=%s -> %s" % (ok, fn))

        def _zz_open_settings():

            import os
            os.environ["TSSR_SHOTS_VY"] = "0"  # съёмка начинается с верха панели
            renpy.show_screen("tssr_mod_menu")
            renpy.restart_interaction()

        def _zz_settings_bottom():

            # Полное ревью «сверху до низу»: пересоздаём экран со скроллом
            # в низ (огромный yinitial зажимается максимумом) и снимаем низ.
            import os
            os.environ["TSSR_SHOTS_VY"] = "999999"
            renpy.hide_screen("tssr_mod_menu")
            renpy.show_screen("tssr_mod_menu")
            renpy.restart_interaction()

        _zz_steps = []

        if _zz_mode == "menu":

            _zz_steps = [
                    (3.0, lambda: _zz_shot("menu")),
                    (4.0, _zz_open_settings),
                    (6.5, lambda: _zz_shot("settings")),
                    (7.5, _zz_settings_bottom),
                    (10.0, lambda: _zz_shot("settings_bottom")),
                    (10.5, renpy.quit),
                ]
        else:

            _zz_steps = []
            # Ранние кадры (2026-11-11, фитбэк владельца: «начинаем игру —
            # квадратики» на стартовых экранах; старый график их пропускал):
            _zz_steps.append((2.5, lambda: _zz_shot("start1")))
            _zz_steps.append((4.0, lambda: _zz_shot("start2")))
            _zz_steps.append((5.5, lambda: _zz_shot("start3")))
            for _i in range(1, 25):
                _zz_steps.append((7.0 + _i * 2.5, lambda n=_i: _zz_shot("dialogue%d" % n)))
            _zz_steps.append((66.0, renpy.quit))

        if _zz_mode == "langswitch":

            # K-E10: последовательность владельца «EN -> ru -> zh -> pl -> zh -> ОК»
            # снимается на каждом шаге (живое переключение без рестарта).
            def _zz_apply_lang(code):
                Language(code)()
                tssr_apply_language_font()

            def _zz_show_main_menu():
                # tag menu: панель вытеснила главное меню — прячем панель
                # и ВОЗВРАЩАЕМ главное меню (снимаем титул выбранного языка).
                renpy.hide_screen("tssr_mod_menu")
                renpy.show_screen("main_menu")
                renpy.restart_interaction()

            _zz_steps = [
                (3.0, lambda: _zz_shot("ls1_mainmenu")),
                (4.5, _zz_open_settings),
                (7.0, lambda: _zz_shot("ls2_set_en")),
                (8.0, lambda: _zz_apply_lang("ru")),
                (10.5, lambda: _zz_shot("ls3_set_ru")),
                (11.5, lambda: _zz_apply_lang("zh")),
                (14.0, lambda: _zz_shot("ls4_set_zh")),
                (15.0, lambda: _zz_apply_lang("pl")),
                (17.5, lambda: _zz_shot("ls5_set_pl")),
                (18.5, lambda: _zz_apply_lang("zh")),
                (21.0, lambda: _zz_shot("ls6_set_zh2")),
                (22.0, _zz_show_main_menu),
                (24.5, lambda: _zz_shot("ls7_menu_zh")),
                (25.5, lambda: _zz_apply_lang("pl")),
                (28.0, lambda: _zz_shot("ls8_menu_pl")),
                (29.0, renpy.quit),
            ]

        _zz_state = {"t0": None}

        def _zz_driver():
            import time
            if _zz_state["t0"] is None:
                _zz_state["t0"] = time.time()
            el = time.time() - _zz_state["t0"]
            while _zz_steps and el >= _zz_steps[0][0]:
                _zz_steps.pop(0)[1]()

        config.periodic_callbacks.append(_zz_driver)
