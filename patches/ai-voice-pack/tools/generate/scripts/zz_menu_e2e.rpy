################################################################################
## zz_menu_e2e.rpy — E2E-СЦЕНАРИЙ ДЛЯ МЕНЮ МОДА (запуск: menu_e2e.ps1).
##
## ЧТО ЭТО. Харнесс живёт в <игра>/mods/_tssr-test-e2e/ и гоняет РЕАЛЬНЫЙ
## движок: открывает наше меню, дёргает те же функции, что и кнопки (+/-,
## «Отменить правки», «Применить»), проверяет персистентные значения, кегли,
## перевод подписей и снимает скриншоты верха/низа меню на ревью владельцу.
## В репозиторий ничего не пишет: скриншоты идут в TSSR_E2E_DIR (репа).
##
## ПОЧЕМУ НЕ КЛИКИ МЫШЬЮ. Кнопки меню вызывают Function(...)-экшены — вызов
## тех же функций и есть «нажатие», но детерминированно (без координат окна и
## без зависимости от фокуса). Проверяем ПОВЕДЕНИЕ, а не пиксели.
##
## ЧТО ПОКРЫТО (баги и граничные случаи, найденные на живом клиенте):
##   1) меню открывается и все подписи переведены (в ru не должно быть
##      английских слов — правило читабельности);
##   2) черновик/«грязно»: кнопка «Применить» появляется только при правках;
##   3) клампы +/- (10..160) — спам кнопкой не уносит значение в бесконечность;
##   4) мусор в поле ввода не ломает размеры (берётся текущее значение);
##   5) «Применить» реально меняет persistent и кегли (без перезапуска игры);
##   6) «Закрыть» без применения НЕ трогает persistent;
##   7) смена языка на лету: кегли 4 наборов применяются (zh/ja +2, ko +1);
##   8) нижняя панель игры: подписи кнопок не дублируются (баг ru/fr/pl/ko,
##      где Save и Q.Save выглядели одинаково).
##
## Окружение: TSSR_E2E=1, TSSR_E2E_LANG=<код>, TSSR_E2E_DIR=<папка репы>.
################################################################################

init python:
    import os

    if os.environ.get("TSSR_E2E") == "1":

        _e2e_lang = os.environ.get("TSSR_E2E_LANG", "ru")
        _e2e_dir = os.environ.get("TSSR_E2E_DIR") or os.path.join(config.basedir, "e2e")
        if not os.path.isdir(_e2e_dir):
            os.makedirs(_e2e_dir)

        if _e2e_lang != "en":
            preferences.language = _e2e_lang
        # Кадры для ревью — нативно 1920x1080 (окно игры по умолчанию 1600x900;
        # persistent не сохраняется, размер окна игрока не меняется).
        try:
            # Окно задаётся в DIP, а скриншот пишется в ФИЗИЧЕСКИХ пикселях:
            # при DPI-факторе 1.25 окно 1536x864 даёт ровно 1920x1080 на выходе.
            _scale = float(getattr(renpy.game.interface, "dpi_scale", 1.0) or 1.0)
            renpy.set_physical_size((int(round(1920 / _scale)), int(round(1080 / _scale))))
        except Exception:
            pass



        _e2e_fails = []
        _e2e_passes = 0

        def _e2e_log(tag, name, detail=""):
            renpy.write_log("TSSR_E2E %s [%s] %s %s" % (tag, _e2e_lang, name, detail))

        def _e2e_check(name, cond, detail=""):
            global _e2e_passes
            if cond:
                _e2e_passes += 1
                _e2e_log("PASS", name, detail)
            else:
                _e2e_fails.append(name)
                _e2e_log("FAIL", name, detail)

        def _e2e_shot(name):
            # Скриншот — для глаз владельца; без assert'ов, чтобы не падать
            # из-за особенностей рендера.
            path = os.path.join(_e2e_dir, "%s_%s.png" % (_e2e_lang, name))
            try:
                ok = renpy.screenshot(path)
                _e2e_log("INFO", "screenshot:%s" % name, "%r -> %s" % (ok, path))
            except Exception as e:
                _e2e_log("INFO", "screenshot:%s" % name, "ERR %r" % e)

        def _e2e_tr(s):
            try:
                return renpy.translation.translate_string(s)
            except Exception:
                return s

        # Подписи нашего меню: переведены ли и не осталось ли латиницы.
        _E2E_LABELS = [
            "Interface language",
            "Voice acting",
            "Font sizes",
            "Dialogue text",
            "Names",
            "UI text",
            "Reset to defaults",
            "Revert changes",
            "Apply and restart",
            "OK",
        ]
        # Бренды/технические слова, которые законно остаются латиницей.
        _E2E_WHITELIST = ("Nexus", "Mods", "Vortex", "Steam", "Opus", "AI", "TSSR", "Q.", "C.", "UI", "OK")

        def _e2e_has_latin(s):
            import re

            for w in _E2E_WHITELIST:
                s = s.replace(w, "")
            return bool(re.search(r"[A-Za-z]", s))

        def _e2e_steps():
            steps = []

            # --- 1. Меню открывается -------------------------------------
            def step_open():
                renpy.show_screen("tssr_mod_menu")
                renpy.restart_interaction()

            def check_open():
                _e2e_check("menu_shown", renpy.get_screen("tssr_mod_menu") is not None)
                _e2e_shot("menu_top")

            # --- 2. Подписи переведены -----------------------------------
            # Языки НЕ на латинице: там английские буквы в подписи = неперевод.
            # Для de/es/pt/fr/it/pl проверять латиницу бессмысленно (они сами
            # латиница) — там достаточно «перевод отличается от английского».
            _E2E_NONLATIN = ("ru", "zh", "ja", "ko")
            # Подписи, которые законно совпадают с английскими во всех языках
            # (универсальный токен, а не неперевод).
            _E2E_SAME_OK = ("OK",)

            def check_labels():
                if _e2e_lang == "en":
                    return
                for key in _E2E_LABELS:
                    val = _e2e_tr(key)
                    ok = val != key or key in _E2E_SAME_OK
                    if ok and _e2e_lang in _E2E_NONLATIN:
                        ok = not _e2e_has_latin(val)
                    _e2e_check("label:%s" % key, ok, "%r" % val)

            # --- 3. Черновик и «грязно» ----------------------------------
            def check_dirty():
                tssr_fs_snapshot()
                _e2e_check("dirty:чисто_после_снапшота", not tssr_fs_dirty())
                tssr_fs_bump("tssr_fs_text", 1)
                _e2e_check("dirty:правка_видна", tssr_fs_dirty())
                tssr_fs_snapshot()
                _e2e_check("dirty:снапшот_сбрасывает", not tssr_fs_dirty())

            # --- 4. Клампы +/- и мусор в поле ----------------------------
            def check_limits():
                for _ in range(500):
                    tssr_fs_bump("tssr_fs_text", 1)
                _e2e_check("clamp:макс_160", int(tssr_fs_display("tssr_fs_text")) == 160, tssr_fs_display("tssr_fs_text"))
                for _ in range(500):
                    tssr_fs_bump("tssr_fs_text", -1)
                _e2e_check("clamp:мин_10", int(tssr_fs_display("tssr_fs_text")) == 10, tssr_fs_display("tssr_fs_text"))
                # мусор в поле -> остаётся текущее persistent-значение
                junk = _tssr_fs_norm("font_text_size", "abc")
                _e2e_check("garbage:не_ломает", junk == getattr(persistent, "font_text_size"), "%r" % junk)
                high = _tssr_fs_norm("font_text_size", "9999")
                _e2e_check("garbage:потолок_160", high == 160, "%r" % high)
                tssr_fs_snapshot()

            # --- 5. Применение меняет persistent и кегли ------------------
            def check_apply():
                before = getattr(persistent, "font_text_size")
                # Применение в игре зовёт utter_restart (перезапуск интерпретатора);
                # для теста глушим перезапуск и запись персиста, иначе сценарий
                # оборвётся на середине.
                real_restart = renpy.utter_restart
                real_save = renpy.save_persistent
                try:
                    renpy.utter_restart = lambda *a, **k: None
                    renpy.save_persistent = lambda *a, **k: None
                    globals()["tssr_fs_text"] = 40
                    tssr_fs_apply()
                finally:
                    renpy.utter_restart = real_restart
                    renpy.save_persistent = real_save
                _e2e_check("apply:persistent", getattr(persistent, "font_text_size") == 40, "%r" % getattr(persistent, "font_text_size"))
                delta = TSSR_FONT_GROUPS[tssr_font_group()]["text"] - TSSR_FONT_GROUPS["base"]["text"]
                _e2e_check("apply:gui_с_дельтой", gui.text_size == 40 + delta, "%r (delta=%r)" % (gui.text_size, delta))
                _e2e_shot("menu_after_apply")
                # вернуть как было, чтобы не тащить 40 в остальные проверки
                setattr(persistent, "font_text_size", before)
                update_font_styles()

            # --- 6. «Закрыть» без применения не меняет persistent ---------
            def check_close_without_apply():
                before = getattr(persistent, "font_text_size")
                tssr_fs_snapshot()
                globals()["tssr_fs_text"] = 51
                renpy.hide_screen("tssr_mod_menu")
                renpy.restart_interaction()
                _e2e_check("close:persistent_цел", getattr(persistent, "font_text_size") == before, "%r" % getattr(persistent, "font_text_size"))
                _e2e_check("close:черновик_жив", int(tssr_fs_display("tssr_fs_text")) == 51)
                tssr_fs_snapshot()

            # --- 7. Низ меню (подвал с кнопками) -------------------------
            def step_bottom():
                os.environ["TSSR_SHOTS_VY"] = "999999"
                renpy.hide_screen("tssr_mod_menu")
                renpy.show_screen("tssr_mod_menu")
                renpy.restart_interaction()

            def check_bottom():
                _e2e_check("menu_bottom:экран_жив", renpy.get_screen("tssr_mod_menu") is not None)
                _e2e_shot("menu_bottom")
                os.environ["TSSR_SHOTS_VY"] = "0"

            # --- 8. Смена языка на лету: кегли 4 наборов -----------------
            def check_lang_switch():
                saved = preferences.language
                for code in ("en", "ru", "zh", "ja", "ko", "de", "es", "fr", "it", "pl", "pt"):
                    preferences.language = None if code == "en" else code
                    tssr_apply_language_font()
                    base = TSSR_FONT_GROUPS["base"]["text"]
                    want = getattr(persistent, "font_text_size") + (
                        TSSR_FONT_GROUPS[tssr_font_group(code)]["text"] - base
                    )
                    # Стиль пересобирается на старте (и по кнопке «Применить»
                    # с перезапуском), поэтому здесь проверяем вход: gui.* —
                    # ровно то, из чего движок строит стили.
                    _e2e_check(
                        "lang:%s_кегль" % code,
                        gui.text_size == want,
                        "gui=%r want=%r persisted=%r group=%r pref=%r"
                        % (gui.text_size, want, getattr(persistent, "font_text_size"), tssr_font_group(), preferences.language),
                    )
                preferences.language = saved
                tssr_apply_language_font()

            # --- 9. Нижняя панель: подписи не дублируются ----------------
            def check_quick_panel():
                keys = ["Back", "History", "Skip", "Auto", "Save", "Q.Save", "Q.Load", "Prefs"]
                seen = {}
                for k in keys:
                    v = _e2e_tr(k)
                    if v in seen:
                        _e2e_check("quick:дубль_%s_%s" % (seen[v], k), False, "%r" % v)
                    seen[v] = k
                _e2e_check("quick:подписи_различны", len(seen) == len(keys), "%d уникальных из %d" % (len(seen), len(keys)))
                if _e2e_lang in _E2E_NONLATIN:
                    bad = [k for k in keys if _e2e_has_latin(_e2e_tr(k))]
                    _e2e_check("quick:переведены", not bad, "латиница в: %s" % ",".join(bad))

            # --- 10. Озвучка: статус паков и доступность файлов ----------
            def check_voice():
                # Проверка ДВУСТОРОННЯЯ: язык с паком должен показывать зелёную
                # точку и предупреждения не иметь; язык без пака — серую точку
                # и красное предупреждение. Так тест валиден и после того, как
                # владелец временно убрал пак (проверка подсветки 2026-11-14).
                code = preferences.language or "en"
                n = tssr_voice_count(code)
                _e2e_check("voice:ветка", n >= 0, "язык %r: файлов %d" % (code, n))
                has = n > 0
                # реальная доступность файла через движок (searchpath мода)
                import os as _os
                first = None
                base = _os.path.join(tssr_voice_root(), code)
                for dirpath, _dirs, files in _os.walk(base):
                    for f in files:
                        if f.endswith(".opus") or f.endswith(".wav"):
                            first = _os.path.join(dirpath, f)
                            break
                    if first:
                        break
                rel = None
                if first:
                    rel = "ai_voice/" + _os.path.relpath(first, tssr_voice_root()).replace("\\", "/")
                _e2e_check("voice:файл_виден_движку", (not has) or (bool(rel) and renpy.loadable(rel)), "%r" % rel)
                # индикатор на кнопке языка
                lbl = tssr_lang_label(code, "X")
                # «есть звук» = нота без зачёркивания; «нет» = {s}…{/s}
                if has:
                    _e2e_check("voice:метка", lbl.startswith("♪") and "{s}" not in lbl, "%r" % lbl)
                else:
                    _e2e_check("voice:метка", lbl.startswith("{s}") and "♪" in lbl, "%r" % lbl)
                _e2e_check("voice:метка_нет_языка", "{s}" in tssr_lang_label("xx", "X"))
                # строка статуса: с паком — число реплик, без пака — «скачайте пак»
                line = tssr_voice_status_line()
                if has:
                    _e2e_check("voice:статус", str(n) in line, "%r" % line)
                else:
                    _e2e_check("voice:статус_нет_пака", "voice-" in line or code in line, "%r" % line)
                # символ обязан быть в фолбэк-шрифте (иначе «тофу»)
                _e2e_check("voice:символ_шрифт", bool(tssr_symbol_font()))
                # «нет пака» — на выдуманном языке
                _e2e_check("voice:пустой_язык", tssr_voice_count("xx") == 0)

            # --- 11. Статус «демо/полный» по выбранному языку ------------
            def check_progress():
                d = tssr_progress()
                _e2e_check("progress:прочитан", int(d.get("total") or 0) > 0, "total=%r" % (d.get("total"),))
                code = "en" if preferences.language is None else preferences.language
                lines = tssr_progress_lines(code)
                _e2e_check("progress:две_строки", len(lines) == 2, "%r" % (lines,))
                if lines:
                    # подстановка выполнена (нет шаблонных {n}/{total}) и числа с разрядами
                    _e2e_check("progress:без_шаблонов", all("{" not in x for x in lines), "%r" % (lines,))
                    _e2e_check("progress:разряды", any(" " in x for x in lines), "%r" % (lines,))
                # маркер демо: озвучка почти всегда частичная -> должен быть True
                _e2e_check("progress:демо_флаг", tssr_is_demo(code) is True, "%r" % tssr_is_demo(code))

            def finish():
                _e2e_log("SUMMARY", "pass=%d fail=%d" % (_e2e_passes, len(_e2e_fails)), "fails=%s" % ",".join(_e2e_fails))
                renpy.quit()



            # --- 0. Стартовый кегль (главная гарантия игроку) -------------
            def check_startup_style():
                # На этом прогоне язык задан ДО старта, движок собрал стили из
                # наших gui.* -> проверяем именно то, что видит игрок.
                want = getattr(persistent, "font_text_size") + tssr_size_delta("text")
                say = getattr(getattr(style, "say_dialogue"), "size", None)
                _e2e_check("startup:стиль_реплик", say == want, "style=%r want=%r lang=%r" % (say, want, preferences.language))
                want_name = getattr(persistent, "font_name_size") + tssr_size_delta("name")
                nm = getattr(getattr(style, "say_label"), "size", None)
                _e2e_check("startup:стиль_имени", nm == want_name, "style=%r want=%r" % (nm, want_name))

            steps.append((1.2, check_startup_style))

            steps.append((2.0, step_open))
            steps.append((2.5, check_open))
            steps.append((3.0, check_labels))
            steps.append((3.4, check_dirty))
            steps.append((3.8, check_limits))
            steps.append((4.2, check_apply))
            steps.append((4.6, check_close_without_apply))
            steps.append((5.0, step_bottom))
            steps.append((5.5, check_bottom))
            steps.append((6.0, check_lang_switch))
            steps.append((6.5, check_quick_panel))
            steps.append((6.8, check_voice))
            steps.append((7.0, check_progress))
            steps.append((7.0, finish))
            return steps

        _e2e_queue = _e2e_steps()
        _e2e_t0 = {"t": None}

        def _e2e_tick():
            import time

            if _e2e_t0["t"] is None:
                _e2e_t0["t"] = time.time()
            el = time.time() - _e2e_t0["t"]
            # Защита от зависания: любая ошибка внутри шага не должна оставить
            # игру висеть (иначе CI/прогон встанет навсегда).
            if el > 90.0:
                _e2e_log("SUMMARY", "timeout", "выполнено за 90с, аварийный выход")
                renpy.quit()
                return
            while _e2e_queue and el >= _e2e_queue[0][0]:
                fn = _e2e_queue.pop(0)[1]
                try:
                    fn()
                except Exception as e:
                    # renpy.quit() штатно бросает QuitException — это не дефект.
                    if e.__class__.__name__ == "QuitException":
                        raise
                    _e2e_check("exception:%s" % getattr(fn, "__name__", "step"), False, repr(e))

        config.periodic_callbacks.append(_e2e_tick)
