################################################################################
## TSSR mod — аддитивный слой (в установке — mods/tssr-ai-voice-pack/;
## в репе — корень патча, зеркало установки).
## Подключение: environment.txt (корень установки) -> RENPY_SEARCHPATH.
## НИ ОДИН файл игры не изменяется.
##
## Содержимое:
##   1) Gui-патч: шрифт Literata (кастинг 2026-10-15, выбор владельца —
##      tmp/font_casting/index.html; прежний Forum) + размеры +
##      persistent-настройки шрифтов (порт git HEAD — наш патч, живший
##      в game/gui.rpy до апдейта 0.79; источники: tmp/mod-migration/...);
##   2) Расширяемый список языков TSSR_LANGUAGES;
##   2.1) Размеры шрифтов: числовые поля в меню (стейджинг: черновик ->
##      Применить; см. UX-решение в секции 2.1);
##   3) Кнопка-бейдж (штатный хук label before_main_menu,
##      renpy/common/00start.rpy:308-309, + config.overlay_screens в игре)
##      -> страница настроек tssr_mod_menu: язык, озвучка, размеры шрифтов,
##      ссылки (GitHub/Boosty);
##   4) translate ru strings для строк нашего меню.
##
## НЕ перенесено (решение владельца 2026-10-14): старая оболочка
## preferences и правки меню (хуки H11/H15/H19/H27) — официальные экраны
## 0.79 остаются как есть и не переопределяются.
##
## Правила (доказаны ресёрчем 2026-10-14, tasks/2026-10-14-update-proof-...):
##   - наш файл грузится ПОСЛЕ официальных (zzz_) и после gui.init
##     (официальный game/gui.rpy имеет init offset = -2) -> define/стили
##     позднего файла побеждают;
##   - import renpy ЗАПРЕЩЁН (перебивает алиас renpy.exports в store);
##   - default-дубли официальных ключей не использовать;
##   - label-имена придумать свои (before_main_menu в игре отсутствует —
##     проверено grep'ом 2026-10-14).
################################################################################


################################################################################
## 1. Gui-патч (порт gui.HEAD.rpy; ШРИФТ заменён на Literata — кастинг
##    2026-10-15, победитель tmp/font_casting/index.html, файл лежит в
##    fonts/ и резолвится тем же "fonts/..."-путём через RENPY_SEARCHPATH)
################################################################################

## Шрифты: цепочка фолбэка (рецепт NeonTranslator 2026-11-11: по-языковые
## Noto для CJK) — Literata рисует латиницу/кириллицу, CJK-глифы подхватывает
## Noto по недостающим глифам (ja/ko/zh без «□□»).
define gui.text_font = "fonts/Literata-Regular.ttf"

## Настоящий Bold (instance из Literata-VF, fonts/Literata-Bold.ttf):
## заголовки/секции — уровень иерархии (ревью R6 2026-11-11).
define tssr_font_bold = "fonts/Literata-Bold.ttf"

## The font that is used for the names of characters.
define gui.name_text_font = "fonts/Literata-Regular.ttf"

## The font that is used for user interface text.
define gui.interface_text_font = "fonts/Literata-Regular.ttf"

## Font sizes
define gui.text_size = 32
define gui.name_text_size = 38
define gui.interface_text_size = 28
define gui.label_text_size = 36
define gui.notify_text_size = 24
define gui.title_text_size = 75

default persistent.font_text_size = 32
default persistent.font_name_size = 38
default persistent.font_interface_size = 28
default persistent.font_label_size = 36
default persistent.font_notify_size = 24
default persistent.font_title_size = 75

## Производные gui.* — переобъявляем ПОСЛЕ официального gui.rpy, иначе они
## заморожены на официальных базах (HEAD: gui.HEAD.rpy 244/247/294/295).
define gui.button_text_font = gui.interface_text_font
define gui.button_text_size = gui.interface_text_size
define gui.choice_button_text_font = gui.text_font
define gui.choice_button_text_size = gui.text_size

init python:
    # КЕГЛИ: ЧЕТЫРЕ НАБОРА — база для всех языков + три иероглифических
    # (zh / ja / ko). Причина: иероглифы плотнее латиницы, при том же кегле
    # текст читается мельче (обоснование, источники и методика проверки —
    # docs/cjk-typography.md).
    #
    # ЭТОТ ФАЙЛ — ЕДИНСТВЕННЫЙ ИСТОЧНИК этих чисел: он же и конфиг, и
    # потребитель (init python -> gui.* -> стили). Второй копии нет намеренно:
    # внешний JSON пришлось бы держать в синхроне тестом, то есть дублировать
    # знание ради самого дублирования. Тест ui_font_presets.test.mts читает
    # таблицу прямо отсюда и проверяет инварианты (4 набора, 6 кеглей,
    # дельты +2/+2/+1, применение на старте).
    #
    # Набор — это ДЕЛЬТА к базе, а не абсолют: игрок крутит свои размеры в
    # меню мода (persistent.font_*), набор языка приподнимает их на ту же
    # величину. Так правило работает и для дефолтов, и для ручных настроек.
    TSSR_FONT_GROUPS = {
        "base": {"text": 32, "name": 38, "iface": 28, "label": 36, "notify": 24, "title": 75},
        "zh": {"text": 34, "name": 40, "iface": 30, "label": 38, "notify": 26, "title": 77},
        "ja": {"text": 34, "name": 40, "iface": 30, "label": 38, "notify": 26, "title": 77},
        "ko": {"text": 33, "name": 39, "iface": 29, "label": 37, "notify": 25, "title": 76},
    }

    FONT_DEFAULTS = {
        'font_text_size': TSSR_FONT_GROUPS['base']['text'],
        'font_name_size': TSSR_FONT_GROUPS['base']['name'],
        'font_interface_size': TSSR_FONT_GROUPS['base']['iface'],
        'font_label_size': TSSR_FONT_GROUPS['base']['label'],
        'font_notify_size': TSSR_FONT_GROUPS['base']['notify'],
        'font_title_size': TSSR_FONT_GROUPS['base']['title'],
    }

    # Шрифт по активному языку (рецепт NeonTranslator 2026-11-11: по-языковые
    # Noto для CJK; точка подключения — update_font_styles, тот же механизм,
    # что и размеры шрифтов).
    def tssr_font_group(code=None):
        # Язык -> набор кеглей. Всё, чего нет в карте (включая None = EN),
        # читается базовым набором.
        code = preferences.language if code is None else code
        return code if code in TSSR_FONT_GROUPS else "base"

    def tssr_size_delta(key, code=None):
        # Насколько набор языка выше базового: 0 для латиницы/кириллицы,
        # +2 для zh/ja, +1 для ko. Единственный источник — TSSR_FONT_GROUPS.
        return TSSR_FONT_GROUPS[tssr_font_group(code)][key] - TSSR_FONT_GROUPS["base"][key]

    TSSR_LANG_FONT = {
        "ja": "fonts/NotoSansCJKjp-Regular.otf",
        "ko": "fonts/NotoSansCJKkr-Regular.otf",
        "zh": "fonts/NotoSansCJKsc-Regular.otf",
    }


    # ── ОЗВУЧКА: что реально установлено ───────────────────────────────────
    # Зачем: main-архив несёт ТЕКСТОВЫЕ переводы, а голоса лежат отдельными
    # паками voice-<lang>. Игрок ставит main и не понимает, почему молчит —
    # в меню должно быть видно, какой язык озвучен, а какой нет.
    # Считаем один раз за запуск (скан ~200 папок на язык — это дёшево, но в
    # каждом кадре меню повторять нельзя), кеш живёт до перезапуска игры.
    TSSR_VOICE_COUNTS = {}

    def tssr_voice_root():
        # Корень мода уже вычислен в voice_config.rpy (init -999), поэтому
        # переиспользуем его; фолбэк — каноническая папка установки.
        import os as _os

        root = globals().get("_MOD_ROOT") or _os.path.join(config.basedir, "mods", "tssr-ai-voice-pack")
        return _os.path.join(root, "ai_voice")

    def tssr_voice_count(code):
        # Сколько файлов озвучки стоит для языка (0 = пак не установлен).
        import os as _os

        if code in TSSR_VOICE_COUNTS:
            return TSSR_VOICE_COUNTS[code]
        total = 0
        base = _os.path.join(tssr_voice_root(), code or "en")
        try:
            for _dirpath, _dirnames, _files in _os.walk(base):
                for _f in _files:
                    if _f.endswith(".opus") or _f.endswith(".wav"):
                        total += 1
        except Exception:
            total = 0
        TSSR_VOICE_COUNTS[code] = total
        return total

    def tssr_voice_codes():
        # Коды языков меню: английский хранится как None, но папка у него "en".
        return [("en" if c is None else c) for c, _title in TSSR_LANGUAGES]

    def tssr_voice_langs_installed():
        # Языки, у которых есть хоть один файл: [(code, count), ...]
        return [(c, tssr_voice_count(c)) for c in tssr_voice_codes() if tssr_voice_count(c)]

    def tssr_voice_langs_missing():
        # Языки без единого файла: [code, ...]
        return [c for c in tssr_voice_codes() if not tssr_voice_count(c)]

    def tssr_symbol_font():
        # СИМВОЛ, А НЕ ЦВЕТ (запрос владельца 2026-11-14: «дальтоники ругаются»).
        # Нота ♪ есть в Noto, но НЕТ в Literata — без фолбэка вышло бы «тофу».
        # FontGroup отдаёт Literata для латиницы/кириллицы и Noto для символов.
        if not globals().get("_TSSR_SYMBOL_FONT"):
            try:
                _fg = FontGroup()
                _fg.add("fonts/Literata-Bold.ttf", 0x0000, 0x24FF)
                _fg.add("fonts/NotoSansCJKsc-Regular.otf", 0x24FF, 0xFFFF)
                globals()["_TSSR_SYMBOL_FONT"] = _fg
            except Exception:
                globals()["_TSSR_SYMBOL_FONT"] = "fonts/Literata-Bold.ttf"
        return globals()["_TSSR_SYMBOL_FONT"]


    # ── ДЕМО или полная локализация (честное предупреждение) ────────────────
    # Цифры считает СБОРКА (catalog_gen.mts -> catalog/progress.json): рантайм
    # не должен читать po/ и обходить тысячи файлов. Показываем по ВЫБРАННОМУ
    # языку: текст и озвучка отдельно, плюс маркер «демо», если что-то неполное.
    TSSR_PROGRESS = {}

    def tssr_progress():
        if not TSSR_PROGRESS:
            try:
                import json as _json

                _f = renpy.file("catalog/progress.json")
                TSSR_PROGRESS.update(_json.loads(_f.read().decode("utf-8")))
                _f.close()
            except Exception:
                pass
        return TSSR_PROGRESS

    def tssr_progress_lines(code):
        _d = tssr_progress()
        _total = int(_d.get("total") or 0)
        _row = (_d.get("langs") or {}).get(code) or {}
        if not _total or not _row:
            return []
        _tr = int(_row.get("translated") or 0)
        _vo = int(_row.get("voiced") or 0)
        # Числа — с разделителем разрядов (69 120 читаемо, 69120 — нет).
        _fmt = lambda v: "{:,}".format(int(v)).replace(",", " ")
        if _tr >= _total:
            _text = tssr_tr("Text: full ({n} of {total} lines)").format(n=_fmt(_tr), total=_fmt(_total))
        else:
            _text = tssr_tr("Text: demo - {p}% ({n} of {total} lines)").format(
                p=int(round(100.0 * _tr / _total)), n=_fmt(_tr), total=_fmt(_total))
        if _vo >= _total:
            _voice = tssr_tr("Voice: full ({n} of {total} lines)").format(n=_fmt(_vo), total=_fmt(_total))
        else:
            _voice = tssr_tr("Voice: demo - {n} of {total} lines").format(n=_fmt(_vo), total=_fmt(_total))
        return [_text, _voice]

    def tssr_is_demo(code=None):
        # Демо = текст ИЛИ озвучка неполные (страховка от «купил полный, а там демо»).
        _code = code or ("en" if preferences.language is None else preferences.language)
        _d = tssr_progress()
        _total = int(_d.get("total") or 0)
        if not _total:
            return False
        _row = (_d.get("langs") or {}).get(_code) or {}
        _tr = int(_row.get("translated") or 0)
        _vo = int(_row.get("voiced") or 0)
        return not (_tr >= _total and _vo >= _total)

    def tssr_lang_label(code, title):
        # Индикатор озвучки прямо на кнопке языка, СИМВОЛОМ:
        #   ♪        — пак установлен (звук есть)
        #   ♪ зачёркнутая ({s}) — только текст, звука нет
        # Смысл несёт форма, а не цвет: работает и без различения цветов.
        _slot = "en" if code is None else code
        _on = tssr_voice_count(_slot) > 0
        return ("♪ %s" if _on else "{s}♪{/s} %s") % title

    def tssr_tr(text):
        # ВАЖНО: `_()` — маркер для .rpy-кода; внутри python-функций он НЕ
        # переводит (проверено E2E: строка статуса оставалась английской).
        # Для строк, собранных в коде, переводим явно.
        try:
            return renpy.translation.translate_string(text)
        except Exception:
            return text

    def tssr_voice_status_line():
        # Строка для активного языка: сколько реплик ИЛИ что пака нет.
        _code = preferences.language or "en"
        _n = tssr_voice_count(_code)
        if _n:
            return tssr_tr("Voice files: {n} lines").format(n=_n)
        return tssr_tr("No voice files for this language - download voice-{lang} on Nexus Mods.").format(lang=_code)

    def tssr_current_font():
        return TSSR_LANG_FONT.get(preferences.language, "fonts/Literata-Regular.ttf")

    def tssr_lang_font(code):
        # Шрифт МЕТКИ языка = шрифт её языка (ревью R4 2026-11-11):
        # «日本語/한국어/中文» читаемы при любом активном языке UI.
        # Для латиницы — FontGroup с фолбэком, иначе символ ♪ в подписи
        # превращается в пустой квадрат (в Literata его нет).
        return TSSR_LANG_FONT.get(code, tssr_symbol_font())

    def tssr_shots_vy():
        # Позиция скролла панели для QA-съёмки (харнесс zz_capture: верх=0,
        # низ=999999 зажимается максимумом); в игре без env всегда 0.
        import os
        return int(os.environ.get("TSSR_SHOTS_VY", "0"))

    def tssr_apply_language_font():
        # K-E10: смена языка на лету. Шрифты — через translate-style блоки
        # (5.2); здесь gui.* + rebuild (только в рантайме!) + пересоздание
        # экрана (отрисовка кэшируется виджетами).
        # ПОРЯДОК ВАЖЕН (проба 2026-11-14): gui.rebuild() ОТКАТЫВАЕТ gui.* к
        # значениям `define` (32/38/28/24/75), поэтому сначала rebuild, и
        # только потом применяем свои размеры — иначе после смены языка
        # пользовательские размеры и CJK-надбавка терялись до перезапуска.
        gui.rebuild()
        update_font_styles(rebuild=True)
        if renpy.get_screen("tssr_mod_menu"):
            renpy.hide_screen("tssr_mod_menu")
            renpy.show_screen("tssr_mod_menu")
        renpy.restart_interaction()

    def update_font_styles(rebuild=False):
        # МЕХАНИЗМ (вскрыто 2026-11-11): gui.* — источник; стили пер-языковыми
        # translate-style блоками (5.2). ВАЖНО: gui.rebuild() НЕЛЬЗЯ звать при
        # init (clean_store_backup ещё None -> AttributeError, падение старта) —
        # rebuild живёт в стартовом колбэке и в tssr_apply_language_font.
        gui.text_size = persistent.font_text_size + tssr_size_delta('text')
        gui.name_text_size = persistent.font_name_size + tssr_size_delta('name')
        gui.interface_text_size = persistent.font_interface_size + tssr_size_delta('iface')
        gui.label_text_size = persistent.font_label_size + tssr_size_delta('label')
        gui.notify_text_size = persistent.font_notify_size + tssr_size_delta('notify')
        gui.title_text_size = persistent.font_title_size + tssr_size_delta('title')
        gui.button_text_size = gui.interface_text_size
        gui.choice_button_text_size = gui.text_size
        _f = tssr_current_font()
        gui.text_font = _f
        gui.name_text_font = _f
        gui.interface_text_font = _f
        gui.button_text_font = _f
        gui.choice_button_text_font = _f
        tssr_apply_text_styles(rebuild)

    def tssr_apply_text_styles(rebuild=False):
        # ЗАЧЕМ ЭТО: в стандартном шаблоне Ren'Py размеры стилей берутся из
        # gui.*, но ЭТА игра рисует текст собственными стилями с жёсткими
        # кеглями — gui.text_size = 40 не менял ничего (стиль оставался 32).
        # Проверено E2E в живой игре 2026-11-14: gui.* не доходит до стилей,
        # а прямое назначение (style.say_dialogue.size) работает.
        # Трогаем ТОЛЬКО читаемый текст: реплики, имя говорящего, выбор.
        # Меню/галерею/титул не переопределяем — там своя вёрстка.
        _map = (
            ("say_dialogue", "text_size"),
            ("say_label", "name_text_size"),
            ("choice_button_text", "text_size"),
        )
        for _style_name, _gui_attr in _map:
            try:
                getattr(style, _style_name).size = getattr(gui, _gui_attr)
            except Exception:
                pass
        # Стилям, созданным игрой, назначение «вступает в силу» только после
        # пересборки стилей (проверено: say_label 38 -> 39 без rebuild не
        # менялся). На init rebuild запрещён, поэтому флаг передают рантайм-
        # пути: стартовый колбэк и смена языка.
        if rebuild:
            try:
                renpy.style.rebuild()
            except Exception:
                pass

    def tssr_apply_fonts_at_start():
        # СТАРТОВЫЙ КОЛБЭК — обязателен, а не «на всякий случай» (проба
        # 2026-11-14): базовая игра и движковые preference-слои переприменяют
        # gui.* ПОСЛЕ наших init-блоков, и без этого хука иероглифические
        # языки стартовали с базовым кеглем (zh 30 px вместо 32 запрошенных).
        # Колбэк идёт после init и до первого кадра, поэтому его значения
        # последние; rebuild нужен, чтобы стили пересобрались из новых gui.*.
        gui.rebuild()
        update_font_styles(rebuild=True)

    config.start_callbacks.append(tssr_apply_fonts_at_start)

    def update_all():
        # gui.* + пересборка — внутри update_font_styles (единый механизм)
        update_font_styles()
        renpy.save_persistent()
        renpy.utter_restart()

    def reset_font_sizes():
        persistent.font_text_size = FONT_DEFAULTS['font_text_size']
        persistent.font_name_size = FONT_DEFAULTS['font_name_size']
        persistent.font_interface_size = FONT_DEFAULTS['font_interface_size']
        persistent.font_label_size = FONT_DEFAULTS['font_label_size']
        persistent.font_notify_size = FONT_DEFAULTS['font_notify_size']
        persistent.font_title_size = FONT_DEFAULTS['font_title_size']
        update_all()

    ## Первичный прогон: применяем persistent-размеры (и CJK-надбавку) к стилям.
    update_font_styles()


################################################################################
## 2. Языки — ЕДИНСТВЕННОЕ место правки при добавлении новой локализации
################################################################################

init python:

    # (код языка, отображаемое имя); None = английский (оригинал игры).
    # Добавление языка: строка сюда + translate <код> strings: (или
    # tl/<код>/*.rpy) + при необходимости ai_voice/<код>/ с озвучкой.
    # Официальные файлы игры не трогаются.
    # Полная матрица языков патча (владелец 2026-11-11: en — нативный язык,
    # наравне с остальными): None = English (оригинал игры).
    # ПОРЯДОК = приоритет языков config/language-priority.json (статистика
    # Steam, окт 2026; владелец 2026-11-13) — не переставлять руками.
    TSSR_LANGUAGES = [
        (None, "English"),
        ("zh", "中文"),
        ("ru", "Русский"),
        ("es", "Español"),
        ("pt", "Português"),
        ("de", "Deutsch"),
        ("ja", "日本語"),
        ("fr", "Français"),
        ("pl", "Polski"),
        ("ko", "한국어"),
        ("it", "Italiano"),
    ]

    # Короткие коды для КНОПКИ (подпись = текущий язык; ENG/RUS — привычные
    # для игр 3-буквенные формы, не спутать с флагом/регионом). Новый язык =
    # добавить строку в TSSR_LANGUAGES + сюда.
    TSSR_LANG_SHORT = {
        None: "ENG",
        "ru": "RUS",
        "de": "DEU",
        "es": "ESP",
        "fr": "FRA",
        "it": "ITA",
        "ja": "JPN",
        "ko": "KOR",
        "pl": "POL",
        "pt": "POR",
        "zh": "ZHO",
    }

    def tssr_current_short():
        # Текущий язык -> короткий код кнопки ("RUS"/"ENG"/...).
        for code, title in TSSR_LANGUAGES:
            if Language(code).get_selected():
                return TSSR_LANG_SHORT.get(code, (code or "en").upper())
        return "ENG"


################################################################################
## 2.1 Размеры шрифтов: числовые поля со «стейджингом» (черновик -> Применить)
##
##     Поля ввода пишут в store-переменные tssr_fs_* (НЕ в persistent) — это
##     черновик. При открытии страницы черновик снапшотится из persistent
##     (on "show" -> tssr_fs_snapshot). «Применить» клонирует черновик в
##     persistent и зовёт update_all() (перезапуск); «Закрыть» черновик просто
##     отбрасывает.
##     UX-паттерн (ресёрч 2026-10-15): мгновенные настройки (язык/голос) — без
##     кнопки сохранения; тяжёлые, требующие рестарта (шрифты) — явный Apply;
##     в подвале страницы — динамическая кнопка: «Применить и перезапустить»
##     видна ТОЛЬКО при неприменённых изменениях (паттерн «save disabled,
##     когда изменений нет» / «unsaved changes prompt»).
################################################################################

default tssr_fs_text = 32
default tssr_fs_name = 38
default tssr_fs_interface = 28

init python:

    # (persistent-поле, store-черновик, original-заголовок строки).
    # ЕДИНСТВЕННОЕ место правки. В МЕНЮ — только то, что даёт игроку ценность:
    # читаемость реплик, имён говорящих и интерфейса. Служебные кегли
    # (Header/Notification/Game title) остаются ВНУТРЕННИМИ: их масштабирует
    # пресет языка (TSSR_FONT_GROUPS), а ручка в меню — инфошум, который
    # ничего не решает у игрока (титул главного меню читается всегда, а
    # уведомление живёт секунду).
    TSSR_FS_ROWS = [
        ("font_text_size", "tssr_fs_text", "Dialogue text"),
        ("font_name_size", "tssr_fs_name", "Names"),
        ("font_interface_size", "tssr_fs_interface", "UI text"),
    ]

    def tssr_fs_bump(var, delta):
        # Кнопки +/- (страница настроек): целочисленная правка черновика.
        # Инпуты убраны осознанно: в Ren'Py 7.4.11 клик по инпуту НЕ активирует
        # редактирование (в Input.event нет ветки мыши; editable выставляет
        # только InputValue.Enable/Disable) — жить могло лишь default-поле.
        # Мусор в поле = считаем 24; нормализация и кламп — в _tssr_fs_norm.
        st = globals()
        try:
            v = int(str(st[var]).strip())
        except Exception:
            v = 24
        st[var] = max(10, min(160, v + delta))

    def tssr_fs_display(var):
        # Текущее значение черновика для показа в строке +/-.
        return str(globals()[var])

    def _tssr_fs_norm(attr, value):
        # Поле ввода -> строка, persistent -> int. Валидное целое зажимается
        # в 10..160; мусор/пусто = оставить текущее persistent-значение.
        try:
            v = int(str(value).strip())
        except Exception:
            return int(getattr(persistent, attr))
        return max(10, min(160, v))

    def tssr_fs_snapshot():
        # Черновик <- persistent (on "show" страницы настроек).
        st = globals()
        for attr, var, _title in TSSR_FS_ROWS:
            st[var] = getattr(persistent, attr)

    def tssr_fs_dirty():
        # Есть ли неприменённые изменения (динамическая кнопка подвала).
        st = globals()
        for attr, var, _title in TSSR_FS_ROWS:
            if _tssr_fs_norm(attr, st[var]) != getattr(persistent, attr):
                return True
        return False

    def tssr_fs_apply():
        # Черновик -> persistent + стили + gui.rebuild + перезапуск.
        st = globals()
        for attr, var, _title in TSSR_FS_ROWS:
            setattr(persistent, attr, _tssr_fs_norm(attr, st[var]))
        update_all()

    def tssr_fs_reset_draft():
        # Сброс ЧЕРНОВИКА до дефолтов (persistent не трогаем: подвал станет
        # «грязным», игрок применит осознанно кнопкой Применить).
        st = globals()
        for attr, var, _title in TSSR_FS_ROWS:
            st[var] = FONT_DEFAULTS[attr]

    def tssr_fs_preview_size(var):
        # Кегль preview-строки: clamp 8..48 — большие значения не раздувают
        # строку (страница с фиксированной сеткой, без прыжков).
        try:
            v = int(str(globals()[var]).strip())
        except Exception:
            v = 24
        return max(8, min(v, 48))


################################################################################
## 3. Кнопка: главное меню + процесс игры -> наше меню
################################################################################

init python:

    import os
    # Папку мода вычисляет voice_config.rpy (init -999 — раньше этого блока);
    # __file__ в python-блоках врёт (store-неймспейс, см. voice_config.rpy).
    # Фолбэк — на случай частичной установки без voice_config.rpy.
    _TSSR_MOD_DIR = globals().get("_MOD_ROOT") or os.path.join(
        config.basedir, "mods", "tssr-ai-voice-pack")

    def tssr_menu_marker(where="label"):
        # Диагностика: какой хук сработал -> <папка мода>/last_menu_hook.txt
        try:
            fn = os.path.join(_TSSR_MOD_DIR, "last_menu_hook.txt")
            f = open(fn, "w")
            f.write("hook: %s, button=%s\n" % (where, tssr_current_short()))
            f.close()
        except Exception:
            pass

    # Кнопка В ПРОЦЕССЕ ИГРЫ: второй hook-экран в overlay-списке — движок
    # показывает его в игре и прячет в меню (так же работает quick_menu:
    # game/screens.rpy:269). Список в меню подавлен (display/screen.py:1407-1411),
    # поэтому ГЛАВНОЕ МЕНЮ обслуживает ОТДЕЛЬНЫЙ экран tssr_menu_hook через
    # label ниже — их нельзя объединять в один экран: движок прятал бы и его.
    if "tssr_game_hook" not in config.overlay_screens:
        config.overlay_screens.append("tssr_game_hook")

# Штатный хук движка (renpy/common/00start.rpy:308-309): вызывается при каждом
# входе в главное меню. Внимание: только код и return — никаких jump (иначе
# меню скипается; лемма t=42498).
label before_main_menu:
    $ renpy.show_screen("tssr_menu_hook")
    $ tssr_menu_marker("before_main_menu")
    return

screen tssr_button(quiet=False):
    # Общая кнопка-бейдж (подпись = текущий язык: RUS/ENG), правый верхний
    # угол. Скрываем, пока открыта страница настроек (она сама содержит языки).
    # quiet=True (процесс игры): idle почти невидим, hover вспыхивает
    # (progressive disclosure: редкая вторичная настройка не должна съедать
    # канву, но обязана быть находимой; hitbox полный — кликабельно всегда).
    if not renpy.get_screen("tssr_mod_menu"):
        frame:
            style "empty"
            # Максимально в угол (право-верх): тонкий отступ, чтобы пилюля
            # не прилипала к краю экрана, но и не «жила» внутри.
            xalign 0.995
            yalign 0.012

            if quiet:
                textbutton tssr_current_short():
                    # Снапшот черновика ДО открытия (порядок гарантирован).
                    action [Function(tssr_fs_snapshot), ShowMenu("tssr_mod_menu")]
                    style "tssr_badge_quiet"
            else:
                textbutton tssr_current_short():
                    action [Function(tssr_fs_snapshot), ShowMenu("tssr_mod_menu")]
                    style "tssr_badge"

screen tssr_menu_hook():
    # ГЛАВНОЕ МЕНЮ: показывается label'ом before_main_menu; в overlay-списке
    # НЕ состоит — движок его в меню не прячет (в отличие от game_hook).
    # В меню бейдж ПОЛНОСТЬЮ видим: там нет «картинки», которую он съедает,
    # и он — основная точка входа в настройки (контекстное разделение БП).
    zorder 50
    on "show" action Function(tssr_menu_marker, "menu_hook")
    use tssr_button

screen tssr_game_hook():
    # ПРОЦЕСС ИГРЫ: в config.overlay_screens (см. init python выше) — видна
    # всю игру; в меню и на сплэше движок прячет её автоматически.
    # Тихий режим: idle 35% текст / 12% фон -> hover-акцент (см. стили ниже).
    zorder 50
    on "show" action Function(tssr_menu_marker, "game_hook")
    use tssr_button (quiet=True)


################################################################################
## 4. Страница настроек TSSR — НА ВЕСЬ ЭКРАН (полупрозрачный тёмный фон,
##    главный план слегка виден; колонка фиксированной ширины -> контент не
##    «прыгает» за счёт строк). Своя: не завязана на официальные экраны 0.79.
##    Расширение: новая секция = блок внутри tssr_mod_menu (+ helper в
##    секции 2.1 и пара строк old/new в translate ниже).
################################################################################

screen tssr_mod_menu():
    tag menu

    # Снапшот черновика (persistent -> tssr_fs_*) делает КНОПКА-БЕЙДЖ ДО
    # ShowMenu (см. tssr_button): порядок «снапшот -> execute экрана»
    # гарантирован, инпуты сразу получают актуальные значения. on "show"
    # здесь не используется: событие show приходит после сборки детей и
    # перезапускало бы интеракшен (а Function на rebuild мог бы затирать
    # то, что игрок уже напечатал).

    add gui.main_menu_background

    frame:
        style "tssr_mod_page"

        # Скролл-контейнер: панель обязана помещаться ЛЮБЫМ составом секций
        # (ревью R7 2026-11-11: контент выше канвы 1080 — без прокрутки
        # нижние секции уезжали). TSSR_SHOTS_VY — позиция скролла для QA-съёмки
        # (харнесс zz_capture снимает верх+низ: полное ревью «сверху до низу»).
        viewport:
            mousewheel True
            draggable True
            scrollbars "vertical"
            yinitial tssr_shots_vy()

            vbox:
                style "tssr_mod_column"

                ## ── Шапка ───────────────────────────────────────────────
                text _("Sarah Rose — AI Voice Pack"):
                    style "tssr_mod_title"

                text _("Settings: language, voice, fonts, links."):
                    style "tssr_mod_hint"

                ## ── Верхняя панель действий (UX 2026-11-11, владелец:
                ## «сайт к шапке, дубль ОК наверху — не хочу скроллить вниз»;
                ## донат-CTA: глагол + конкретная польза + тепло (маркетинг).
                fixed:
                    xfill True
                    yfit True

                    vbox:
                        spacing 10
                        xsize 720

                        text _("Donations keep the patch alive: new languages, voices and AI costs. Thank you!"):
                            style "tssr_mod_hint"
                            xsize 720

                        hbox:
                            spacing 12

                            textbutton _("Support the patch"):
                                action OpenURL("https://boosty.to/domovikx")
                                style "tssr_primary"

                            textbutton _("Patch site"):
                                action OpenURL("https://domovikx.github.io/The-Survival-of-Sarah-Rose-Mods/")
                                style "tssr_link"

                    hbox:
                        spacing 16
                        xalign 1.0

                        if tssr_fs_dirty():
                            textbutton _("Revert changes"):
                                action [Function(tssr_fs_snapshot), Function(renpy.restart_interaction)]
                                style "tssr_secondary"

                            textbutton _("Apply and restart"):
                                action Function(tssr_fs_apply)
                                style "tssr_primary"
                        else:
                            textbutton _("OK"):
                                action Return()
                                style "tssr_primary"

                frame:
                    style "tssr_divider"

                ## ── Язык интерфейса: сетка 4×3, кнопки фикс-ширины ─────
                ## (ревью R1/R3: не переносящийся hbox рвал слова и экран)
                text _("Interface language"):
                    style "tssr_mod_section"

                grid 4 3:
                    xsize 1400
                    spacing 16

                    for code, title in TSSR_LANGUAGES:
                        textbutton tssr_lang_label(code, title):
                            # Language() переводит строки; tssr_apply_language_font —
                            # живая смена шрифта (баг 2026-11-11: без неё CJK
                            # после переключения рисовался квадратиками).
                            action [Language(code), Function(tssr_apply_language_font)]
                            selected Language(code).get_selected()
                            style "tssr_lang"
                            # Шрифт МЕТКИ = шрифт её языка (ревью R4):
                            # «日本語/한국어/中文» читаемы при любом UI-языке.
                            text_font tssr_lang_font(code)
                    null

                ## Легенда: символы с подписями (без цвета — для дальтоников).
                hbox:
                    spacing 28
                    text ("♪  " + tssr_tr("voice pack installed")):
                        style "tssr_mod_hint"
                        font tssr_symbol_font()
                    text ("{s}♪{/s}  " + tssr_tr("no voice pack - text only")):
                        style "tssr_mod_hint"
                        font tssr_symbol_font()

                ## Статус выбранного языка: текст и озвучка отдельно + «демо».
                $ _tssr_plines = tssr_progress_lines("en" if preferences.language is None else preferences.language)
                if _tssr_plines:
                    vbox:
                        spacing 2
                        text _tssr_plines[0]:
                            style "tssr_mod_hint"
                        text _tssr_plines[1]:
                            style "tssr_mod_hint"

                ## ── Озвучка ─────────────────────────────────────────────
                text _("Voice acting"):
                    style "tssr_mod_section"

                hbox:
                    spacing 16

                    textbutton _("Enabled"):
                        action SetMute("voice", False)
                        selected (not ToggleMute("voice").get_selected())
                        style "tssr_choice"

                    textbutton _("Disabled"):
                        action SetMute("voice", True)
                        selected ToggleMute("voice").get_selected()
                        style "tssr_choice"

                ## Что реально установлено: main несёт только текст, голоса —
                ## отдельными паками voice-<lang> (см. tssr_voice_status_line).
                ## Предупреждение ONLY когда активный язык без файлов: игрок
                ## иначе не поймёт, почему озвучка молчит (main = только текст).
                if not tssr_voice_count(preferences.language or "en"):
                    text tssr_voice_status_line():
                        style "tssr_mod_hint"
                        color "#ff9b9b"

                frame:
                    style "tssr_divider"

                ## ── Размеры шрифтов ────────────────────────────────────
                text _("Font sizes"):
                    style "tssr_mod_section"

                text _("Whole numbers 10-160, applied on game restart."):
                    style "tssr_mod_hint"

                for attr, var, title in TSSR_FS_ROWS:
                    hbox:
                        spacing 20
                        ysize 56

                        text _(title):
                            style "tssr_mod_row"

                        textbutton "-":
                            action [Function(tssr_fs_bump, var, -1), Function(renpy.restart_interaction)]
                            style "tssr_step"
                            yalign 0.5

                        frame:
                            style "tssr_mod_input_box"
                            yalign 0.5

                            text tssr_fs_display(var):
                                style "tssr_mod_value"

                        textbutton "+":
                            action [Function(tssr_fs_bump, var, 1), Function(renpy.restart_interaction)]
                            style "tssr_step"
                            yalign 0.5

                        text _("Preview text"):
                            style "tssr_mod_preview"
                            size tssr_fs_preview_size(var)

                hbox:
                    spacing 16

                    textbutton _("Reset to defaults"):
                        action [Function(tssr_fs_reset_draft), Function(renpy.restart_interaction)]
                        style "tssr_secondary"

                ## ── Подвал: динамический (UX-формулировка владельца:
                ## «назад, если ничего не менял, иначе — сохранить/применить»;
                ## 2026-10-16: «Close» -> «ОК» — после смены языка кнопка
                ## читается как подтверждение, а не как побег) ────────────
                hbox:
                    spacing 16
                    xalign 1.0

                    if tssr_fs_dirty():
                        textbutton _("Revert changes"):
                            action [Function(tssr_fs_snapshot), Function(renpy.restart_interaction)]
                            style "tssr_secondary"

                        textbutton _("Apply and restart"):
                            action Function(tssr_fs_apply)
                            style "tssr_primary"
                    else:
                        textbutton _("OK"):
                            action Return()
                            style "tssr_primary"

    # Esc = зеркало подвала: при изменениях — Применить, иначе — ОК.
    key "game_menu" action (Function(tssr_fs_apply) if tssr_fs_dirty() else Return())


## Фон: вся страница, тёмный полупрозрачный — фон меню едва виден (правка
## владельца 2026-10-16: «хочется больше уровень затемнения»: c7=78% -> e6=90%;
## ещё темнее — f2=95%).
style tssr_mod_page is frame:
    xfill True
    yfill True
    background Solid("#0b0e14e6")
    padding (80, 48, 80, 48)

## Колонка контента: ФИКСИРОВАННАЯ ширина — контент не меняет геометрию.
## 1400 при канве 1920 = по 260 воздуха по краям (ревью R1/R2 2026-11-11:
## при 1100 контент вылезал и обрезался по краям экрана).
style tssr_mod_column is vbox:
    xalign 0.5
    xsize 1400
    spacing 24

style tssr_mod_title is gui_text:
    font tssr_font_bold
    size 46
    color "#ffffff"

style tssr_mod_hint is gui_text:
    size 22
    color "#9aa4b2"

style tssr_mod_section is gui_text:
    font tssr_font_bold
    size 30
    color gui.accent_color

style tssr_mod_row is gui_text:
    size 26
    color "#e6e6e6"
    xsize 430
    yalign 0.5

## Разделитель секций — тонкая линия во всю ширину колонки.
style tssr_divider is frame:
    background Solid("#ffffff1f")
    ysize 2
    xfill True
    padding (0, 0, 0, 0)

## Material-стиль (правка владельца 2026-10-16: «строгие прямоугольники» ->
## скруглённые пилюли): в Ren'Py 7.4 нет нативного border-radius — скругление
## через 9-slice рамку картинок images/ui/round*.png (генерятся
## tools/gen_ui_round.py; путь резолвится через RENPY_SEARCHPATH как fonts/),
## цвет — TintMatrix (динамический gui.accent_color).
define tssr_ui_pill = Frame("images/ui/round.png", 16, 16, 16, 16)
define tssr_ui_pill_soft = Frame("images/ui/round_soft.png", 16, 16, 16, 16)
define tssr_ui_pill_ghost = Frame("images/ui/round_ghost.png", 16, 16, 16, 16)
define tssr_ui_pill_dim = Frame("images/ui/round_dim.png", 16, 16, 16, 16)

define tssr_ui_accent = Transform(tssr_ui_pill, matrixcolor=TintMatrix(gui.accent_color))
define tssr_ui_white = Transform(tssr_ui_pill, matrixcolor=TintMatrix("#ffffff"))
define tssr_ui_dark = Transform(tssr_ui_pill_dim, matrixcolor=TintMatrix("#000000"))
define tssr_ui_hover_sky = Transform(tssr_ui_pill_ghost, matrixcolor=TintMatrix("#99ccff"))

style tssr_mod_input_box is frame:
    background tssr_ui_pill_soft
    padding (14, 9, 14, 9)
    xsize 120
    ysize 56

## Значение в рамке +/- степпера (инпуты убраны: клик по ним в 7.4.11 не
## активирует редактирование — см. tssr_fs_bump).
style tssr_mod_value is gui_text:
    color "#ffffff"
    xalign 0.5
    yalign 0.5

style tssr_step is button:
    background tssr_ui_pill_soft
    hover_background tssr_ui_pill_ghost
    xsize 56
    ysize 56
    padding (0, 0, 0, 0)

style tssr_step_text is gui_text:
    size 30
    color "#e6e6e6"
    hover_color gui.accent_color
    xalign 0.5
    yalign 0.5

## Кнопка языка: фикс-ширина в сетке 4×3 (ревью R3: без неё длинные названия
## рвались посреди слова). selected = акцентная пилюля.
style tssr_lang is button:
    background tssr_ui_pill_soft
    hover_background tssr_ui_pill_ghost
    selected_background tssr_ui_accent
    xsize 338
    ysize 58
    padding (12, 8, 12, 8)

style tssr_lang_text is gui_text:
    size 28
    color "#e6e6e6"
    hover_color "#ffffff"
    selected_color "#0b0e14"
    xalign 0.5
    yalign 0.5

## Выбор (вкл/выкл): широкая пилюля, selected — акцент.
style tssr_choice is button:
    background tssr_ui_pill_soft
    hover_background tssr_ui_pill_ghost
    selected_background tssr_ui_accent
    xsize 240
    ysize 58
    padding (12, 8, 12, 8)

style tssr_choice_text is gui_text:
    size 28
    color "#e6e6e6"
    hover_color "#ffffff"
    selected_color "#0b0e14"
    xalign 0.5
    yalign 0.5

style tssr_mod_preview is gui_text:
    color "#9aa4b2"
    yalign 0.5

## Кнопка-бейдж (правый верх): подпись = текущий язык. Компактная пилюля.
style tssr_badge is button:
    background tssr_ui_dark
    hover_background tssr_ui_hover_sky
    padding (12, 4, 12, 4)

## Настоящий Bold: instance из Literata-VF (wght=700), лежит в fonts/
## (синтетический bold у Ren'Py выходит жирновато-мыльным).
style tssr_badge_text is gui_text:
    font "fonts/Literata-Bold.ttf"
    size 20
    color "#ffffff"
    hover_color gui.accent_color

## Тихий бейдж (ТОЛЬКО процесс игры): idle = призрачная пилюля (round_ghost,
## 12% чёрного) + подпись 35% — почти не заметен на ярких сценах, не отвлекает
## от фокуса; hover = сплошной акцент с тёмной подписью (мгновенная вспышка,
## хитбокс и геометрия не меняются — ноль сдвига лэйаута). В меню — обычный
## tssr_badge (см. screen tssr_button(quiet=...)).
style tssr_badge_quiet is tssr_badge:
    background Transform(tssr_ui_pill_ghost, matrixcolor=TintMatrix("#000000"))
    hover_background tssr_ui_accent

style tssr_badge_quiet_text is tssr_badge_text:
    color "#ffffff59"
    hover_color "#0b0e14"

## Кнопки страницы: primary (акцент) / secondary (призрачная) / ссылка.
style tssr_primary is button:
    background tssr_ui_accent
    hover_background tssr_ui_white
    padding (26, 12, 26, 12)

style tssr_primary_text is gui_text:
    size 26
    color "#0b0e14"
    hover_color "#0b0e14"

style tssr_secondary is button:
    background tssr_ui_pill_soft
    hover_background tssr_ui_pill_ghost
    padding (26, 12, 26, 12)

style tssr_secondary_text is gui_text:
    size 26
    color "#e6e6e6"
    hover_color "#ffffff"

style tssr_link is button:
    background tssr_ui_pill_soft
    hover_background tssr_ui_hover_sky
    padding (20, 9, 20, 9)

style tssr_link_text is gui_text:
    size 26
    color gui.accent_color
    hover_color "#ffffff"


################################################################################
## 5. Перевод строк нашего меню (новый язык = свой translate-блок здесь или
##    в tl/<код>/ — без правки официальных файлов)
################################################################################

translate ru strings:

    old "Sarah Rose — AI Voice Pack"
    new "Sarah Rose — AI-озвучка и перевод"

    old "Settings: language, voice, fonts, links."
    new "Настройки: язык, голос, шрифты, ссылки."

    old "Interface language"
    new "Язык"

    old "Voice acting"
    new "Озвучка"

    old "Enabled"
    new "Вкл"

    old "Disabled"
    new "Выкл"

    old "Font sizes"
    new "Размеры шрифтов"

    old "Whole numbers 10-160, applied on game restart."
    new "Целые числа 10–160. Применяются при перезапуске игры."

    old "Dialogue text"
    new "Диалоги"

    old "Names"
    new "Имена"

    old "UI text"
    new "Интерфейс"

    old "Header text"
    new "Заголовки"

    old "Notification text"
    new "Уведомления"

    old "Game title"
    new "Название игры"

    old "Preview text"
    new "Пример строки"

    old "Reset to defaults"
    new "К стандартным"

    old "Revert changes"
    new "Отменить правки"

    old "Links"
    new "Ссылки и поддержка"

    old "Patch site"
    new "Сайт патча"

    old "Apply and restart"
    new "Применить и перезапустить"

    old "OK"
    new "ОК"

translate de strings:

    old "Sarah Rose — AI Voice Pack"
    new "Sarah Rose — KI-Sprachausgabe und Übersetzung"

    old "Settings: language, voice, fonts, links."
    new "Einstellungen: Sprache, Stimme, Schrift, Links."

    old "Interface language"
    new "Oberflächensprache"

    old "Voice acting"
    new "Sprachausgabe"

    old "Enabled"
    new "An"

    old "Disabled"
    new "Aus"

    old "Font sizes"
    new "Schriftgrößen"

    old "Whole numbers 10-160, applied on game restart."
    new "Ganze Zahlen 10–160, gelten nach dem Neustart des Spiels."

    old "Dialogue text"
    new "Dialogtext"

    old "Names"
    new "Namen"

    old "UI text"
    new "Oberflächentext"

    old "Header text"
    new "Überschriften"

    old "Notification text"
    new "Benachrichtigungen"

    old "Game title"
    new "Spieltitel"

    old "Preview text"
    new "Beispieltext"

    old "Reset to defaults"
    new "Standard wiederherstellen"

    old "Links"
    new "Links und Unterstützung"

    old "Patch site"
    new "Patch-Seite"

    old "Revert changes"
    new "Änderungen verwerfen"

    old "Apply and restart"
    new "Übernehmen und neu starten"

    old "OK"
    new "OK"

translate es strings:

    old "Sarah Rose — AI Voice Pack"
    new "Sarah Rose — Voces con IA y traducción"

    old "Settings: language, voice, fonts, links."
    new "Ajustes: idioma, voz, fuentes, enlaces."

    old "Interface language"
    new "Idioma de la interfaz"

    old "Voice acting"
    new "Voz"

    old "Enabled"
    new "Activado"

    old "Disabled"
    new "Desactivado"

    old "Font sizes"
    new "Tamaños de fuente"

    old "Whole numbers 10-160, applied on game restart."
    new "Números enteros de 10 a 160; se aplican al reiniciar el juego."

    old "Dialogue text"
    new "Texto de diálogo"

    old "Names"
    new "Nombres"

    old "UI text"
    new "Texto de la interfaz"

    old "Header text"
    new "Encabezados"

    old "Notification text"
    new "Notificaciones"

    old "Game title"
    new "Título del juego"

    old "Preview text"
    new "Texto de ejemplo"

    old "Reset to defaults"
    new "Restaurar valores"

    old "Links"
    new "Enlaces y apoyo"

    old "Patch site"
    new "Sitio del parche"

    old "Revert changes"
    new "Descartar cambios"

    old "Apply and restart"
    new "Aplicar y reiniciar"

    old "OK"
    new "Aceptar"

translate fr strings:

    old "Sarah Rose — AI Voice Pack"
    new "Sarah Rose — Voix IA et traduction"

    old "Settings: language, voice, fonts, links."
    new "Réglages : langue, voix, polices, liens."

    old "Interface language"
    new "Langue de l’interface"

    old "Voice acting"
    new "Voix"

    old "Enabled"
    new "Activé"

    old "Disabled"
    new "Désactivé"

    old "Font sizes"
    new "Tailles des polices"

    old "Whole numbers 10-160, applied on game restart."
    new "Nombres entiers de 10 à 160 ; appliqués au redémarrage du jeu."

    old "Dialogue text"
    new "Texte des dialogues"

    old "Names"
    new "Noms"

    old "UI text"
    new "Texte de l’interface"

    old "Header text"
    new "Titres"

    old "Notification text"
    new "Notifications"

    old "Game title"
    new "Titre du jeu"

    old "Preview text"
    new "Texte d’exemple"

    old "Reset to defaults"
    new "Rétablir les valeurs"

    old "Links"
    new "Liens et soutien"

    old "Patch site"
    new "Site du patch"

    old "Revert changes"
    new "Annuler les modifications"

    old "Apply and restart"
    new "Appliquer et redémarrer"

    old "OK"
    new "OK"

translate it strings:

    old "Sarah Rose — AI Voice Pack"
    new "Sarah Rose — Voci IA e traduzione"

    old "Settings: language, voice, fonts, links."
    new "Impostazioni: lingua, voci, caratteri, link."

    old "Interface language"
    new "Lingua dell’interfaccia"

    old "Voice acting"
    new "Voci"

    old "Enabled"
    new "Attivato"

    old "Disabled"
    new "Disattivato"

    old "Font sizes"
    new "Dimensioni dei caratteri"

    old "Whole numbers 10-160, applied on game restart."
    new "Numeri interi da 10 a 160; applicati al riavvio del gioco."

    old "Dialogue text"
    new "Testo dei dialoghi"

    old "Names"
    new "Nomi"

    old "UI text"
    new "Testo dell’interfaccia"

    old "Header text"
    new "Intestazioni"

    old "Notification text"
    new "Notifiche"

    old "Game title"
    new "Titolo del gioco"

    old "Preview text"
    new "Testo di esempio"

    old "Reset to defaults"
    new "Ripristina predefiniti"

    old "Links"
    new "Link e supporto"

    old "Patch site"
    new "Sito della patch"

    old "Revert changes"
    new "Annulla modifiche"

    old "Apply and restart"
    new "Applica e riavvia"

    old "OK"
    new "OK"

translate ja strings:

    old "Sarah Rose — AI Voice Pack"
    new "Sarah Rose — AI音声と翻訳"

    old "Settings: language, voice, fonts, links."
    new "設定：言語、音声、フォント、リンク。"

    old "Interface language"
    new "表示言語"

    old "Voice acting"
    new "音声"

    old "Enabled"
    new "オン"

    old "Disabled"
    new "オフ"

    old "Font sizes"
    new "フォントサイズ"

    old "Whole numbers 10-160, applied on game restart."
    new "10〜160の整数。ゲームの再起動時に適用されます。"

    old "Dialogue text"
    new "会話テキスト"

    old "Names"
    new "名前"

    old "UI text"
    new "UIテキスト"

    old "Header text"
    new "見出し"

    old "Notification text"
    new "通知"

    old "Game title"
    new "ゲームタイトル"

    old "Preview text"
    new "プレビューテキスト"

    old "Reset to defaults"
    new "初期値に戻す"

    old "Links"
    new "リンクとサポート"

    old "Patch site"
    new "パッチのサイト"

    old "Revert changes"
    new "変更を破棄"

    old "Apply and restart"
    new "適用して再起動"

    old "OK"
    new "OK"

translate ko strings:

    old "Sarah Rose — AI Voice Pack"
    new "Sarah Rose — AI 음성 및 번역"

    old "Settings: language, voice, fonts, links."
    new "설정: 언어, 음성, 글꼴, 링크."

    old "Interface language"
    new "인터페이스 언어"

    old "Voice acting"
    new "음성"

    old "Enabled"
    new "켬"

    old "Disabled"
    new "끔"

    old "Font sizes"
    new "글꼴 크기"

    old "Whole numbers 10-160, applied on game restart."
    new "10–160 사이의 정수. 게임을 다시 시작하면 적용됩니다."

    old "Dialogue text"
    new "대화 텍스트"

    old "Names"
    new "이름"

    old "UI text"
    new "UI 텍스트"

    old "Header text"
    new "제목"

    old "Notification text"
    new "알림"

    old "Game title"
    new "게임 제목"

    old "Preview text"
    new "미리보기 텍스트"

    old "Reset to defaults"
    new "기본값 복원"

    old "Links"
    new "링크 및 지원"

    old "Patch site"
    new "패치 사이트"

    old "Revert changes"
    new "변경 취소"

    old "Apply and restart"
    new "적용 후 재시작"

    old "OK"
    new "확인"

translate pl strings:

    old "Sarah Rose — AI Voice Pack"
    new "Sarah Rose — Głos AI i tłumaczenie"

    old "Settings: language, voice, fonts, links."
    new "Ustawienia: język, głos, czcionki, linki."

    old "Interface language"
    new "Język interfejsu"

    old "Voice acting"
    new "Głos"

    old "Enabled"
    new "Włączone"

    old "Disabled"
    new "Wyłączone"

    old "Font sizes"
    new "Rozmiary czcionek"

    old "Whole numbers 10-160, applied on game restart."
    new "Liczby całkowite 10–160, stosowane po restarcie gry."

    old "Dialogue text"
    new "Tekst dialogów"

    old "Names"
    new "Imiona"

    old "UI text"
    new "Tekst interfejsu"

    old "Header text"
    new "Nagłówki"

    old "Notification text"
    new "Powiadomienia"

    old "Game title"
    new "Tytuł gry"

    old "Preview text"
    new "Tekst przykładowy"

    old "Reset to defaults"
    new "Przywróć domyślne"

    old "Links"
    new "Linki i wsparcie"

    old "Patch site"
    new "Strona łatki"

    old "Revert changes"
    new "Odrzuć zmiany"

    old "Apply and restart"
    new "Zastosuj i uruchom ponownie"

    old "OK"
    new "OK"

translate pt strings:

    old "Sarah Rose — AI Voice Pack"
    new "Sarah Rose — Voz IA e tradução"

    old "Settings: language, voice, fonts, links."
    new "Configurações: idioma, voz, fontes, links."

    old "Interface language"
    new "Idioma da interface"

    old "Voice acting"
    new "Voz"

    old "Enabled"
    new "Ativado"

    old "Disabled"
    new "Desativado"

    old "Font sizes"
    new "Tamanhos da fonte"

    old "Whole numbers 10-160, applied on game restart."
    new "Números inteiros de 10 a 160; aplicados ao reiniciar o jogo."

    old "Dialogue text"
    new "Texto do diálogo"

    old "Names"
    new "Nomes"

    old "UI text"
    new "Texto da interface"

    old "Header text"
    new "Cabeçalhos"

    old "Notification text"
    new "Notificações"

    old "Game title"
    new "Título do jogo"

    old "Preview text"
    new "Texto de exemplo"

    old "Reset to defaults"
    new "Restaurar padrões"

    old "Links"
    new "Links e apoio"

    old "Patch site"
    new "Site do patch"

    old "Revert changes"
    new "Descartar alterações"

    old "Apply and restart"
    new "Aplicar e reiniciar"

    old "OK"
    new "OK"

translate zh strings:

    old "Sarah Rose — AI Voice Pack"
    new "Sarah Rose — AI 配音与翻译"

    old "Settings: language, voice, fonts, links."
    new "设置：语言、语音、字体、链接。"

    old "Interface language"
    new "界面语言"

    old "Voice acting"
    new "语音"

    old "Enabled"
    new "开启"

    old "Disabled"
    new "关闭"

    old "Font sizes"
    new "字体大小"

    old "Whole numbers 10-160, applied on game restart."
    new "10–160 的整数，重启游戏后生效。"

    old "Dialogue text"
    new "对话文本"

    old "Names"
    new "人名"

    old "UI text"
    new "界面文本"

    old "Header text"
    new "标题"

    old "Notification text"
    new "通知"

    old "Game title"
    new "游戏标题"

    old "Preview text"
    new "预览文本"

    old "Reset to defaults"
    new "恢复默认"

    old "Links"
    new "链接与支持"

    old "Patch site"
    new "补丁网站"

    old "Revert changes"
    new "放弃更改"

    old "Apply and restart"
    new "应用并重启"

    old "OK"
    new "确定"

################################################################################
## 5.1 Шрифты bold-стилей для CJK (охота за квадратами 2026-11-11):
##     в Literata-Bold нет CJK-глифов -> «Sarah Rose — AI □□□□□□» в заголовке.
##     Пер-языковой style-блок — штатный механизм Ren'Py: переживает rebuild
##     стилей и живое переключение языка (мутации стиля откатывались).
################################################################################

translate ja style tssr_mod_title:
    font "fonts/NotoSansCJKjp-Regular.otf"

translate ja style tssr_mod_section:
    font "fonts/NotoSansCJKjp-Regular.otf"

translate ko style tssr_mod_title:
    font "fonts/NotoSansCJKkr-Regular.otf"

translate ko style tssr_mod_section:
    font "fonts/NotoSansCJKkr-Regular.otf"

translate zh style tssr_mod_title:
    font "fonts/NotoSansCJKsc-Regular.otf"

translate zh style tssr_mod_section:
    font "fonts/NotoSansCJKsc-Regular.otf"

################################################################################
## 5.2 Шрифты ВСЕХ текстовых стилей для CJK (живое переключение языка):
##     единственный механизм, переживающий style.rebuild и смену языка
##     (мутации стилей при живом переключении не работают — E2E 2026-11-11).
################################################################################
translate ja style tssr_mod_hint:
    font "fonts/NotoSansCJKjp-Regular.otf"

translate ja style tssr_mod_row:
    font "fonts/NotoSansCJKjp-Regular.otf"

translate ja style tssr_mod_value:
    font "fonts/NotoSansCJKjp-Regular.otf"

translate ja style tssr_mod_preview:
    font "fonts/NotoSansCJKjp-Regular.otf"

translate ja style tssr_step_text:
    font "fonts/NotoSansCJKjp-Regular.otf"

translate ja style tssr_lang_text:
    font "fonts/NotoSansCJKjp-Regular.otf"

translate ja style tssr_choice_text:
    font "fonts/NotoSansCJKjp-Regular.otf"

translate ja style tssr_badge_text:
    font "fonts/NotoSansCJKjp-Regular.otf"

translate ja style tssr_primary_text:
    font "fonts/NotoSansCJKjp-Regular.otf"

translate ja style tssr_secondary_text:
    font "fonts/NotoSansCJKjp-Regular.otf"

translate ja style tssr_link_text:
    font "fonts/NotoSansCJKjp-Regular.otf"

translate ja style default:
    font "fonts/NotoSansCJKjp-Regular.otf"

translate ja style input:
    font "fonts/NotoSansCJKjp-Regular.otf"

translate ja style hyperlink_text:
    font "fonts/NotoSansCJKjp-Regular.otf"

translate ja style title_text:
    font "fonts/NotoSansCJKjp-Regular.otf"

translate ja style subtitle_text:
    font "fonts/NotoSansCJKjp-Regular.otf"

translate ja style say_dialogue:
    font "fonts/NotoSansCJKjp-Regular.otf"

translate ja style say_label:
    font "fonts/NotoSansCJKjp-Regular.otf"

translate ja style nvl_dialogue:
    font "fonts/NotoSansCJKjp-Regular.otf"

translate ja style nvl_label:
    font "fonts/NotoSansCJKjp-Regular.otf"

translate ja style interface_text:
    font "fonts/NotoSansCJKjp-Regular.otf"

translate ja style gui_text:
    font "fonts/NotoSansCJKjp-Regular.otf"

translate ja style history_text:
    font "fonts/NotoSansCJKjp-Regular.otf"

translate ja style history_name:
    font "fonts/NotoSansCJKjp-Regular.otf"

translate ja style pref_label_text:
    font "fonts/NotoSansCJKjp-Regular.otf"

translate ja style slot_time_text:
    font "fonts/NotoSansCJKjp-Regular.otf"

translate ja style slot_name_text:
    font "fonts/NotoSansCJKjp-Regular.otf"

translate ja style game_menu_label_text:
    font "fonts/NotoSansCJKjp-Regular.otf"

translate ja style quick_button_text:
    font "fonts/NotoSansCJKjp-Regular.otf"

translate ja style choice_button_text:
    font "fonts/NotoSansCJKjp-Regular.otf"

translate ja style navigation_button_text:
    font "fonts/NotoSansCJKjp-Regular.otf"

translate ja style button_text:
    font "fonts/NotoSansCJKjp-Regular.otf"

translate ja style label_text:
    font "fonts/NotoSansCJKjp-Regular.otf"

translate ja style prompt_text:
    font "fonts/NotoSansCJKjp-Regular.otf"

translate ja style main_menu_text:
    font "fonts/NotoSansCJKjp-Regular.otf"

translate ja style about_text:
    font "fonts/NotoSansCJKjp-Regular.otf"

translate ja style about_label_text:
    font "fonts/NotoSansCJKjp-Regular.otf"

translate ja style page_label_text:
    font "fonts/NotoSansCJKjp-Regular.otf"

translate ja style page_button_text:
    font "fonts/NotoSansCJKjp-Regular.otf"

translate ja style slot_button_text:
    font "fonts/NotoSansCJKjp-Regular.otf"

translate ja style radio_label_text:
    font "fonts/NotoSansCJKjp-Regular.otf"

translate ja style radio_button_text:
    font "fonts/NotoSansCJKjp-Regular.otf"

translate ja style check_label_text:
    font "fonts/NotoSansCJKjp-Regular.otf"

translate ja style check_button_text:
    font "fonts/NotoSansCJKjp-Regular.otf"

translate ja style slider_label_text:
    font "fonts/NotoSansCJKjp-Regular.otf"

translate ja style slider_button_text:
    font "fonts/NotoSansCJKjp-Regular.otf"

translate ja style mute_all_button_text:
    font "fonts/NotoSansCJKjp-Regular.otf"

translate ja style history_label_text:
    font "fonts/NotoSansCJKjp-Regular.otf"

translate ja style help_button_text:
    font "fonts/NotoSansCJKjp-Regular.otf"

translate ja style help_label_text:
    font "fonts/NotoSansCJKjp-Regular.otf"

translate ja style help_text:
    font "fonts/NotoSansCJKjp-Regular.otf"

translate ja style confirm_prompt_text:
    font "fonts/NotoSansCJKjp-Regular.otf"

translate ja style confirm_button_text:
    font "fonts/NotoSansCJKjp-Regular.otf"

translate ja style skip_text:
    font "fonts/NotoSansCJKjp-Regular.otf"

translate ja style notify_text:
    font "fonts/NotoSansCJKjp-Regular.otf"

translate ja style nvl_button_text:
    font "fonts/NotoSansCJKjp-Regular.otf"

translate ja style return_button_text:
    font "fonts/NotoSansCJKjp-Regular.otf"

translate ko style tssr_mod_hint:
    font "fonts/NotoSansCJKkr-Regular.otf"

translate ko style tssr_mod_row:
    font "fonts/NotoSansCJKkr-Regular.otf"

translate ko style tssr_mod_value:
    font "fonts/NotoSansCJKkr-Regular.otf"

translate ko style tssr_mod_preview:
    font "fonts/NotoSansCJKkr-Regular.otf"

translate ko style tssr_step_text:
    font "fonts/NotoSansCJKkr-Regular.otf"

translate ko style tssr_lang_text:
    font "fonts/NotoSansCJKkr-Regular.otf"

translate ko style tssr_choice_text:
    font "fonts/NotoSansCJKkr-Regular.otf"

translate ko style tssr_badge_text:
    font "fonts/NotoSansCJKkr-Regular.otf"

translate ko style tssr_primary_text:
    font "fonts/NotoSansCJKkr-Regular.otf"

translate ko style tssr_secondary_text:
    font "fonts/NotoSansCJKkr-Regular.otf"

translate ko style tssr_link_text:
    font "fonts/NotoSansCJKkr-Regular.otf"

translate ko style default:
    font "fonts/NotoSansCJKkr-Regular.otf"

translate ko style input:
    font "fonts/NotoSansCJKkr-Regular.otf"

translate ko style hyperlink_text:
    font "fonts/NotoSansCJKkr-Regular.otf"

translate ko style title_text:
    font "fonts/NotoSansCJKkr-Regular.otf"

translate ko style subtitle_text:
    font "fonts/NotoSansCJKkr-Regular.otf"

translate ko style say_dialogue:
    font "fonts/NotoSansCJKkr-Regular.otf"

translate ko style say_label:
    font "fonts/NotoSansCJKkr-Regular.otf"

translate ko style nvl_dialogue:
    font "fonts/NotoSansCJKkr-Regular.otf"

translate ko style nvl_label:
    font "fonts/NotoSansCJKkr-Regular.otf"

translate ko style interface_text:
    font "fonts/NotoSansCJKkr-Regular.otf"

translate ko style gui_text:
    font "fonts/NotoSansCJKkr-Regular.otf"

translate ko style history_text:
    font "fonts/NotoSansCJKkr-Regular.otf"

translate ko style history_name:
    font "fonts/NotoSansCJKkr-Regular.otf"

translate ko style pref_label_text:
    font "fonts/NotoSansCJKkr-Regular.otf"

translate ko style slot_time_text:
    font "fonts/NotoSansCJKkr-Regular.otf"

translate ko style slot_name_text:
    font "fonts/NotoSansCJKkr-Regular.otf"

translate ko style game_menu_label_text:
    font "fonts/NotoSansCJKkr-Regular.otf"

translate ko style quick_button_text:
    font "fonts/NotoSansCJKkr-Regular.otf"

translate ko style choice_button_text:
    font "fonts/NotoSansCJKkr-Regular.otf"

translate ko style navigation_button_text:
    font "fonts/NotoSansCJKkr-Regular.otf"

translate ko style button_text:
    font "fonts/NotoSansCJKkr-Regular.otf"

translate ko style label_text:
    font "fonts/NotoSansCJKkr-Regular.otf"

translate ko style prompt_text:
    font "fonts/NotoSansCJKkr-Regular.otf"

translate ko style main_menu_text:
    font "fonts/NotoSansCJKkr-Regular.otf"

translate ko style about_text:
    font "fonts/NotoSansCJKkr-Regular.otf"

translate ko style about_label_text:
    font "fonts/NotoSansCJKkr-Regular.otf"

translate ko style page_label_text:
    font "fonts/NotoSansCJKkr-Regular.otf"

translate ko style page_button_text:
    font "fonts/NotoSansCJKkr-Regular.otf"

translate ko style slot_button_text:
    font "fonts/NotoSansCJKkr-Regular.otf"

translate ko style radio_label_text:
    font "fonts/NotoSansCJKkr-Regular.otf"

translate ko style radio_button_text:
    font "fonts/NotoSansCJKkr-Regular.otf"

translate ko style check_label_text:
    font "fonts/NotoSansCJKkr-Regular.otf"

translate ko style check_button_text:
    font "fonts/NotoSansCJKkr-Regular.otf"

translate ko style slider_label_text:
    font "fonts/NotoSansCJKkr-Regular.otf"

translate ko style slider_button_text:
    font "fonts/NotoSansCJKkr-Regular.otf"

translate ko style mute_all_button_text:
    font "fonts/NotoSansCJKkr-Regular.otf"

translate ko style history_label_text:
    font "fonts/NotoSansCJKkr-Regular.otf"

translate ko style help_button_text:
    font "fonts/NotoSansCJKkr-Regular.otf"

translate ko style help_label_text:
    font "fonts/NotoSansCJKkr-Regular.otf"

translate ko style help_text:
    font "fonts/NotoSansCJKkr-Regular.otf"

translate ko style confirm_prompt_text:
    font "fonts/NotoSansCJKkr-Regular.otf"

translate ko style confirm_button_text:
    font "fonts/NotoSansCJKkr-Regular.otf"

translate ko style skip_text:
    font "fonts/NotoSansCJKkr-Regular.otf"

translate ko style notify_text:
    font "fonts/NotoSansCJKkr-Regular.otf"

translate ko style nvl_button_text:
    font "fonts/NotoSansCJKkr-Regular.otf"

translate ko style return_button_text:
    font "fonts/NotoSansCJKkr-Regular.otf"

translate zh style tssr_mod_hint:
    font "fonts/NotoSansCJKsc-Regular.otf"

translate zh style tssr_mod_row:
    font "fonts/NotoSansCJKsc-Regular.otf"

translate zh style tssr_mod_value:
    font "fonts/NotoSansCJKsc-Regular.otf"

translate zh style tssr_mod_preview:
    font "fonts/NotoSansCJKsc-Regular.otf"

translate zh style tssr_step_text:
    font "fonts/NotoSansCJKsc-Regular.otf"

translate zh style tssr_lang_text:
    font "fonts/NotoSansCJKsc-Regular.otf"

translate zh style tssr_choice_text:
    font "fonts/NotoSansCJKsc-Regular.otf"

translate zh style tssr_badge_text:
    font "fonts/NotoSansCJKsc-Regular.otf"

translate zh style tssr_primary_text:
    font "fonts/NotoSansCJKsc-Regular.otf"

translate zh style tssr_secondary_text:
    font "fonts/NotoSansCJKsc-Regular.otf"

translate zh style tssr_link_text:
    font "fonts/NotoSansCJKsc-Regular.otf"

translate zh style default:
    font "fonts/NotoSansCJKsc-Regular.otf"

translate zh style input:
    font "fonts/NotoSansCJKsc-Regular.otf"

translate zh style hyperlink_text:
    font "fonts/NotoSansCJKsc-Regular.otf"

translate zh style title_text:
    font "fonts/NotoSansCJKsc-Regular.otf"

translate zh style subtitle_text:
    font "fonts/NotoSansCJKsc-Regular.otf"

translate zh style say_dialogue:
    font "fonts/NotoSansCJKsc-Regular.otf"

translate zh style say_label:
    font "fonts/NotoSansCJKsc-Regular.otf"

translate zh style nvl_dialogue:
    font "fonts/NotoSansCJKsc-Regular.otf"

translate zh style nvl_label:
    font "fonts/NotoSansCJKsc-Regular.otf"

translate zh style interface_text:
    font "fonts/NotoSansCJKsc-Regular.otf"

translate zh style gui_text:
    font "fonts/NotoSansCJKsc-Regular.otf"

translate zh style history_text:
    font "fonts/NotoSansCJKsc-Regular.otf"

translate zh style history_name:
    font "fonts/NotoSansCJKsc-Regular.otf"

translate zh style pref_label_text:
    font "fonts/NotoSansCJKsc-Regular.otf"

translate zh style slot_time_text:
    font "fonts/NotoSansCJKsc-Regular.otf"

translate zh style slot_name_text:
    font "fonts/NotoSansCJKsc-Regular.otf"

translate zh style game_menu_label_text:
    font "fonts/NotoSansCJKsc-Regular.otf"

translate zh style quick_button_text:
    font "fonts/NotoSansCJKsc-Regular.otf"

translate zh style choice_button_text:
    font "fonts/NotoSansCJKsc-Regular.otf"

translate zh style navigation_button_text:
    font "fonts/NotoSansCJKsc-Regular.otf"

translate zh style button_text:
    font "fonts/NotoSansCJKsc-Regular.otf"

translate zh style label_text:
    font "fonts/NotoSansCJKsc-Regular.otf"

translate zh style prompt_text:
    font "fonts/NotoSansCJKsc-Regular.otf"

translate zh style main_menu_text:
    font "fonts/NotoSansCJKsc-Regular.otf"

translate zh style about_text:
    font "fonts/NotoSansCJKsc-Regular.otf"

translate zh style about_label_text:
    font "fonts/NotoSansCJKsc-Regular.otf"

translate zh style page_label_text:
    font "fonts/NotoSansCJKsc-Regular.otf"

translate zh style page_button_text:
    font "fonts/NotoSansCJKsc-Regular.otf"

translate zh style slot_button_text:
    font "fonts/NotoSansCJKsc-Regular.otf"

translate zh style radio_label_text:
    font "fonts/NotoSansCJKsc-Regular.otf"

translate zh style radio_button_text:
    font "fonts/NotoSansCJKsc-Regular.otf"

translate zh style check_label_text:
    font "fonts/NotoSansCJKsc-Regular.otf"

translate zh style check_button_text:
    font "fonts/NotoSansCJKsc-Regular.otf"

translate zh style slider_label_text:
    font "fonts/NotoSansCJKsc-Regular.otf"

translate zh style slider_button_text:
    font "fonts/NotoSansCJKsc-Regular.otf"

translate zh style mute_all_button_text:
    font "fonts/NotoSansCJKsc-Regular.otf"

translate zh style history_label_text:
    font "fonts/NotoSansCJKsc-Regular.otf"

translate zh style help_button_text:
    font "fonts/NotoSansCJKsc-Regular.otf"

translate zh style help_label_text:
    font "fonts/NotoSansCJKsc-Regular.otf"

translate zh style help_text:
    font "fonts/NotoSansCJKsc-Regular.otf"

translate zh style confirm_prompt_text:
    font "fonts/NotoSansCJKsc-Regular.otf"

translate zh style confirm_button_text:
    font "fonts/NotoSansCJKsc-Regular.otf"

translate zh style skip_text:
    font "fonts/NotoSansCJKsc-Regular.otf"

translate zh style notify_text:
    font "fonts/NotoSansCJKsc-Regular.otf"

translate zh style nvl_button_text:
    font "fonts/NotoSansCJKsc-Regular.otf"

translate zh style return_button_text:
    font "fonts/NotoSansCJKsc-Regular.otf"


################################################################################
## 5.3 Донат-CTA верхней панели (маркетинг-формула: глагол -> польза -> тепло;
##     [УТОЧНИТЬ] перепроверить формулировки веб-ресёрчем, когда канал оживёт).
################################################################################
translate ru strings:

    old "Donations keep the patch alive: new languages, voices and AI costs. Thank you!"
    new "Донаты развивают патч: новые языки, голоса и оплата нейронок. Спасибо!"

    old "Support the patch"
    new "Поддержать патч"

translate de strings:

    old "Donations keep the patch alive: new languages, voices and AI costs. Thank you!"
    new "Spenden halten den Patch am Leben: neue Sprachen, Stimmen und KI-Kosten. Danke!"

    old "Support the patch"
    new "Patch unterstützen"

translate es strings:

    old "Donations keep the patch alive: new languages, voices and AI costs. Thank you!"
    new "Los donativos mantienen vivo el parche: nuevos idiomas, voces y costes de IA. ¡Gracias!"

    old "Support the patch"
    new "Apoyar el parche"

translate fr strings:

    old "Donations keep the patch alive: new languages, voices and AI costs. Thank you!"
    new "Les dons font vivre le patch : nouvelles langues, voix et coûts d’IA. Merci !"

    old "Support the patch"
    new "Soutenir le patch"

translate it strings:

    old "Donations keep the patch alive: new languages, voices and AI costs. Thank you!"
    new "Le donazioni fanno vivere la patch: nuove lingue, voci e costi dell’IA. Grazie!"

    old "Support the patch"
    new "Sostenere la patch"

translate ja strings:

    old "Donations keep the patch alive: new languages, voices and AI costs. Thank you!"
    new "寄付はパッチを支えます。新しい言語、音声、そしてAIの費用に。ありがとうございます！"

    old "Support the patch"
    new "パッチを支援する"

translate ko strings:

    old "Donations keep the patch alive: new languages, voices and AI costs. Thank you!"
    new "후원은 패치를 지탱합니다: 새로운 언어, 음성, AI 비용. 감사합니다!"

    old "Support the patch"
    new "패치 후원하기"

translate pl strings:

    old "Donations keep the patch alive: new languages, voices and AI costs. Thank you!"
    new "Datki podtrzymują życie łatki: nowe języki, głosy i koszty AI. Dziękujemy!"

    old "Support the patch"
    new "Wesprzyć łatkę"

translate pt strings:

    old "Donations keep the patch alive: new languages, voices and AI costs. Thank you!"
    new "Doações mantêm o patch vivo: novos idiomas, vozes e custos de IA. Obrigado!"

    old "Support the patch"
    new "Apoiar o patch"

translate zh strings:

    old "Donations keep the patch alive: new languages, voices and AI costs. Thank you!"
    new "捐赠让补丁持续生长：新语言、新语音和 AI 成本。谢谢！"

    old "Support the patch"
    new "支持补丁"


################################################################################
## 5.4 Статус аудио-паков в меню (main несёт только текст; голоса —
##     отдельными паками voice-<lang>, поэтому нужен явный статус).
################################################################################

translate ru strings:

    old "Voice files: {n} lines"
    new "Голосовых файлов: {n} реплик"

    old "No voice files for this language - download voice-{lang} on Nexus Mods."
    new "Озвучки для этого языка нет — скачайте voice-{lang} на Nexus Mods."

translate de strings:

    old "Voice files: {n} lines"
    new "Sprachdateien: {n}"

    old "No voice files for this language - download voice-{lang} on Nexus Mods."
    new "Keine Sprachdateien für diese Sprache — voice-{lang} auf Nexus Mods herunterladen."

translate es strings:

    old "Voice files: {n} lines"
    new "Archivos de voz: {n}"

    old "No voice files for this language - download voice-{lang} on Nexus Mods."
    new "No hay archivos de voz para este idioma: descarga voice-{lang} en Nexus Mods."

translate pt strings:

    old "Voice files: {n} lines"
    new "Arquivos de voz: {n}"

    old "No voice files for this language - download voice-{lang} on Nexus Mods."
    new "Não há arquivos de voz para este idioma — baixe voice-{lang} no Nexus Mods."

translate fr strings:

    old "Voice files: {n} lines"
    new "Fichiers voix : {n}"

    old "No voice files for this language - download voice-{lang} on Nexus Mods."
    new "Aucun fichier voix pour cette langue — téléchargez voice-{lang} sur Nexus Mods."

translate it strings:

    old "Voice files: {n} lines"
    new "File vocali: {n}"

    old "No voice files for this language - download voice-{lang} on Nexus Mods."
    new "Nessun file vocale per questa lingua: scarica voice-{lang} su Nexus Mods."

translate ja strings:

    old "Voice files: {n} lines"
    new "音声ファイル：{n} 件"

    old "No voice files for this language - download voice-{lang} on Nexus Mods."
    new "この言語の音声ファイルがありません。Nexus Mods から voice-{lang} を導入してください。"

translate ko strings:

    old "Voice files: {n} lines"
    new "음성 파일: {n}개"

    old "No voice files for this language - download voice-{lang} on Nexus Mods."
    new "이 언어의 음성 파일이 없습니다. Nexus Mods에서 voice-{lang}을(를) 내려받으세요."

translate pl strings:

    old "Voice files: {n} lines"
    new "Pliki głosowe: {n}"

    old "No voice files for this language - download voice-{lang} on Nexus Mods."
    new "Brak plików głosowych dla tego języka — pobierz voice-{lang} z Nexus Mods."

translate zh strings:

    old "Voice files: {n} lines"
    new "语音文件：{n} 条"

    old "No voice files for this language - download voice-{lang} on Nexus Mods."
    new "此语言没有语音文件——请到 Nexus Mods 下载 voice-{lang}。"


################################################################################
## 5.6 Легенда индикаторов озвучки на кнопках языков.
#############################################################################

translate ru strings:

    old "voice pack installed"
    new "озвучка установлена"

    old "no voice pack - text only"
    new "без озвучки — только текст"

translate de strings:

    old "voice pack installed"
    new "Sprachpaket installiert"

    old "no voice pack - text only"
    new "kein Sprachpaket — nur Text"

translate es strings:

    old "voice pack installed"
    new "paquete de voz instalado"

    old "no voice pack - text only"
    new "sin voz — solo texto"

translate pt strings:

    old "voice pack installed"
    new "pacote de voz instalado"

    old "no voice pack - text only"
    new "sem voz — apenas texto"

translate fr strings:

    old "voice pack installed"
    new "pack voix installé"

    old "no voice pack - text only"
    new "sans voix — texte seul"

translate it strings:

    old "voice pack installed"
    new "pacchetto vocale installato"

    old "no voice pack - text only"
    new "senza voce — solo testo"

translate ja strings:

    old "voice pack installed"
    new "音声あり"

    old "no voice pack - text only"
    new "音声なし — テキストのみ"

translate ko strings:

    old "voice pack installed"
    new "음성 있음"

    old "no voice pack - text only"
    new "음성 없음 — 텍스트만"

translate pl strings:

    old "voice pack installed"
    new "pakiet głosowy zainstalowany"

    old "no voice pack - text only"
    new "bez głosu — tylko tekst"

translate zh strings:

    old "voice pack installed"
    new "已安装语音包"

    old "no voice pack - text only"
    new "无语音——仅文本"



#########################################################################


################################################################################
## 5.7 Статус выбранного языка: текст и озвучка отдельно (честное «демо»).
################################################################################

translate ru strings:

    old "Text: full ({n} of {total} lines)"
    new "Текст: полный ({n} из {total} строк)"

    old "Text: demo - {p}% ({n} of {total} lines)"
    new "Текст: демо — {p}% ({n} из {total} строк)"

    old "Voice: full ({n} of {total} lines)"
    new "Озвучка: полная ({n} из {total} реплик)"

    old "Voice: demo - {n} of {total} lines"
    new "Озвучка: демо — {n} из {total} реплик"

translate de strings:

    old "Text: full ({n} of {total} lines)"
    new "Text: vollständig ({n} von {total} Zeilen)"

    old "Text: demo - {p}% ({n} of {total} lines)"
    new "Text: Demo — {p}% ({n} von {total} Zeilen)"

    old "Voice: full ({n} of {total} lines)"
    new "Sprache: vollständig ({n} von {total} Zeilen)"

    old "Voice: demo - {n} of {total} lines"
    new "Sprache: Demo — {n} von {total} Zeilen"

translate es strings:

    old "Text: full ({n} of {total} lines)"
    new "Texto: completo ({n} de {total} líneas)"

    old "Text: demo - {p}% ({n} of {total} lines)"
    new "Texto: demo — {p}% ({n} de {total} líneas)"

    old "Voice: full ({n} of {total} lines)"
    new "Voz: completa ({n} de {total} líneas)"

    old "Voice: demo - {n} of {total} lines"
    new "Voz: demo — {n} de {total} líneas"

translate pt strings:

    old "Text: full ({n} of {total} lines)"
    new "Texto: completo ({n} de {total} linhas)"

    old "Text: demo - {p}% ({n} of {total} lines)"
    new "Texto: demo — {p}% ({n} de {total} linhas)"

    old "Voice: full ({n} of {total} lines)"
    new "Voz: completa ({n} de {total} falas)"

    old "Voice: demo - {n} of {total} lines"
    new "Voz: demo — {n} de {total} falas"

translate fr strings:

    old "Text: full ({n} of {total} lines)"
    new "Texte : complet ({n} sur {total} lignes)"

    old "Text: demo - {p}% ({n} of {total} lines)"
    new "Texte : démo — {p} % ({n} sur {total} lignes)"

    old "Voice: full ({n} of {total} lines)"
    new "Voix : complète ({n} sur {total} répliques)"

    old "Voice: demo - {n} of {total} lines"
    new "Voix : démo — {n} sur {total} répliques"

translate it strings:

    old "Text: full ({n} of {total} lines)"
    new "Testo: completo ({n} di {total} righe)"

    old "Text: demo - {p}% ({n} of {total} lines)"
    new "Testo: demo — {p}% ({n} di {total} righe)"

    old "Voice: full ({n} of {total} lines)"
    new "Voci: complete ({n} di {total} righe)"

    old "Voice: demo - {n} of {total} lines"
    new "Voci: demo — {n} di {total} righe"

translate ja strings:

    old "Text: full ({n} of {total} lines)"
    new "テキスト：完訳（{n}/{total} 行）"

    old "Text: demo - {p}% ({n} of {total} lines)"
    new "テキスト：デモ — {p}%（{n}/{total} 行）"

    old "Voice: full ({n} of {total} lines)"
    new "音声：完備（{n}/{total} 行）"

    old "Voice: demo - {n} of {total} lines"
    new "音声：デモ — {n}/{total} 行"

translate ko strings:

    old "Text: full ({n} of {total} lines)"
    new "텍스트: 완역({n}/{total}줄)"

    old "Text: demo - {p}% ({n} of {total} lines)"
    new "텍스트: 데모 — {p}%({n}/{total}줄)"

    old "Voice: full ({n} of {total} lines)"
    new "음성: 전체({n}/{total}줄)"

    old "Voice: demo - {n} of {total} lines"
    new "음성: 데모 — {n}/{total}줄"

translate pl strings:

    old "Text: full ({n} of {total} lines)"
    new "Tekst: pełny ({n} z {total} linii)"

    old "Text: demo - {p}% ({n} of {total} lines)"
    new "Tekst: demo — {p}% ({n} z {total} linii)"

    old "Voice: full ({n} of {total} lines)"
    new "Głos: pełny ({n} z {total} linii)"

    old "Voice: demo - {n} of {total} lines"
    new "Głos: demo — {n} z {total} linii"

translate zh strings:

    old "Text: full ({n} of {total} lines)"
    new "文本：完整（{n}/{total} 行）"

    old "Text: demo - {p}% ({n} of {total} lines)"
    new "文本：演示 — {p}%（{n}/{total} 行）"

    old "Voice: full ({n} of {total} lines)"
    new "语音：完整（{n}/{total} 行）"

    old "Voice: demo - {n} of {total} lines"
    new "语音：演示 — {n}/{total} 行"
