################################################################################
## TSSR mod — аддитивный слой (внешняя папка mod/ рядом с game/).
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
##    mod/fonts/ и резолвится тем же "fonts/..."-путём через RENPY_SEARCHPATH)
################################################################################

## The font used for in-game text.
define gui.text_font = "fonts/Literata-Regular.ttf"

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
    FONT_DEFAULTS = {
        'font_text_size': 32,
        'font_name_size': 38,
        'font_interface_size': 28,
        'font_label_size': 36,
        'font_notify_size': 24,
        'font_title_size': 75
    }

    def set_style_size(style_name, size):
        try:
            getattr(style, style_name).size = size
        except:
            pass

    def update_font_styles():
        set_style_size('say_dialogue', persistent.font_text_size)
        set_style_size('say_label', persistent.font_name_size)
        set_style_size('nvl_dialogue', persistent.font_text_size)
        set_style_size('nvl_label', persistent.font_name_size)
        set_style_size('interface_text', persistent.font_interface_size)
        set_style_size('gui_text', persistent.font_interface_size)
        set_style_size('history_text', persistent.font_text_size)
        set_style_size('history_name', persistent.font_name_size)
        set_style_size('pref_label_text', persistent.font_label_size)
        set_style_size('slot_time_text', persistent.font_interface_size)
        set_style_size('slot_name_text', persistent.font_interface_size)
        set_style_size('game_menu_label_text', persistent.font_label_size)
        set_style_size('quick_button_text', persistent.font_interface_size)
        set_style_size('choice_button_text', persistent.font_text_size)
        set_style_size('navigation_button_text', persistent.font_interface_size)
        set_style_size('button_text', persistent.font_interface_size)
        set_style_size('label_text', persistent.font_interface_size)
        set_style_size('prompt_text', persistent.font_interface_size)
        set_style_size('main_menu_text', persistent.font_interface_size)
        set_style_size('about_text', persistent.font_interface_size)
        set_style_size('about_label_text', persistent.font_label_size)
        set_style_size('page_label_text', persistent.font_label_size)
        set_style_size('page_button_text', persistent.font_interface_size)
        set_style_size('slot_button_text', persistent.font_interface_size)
        set_style_size('radio_label_text', persistent.font_label_size)
        set_style_size('radio_button_text', persistent.font_interface_size)
        set_style_size('check_label_text', persistent.font_label_size)
        set_style_size('check_button_text', persistent.font_interface_size)
        set_style_size('slider_label_text', persistent.font_label_size)
        set_style_size('slider_button_text', persistent.font_interface_size)
        set_style_size('mute_all_button_text', persistent.font_interface_size)
        set_style_size('history_label_text', persistent.font_label_size)
        set_style_size('help_button_text', persistent.font_interface_size)
        set_style_size('help_label_text', persistent.font_label_size)
        set_style_size('help_text', persistent.font_interface_size)
        set_style_size('confirm_prompt_text', persistent.font_interface_size)
        set_style_size('confirm_button_text', persistent.font_interface_size)
        set_style_size('skip_text', persistent.font_interface_size)
        set_style_size('notify_text', persistent.font_interface_size)
        set_style_size('nvl_button_text', persistent.font_text_size)
        set_style_size('return_button_text', persistent.font_interface_size)

    def update_all():
        gui.text_size = persistent.font_text_size
        gui.name_text_size = persistent.font_name_size
        gui.interface_text_size = persistent.font_interface_size
        gui.label_text_size = persistent.font_label_size
        gui.notify_text_size = persistent.font_notify_size
        gui.title_text_size = persistent.font_title_size
        update_font_styles()
        gui.rebuild()
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

    ## Первичный прогон: применяем persistent-размеры к стилям.
    gui.text_size = persistent.font_text_size
    gui.name_text_size = persistent.font_name_size
    gui.interface_text_size = persistent.font_interface_size
    gui.label_text_size = persistent.font_label_size
    gui.notify_text_size = persistent.font_notify_size
    gui.title_text_size = persistent.font_title_size
    update_font_styles()


################################################################################
## 2. Языки — ЕДИНСТВЕННОЕ место правки при добавлении новой локализации
################################################################################

init python:

    # (код языка, отображаемое имя); None = английский (оригинал игры).
    # Добавление языка: строка сюда + translate <код> strings: (или
    # mod/tl/<код>/*.rpy) + при необходимости ai_voice/<код>/ с озвучкой.
    # Официальные файлы игры не трогаются.
    TSSR_LANGUAGES = [
        (None, "English"),
        ("ru", "Русский"),
    ]

    # Короткие коды для КНОПКИ (подпись = текущий язык; ENG/RUS — привычные
    # для игр 3-буквенные формы, не спутать с флагом/регионом). Новый язык =
    # добавить строку в TSSR_LANGUAGES + сюда.
    TSSR_LANG_SHORT = {
        None: "ENG",
        "ru": "RUS",
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
default tssr_fs_label = 36
default tssr_fs_notify = 24
default tssr_fs_title = 75

init python:

    # (persistent-поле, store-черновик, original-заголовок строки) —
    # ЕДИНСТВЕННОЕ место правки при добавлении нового размера шрифта.
    TSSR_FS_ROWS = [
        ("font_text_size", "tssr_fs_text", "Dialogue text"),
        ("font_name_size", "tssr_fs_name", "Names"),
        ("font_interface_size", "tssr_fs_interface", "UI text"),
        ("font_label_size", "tssr_fs_label", "Header text"),
        ("font_notify_size", "tssr_fs_notify", "Notification text"),
        ("font_title_size", "tssr_fs_title", "Game title"),
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

        vbox:
            style "tssr_mod_column"

            ## Шапка — имя патча, продающее суть (2026-10-16, выбор владельца):
            ## «Sarah Rose» вместо непонятного TSSR; EN «AI Voice Pack»,
            ## RU «AI-озвучка и перевод».
            text _("Sarah Rose — AI Voice Pack"):
                style "tssr_mod_title"

            text _("Settings: language, voice, fonts, links."):
                style "tssr_mod_hint"

            ## Язык + Озвучка — применяются МГНОВЕННО (без кнопки сохранения)
            hbox:
                spacing 40

                vbox:
                    xsize 530
                    spacing 10

                    text _("Interface language"):
                        style "tssr_mod_section"

                    hbox:
                        spacing 15

                        for code, title in TSSR_LANGUAGES:
                            textbutton title:
                                action Language(code)
                                selected Language(code).get_selected()
                                style "radio_button"

                vbox:
                    xsize 530
                    spacing 10

                    text _("Voice acting"):
                        style "tssr_mod_section"

                    hbox:
                        spacing 15

                        textbutton _("Enabled"):
                            action SetMute("voice", False)
                            selected (not ToggleMute("voice").get_selected())
                            style "radio_button"

                        textbutton _("Disabled"):
                            action SetMute("voice", True)
                            selected ToggleMute("voice").get_selected()
                            style "radio_button"

            ## Размеры шрифтов — целые числа; стейджинг -> Apply (секция 2.1)
            text _("Font sizes"):
                style "tssr_mod_section"

            text _("Whole numbers 10-160, applied on game restart."):
                style "tssr_mod_hint"

            for attr, var, title in TSSR_FS_ROWS:
                hbox:
                    spacing 15

                    text _(title):
                        style "tssr_mod_row"

                    textbutton "-":
                        action [Function(tssr_fs_bump, var, -1), Function(renpy.restart_interaction)]
                        style "tssr_step"
                        yalign 0.5

                    frame:
                        style "tssr_mod_input_box"

                        text tssr_fs_display(var):
                            style "tssr_mod_value"

                    textbutton "+":
                        action [Function(tssr_fs_bump, var, 1), Function(renpy.restart_interaction)]
                        style "tssr_step"
                        yalign 0.5

                    text _("Preview text"):
                        style "tssr_mod_preview"
                        size tssr_fs_preview_size(var)

            textbutton _("Reset to defaults"):
                action [Function(tssr_fs_reset_draft), Function(renpy.restart_interaction)]
                style "tssr_secondary"

            ## Ссылки: ОДНА — лендинг (GitHub Pages). Разбор СЕО/маркетинга
            ## (владелец): «проект» шире «патча» (hub локализации+озвучки,
            ## статус, скачивание; «патч» = узкий технический фикс), а репа —
            ## не витрина. ★ убрана: глифа U+2605 нет в Literata.
            ## Boosty — когда будет постоянная ссылка.
            text _("Links"):
                style "tssr_mod_section"

            textbutton _("Site"):
                action OpenURL("https://domovikx.github.io/The-Survival-of-Sarah-Rose-Mods/")
                style "tssr_link"

            # TODO(Boosty): раскомментировать, когда будет постоянный адрес:
            # textbutton _("TSSR Boosty"):
            #     action OpenURL("https://boosty.to/<slug>")

            ## Подвал — динамический (UX-формулировка владельца: «назад, если
            ## ничего не менял, иначе — сохранить/применить»; 2026-10-16:
            ## «Close» -> «ОК» — после смены языка кнопка читается как
            ## подтверждение, а не как побег):
            ##   чисто   -> [ОК];
            ##   «грязно» -> [Отменить правки] + [Применить и перезапустить]
            ##             (безмолвного закрытия с изменениями НЕТ: паттерн
            ##             unsaved-changes из ресёрча; отмена = явная кнопка).
            hbox:
                spacing 15
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
                        style "tssr_secondary"

    # Esc = зеркало подвала: при изменениях — Применить, иначе — ОК.
    key "game_menu" action (Function(tssr_fs_apply) if tssr_fs_dirty() else Return())


## Фон: вся страница, тёмный полупрозрачный — фон меню едва виден (правка
## владельца 2026-10-16: «хочется больше уровень затемнения»: c7=78% -> e6=90%;
## ещё темнее — f2=95%).
style tssr_mod_page is frame:
    xfill True
    yfill True
    background Solid("#0b0e14e6")
    padding (60, 40, 60, 40)

## Колонка контента: ФИКСИРОВАННАЯ ширина — контент не меняет геометрию.
style tssr_mod_column is vbox:
    xalign 0.5
    yalign 0.5
    xsize 1100
    spacing 10

style tssr_mod_title is gui_text:
    size 44
    color "#ffffff"

style tssr_mod_hint is gui_text:
    size 22
    color "#9aa4b2"

style tssr_mod_section is gui_text:
    size 30
    color gui.accent_color

style tssr_mod_row is gui_text:
    size 26
    color "#e6e6e6"
    xsize 300
    yalign 0.5

## Material-стиль (правка владельца 2026-10-16: «строгие прямоугольники» ->
## скруглённые пилюли): в Ren'Py 7.4 нет нативного border-radius — скругление
## через 9-slice рамку картинок mod/images/ui/round*.png (генерятся
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
    xsize 130
    yalign 0.5

## Значение в рамке +/- степпера (инпуты убраны: клик по ним в 7.4.11 не
## активирует редактирование — см. tssr_fs_bump).
style tssr_mod_value is gui_text:
    color "#ffffff"
    xalign 0.5
    yalign 0.5

style tssr_step is button:
    background tssr_ui_pill_soft
    hover_background tssr_ui_pill_ghost
    padding (16, 5, 16, 5)

style tssr_step_text is gui_text:
    size 30
    color "#e6e6e6"
    hover_color gui.accent_color

style tssr_mod_preview is gui_text:
    color "#9aa4b2"
    yalign 0.5

## Кнопка-бейдж (правый верх): подпись = текущий язык. Компактная пилюля.
style tssr_badge is button:
    background tssr_ui_dark
    hover_background tssr_ui_hover_sky
    padding (12, 4, 12, 4)

## Настоящий Bold: instance из Literata-VF (wght=700), лежит в mod/fonts/
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
##    в mod/tl/<код>/ — без правки официальных файлов)
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

    old "Site"
    new "Сайт проекта"

    old "Apply and restart"
    new "Применить и перезапустить"

    old "OK"
    new "ОК"
