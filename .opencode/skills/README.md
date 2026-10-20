# Конвейер перевода TSSR

```text
game/  ──extract──▶  tl/ru/{Arc}/{Scene}.rpy  ──translate──▶  tl/ru/{Arc}/{Scene}.rpy (new заполнен)
                          │
                    ┌─────┴──────┐
                    ▼            ▼
              dedup         review
         (удаление дублей)  (проверка качества)
```

## Быстрый старт

```bash
# Извлечь все строки из game/ → tl/ru/
npm run extract

# Проверить прогресс перевода
npm run verify

# Статус по аркам
npm run tlstat

# Очистить кэш Ren'Py (после обновления переводов)
npm run clearcache
```

## Pipeline (скилы для opencode)

| Шаг | Скил                  | Назначение                                                |
| --- | --------------------- | --------------------------------------------------------- |
| 1   | `renpy-extract`       | Извлечение текстов из `game/` → `tl/ru/{Arc}/{Scene}.rpy` |
| 2   | `skill-translate-rpy` | Заполнение `new` для одного файла                         |
| 3   | `skill-review-rpy`    | Проверка качества перевода в файле                        |
| 4   | `orchestrator`        | Пакетный запуск (2+3) для N файлов параллельно            |
| 5   | `renpy-clear-cache`   | Очистка кэша после обновления переводов                   |

### Вспомогательные

| Скил                     | Назначение                                             |
| ------------------------ | ------------------------------------------------------ |
| `renpy-dedup`            | Удаление дублирующихся `old` строк между файлами       |
| `list-translation-files` | Статус перевода по аркам/файлам                        |
| `renpy-audit`            | Аудит целостности tl: git-ref vs рабочая копия vs игра |

## npm-команды (из корня проекта)

```bash
# Извлечение и проверка
npm run extract           # Извлечь строки game/ → tl/ru/
npm run extract-builtins  # Извлечь встроенные строки Ren'Py
npm run verify            # Проверить целостность game/ vs tl/ru/

# Дедупликация
npm run dedup             # Удалить дубли old строк
npm run dedup-dry         # Предпросмотр (без изменений)

# Очистка кэша
npm run clearcache        # Удалить *.rpyc, __pycache__, *.log

# Статус
npm run tlstat            # Статус перевода по аркам

# Аудит целостности (после регенерации/апдейта игры)
npm run tlaudit -- --game "<установка>/game"
```

### Для opencode-команд (слэш-команды)

```text
/renpy-extract [extract|verify]    — извлечение/проверка
/list-translation-files [status]   — статус перевода
/translate-arc <арка|файлы>        — перевод арки через orchestrator
```

## Структура переводов

После extract с явными путями (`--game <установка>/game --tl patches/ai-voice-pack/tl/ru`):

```text
patches/ai-voice-pack/tl/ru/
├── Prologue/            # ~241 строк
├── WarriorPath/         # ~8646 строк
├── MagePath/            # ~6729 строк
├── SailorPath/          # ~3865 строк
├── HassarPath/          # ~2895 строк
├── UnionKingdom/        # ~5253 строк
├── BlackMonolith/       # ~6181 строк
├── HollowWorld/         # ~4485 строк
├── Training/            # ~1546 строк
├── StoryBeginnings/     # ~1035 строк
├── ...
├── screens.rpy          # UI-строки (_("text"))
└── misc_strings.rpy     # Имена персонажей + define
```

Всего ~19 арок, ~60k+ строк.

## Типы блоков

| Тип              | Пример                            | Куда попадает      |
| ---------------- | --------------------------------- | ------------------ |
| `dialogue`       | `s "Hello"` или `"Sarah" "Hello"` | Файл сцены         |
| `narration`      | `"It was a dark night."`          | Файл сцены         |
| `menu_choice`    | `"Leave":`                        | Файл сцены         |
| `ui_string`      | `_("Start")`                      | `screens.rpy`      |
| `character_name` | `Character(_("Sarah"), ...)`      | `misc_strings.rpy` |
| `define_string`  | `define x = _("text")`            | `misc_strings.rpy` |

## Формат файла перевода

```rpy
# -*- encoding: utf-8 -*-
# Arc: Prologue | Scene: OpeningScene

translate ru strings:

    old "Original English text"
    new "Перевод на русский"
```

## Типовой workflow

```bash
# 1. Первичное извлечение
npm run extract

# 2. Проверить статус
npm run tlstat

# 3. Перевести (через opencode: /translate-arc Prologue)

# 4. Проверить целостность
npm run verify

# 5. Дедуплицировать
npm run dedup-dry    # предпросмотр
npm run dedup        # реально

# 6. Очистить кэш Ren'Py и проверить в игре
npm run clearcache
```
