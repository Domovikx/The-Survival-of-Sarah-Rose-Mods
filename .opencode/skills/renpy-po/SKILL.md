---
name: renpy-po
description: PO-пайплайн текста TSSR по аналогии с NeonTranslator (template.pot из Ren'Py-исходников, контексты speaker/narration/menu/ui, normalizeText для будущего prefill). Используй для извлечения EN-шаблона перевода из game/*.rpy и работы с po/ каталогом.
---

# renpy-po — PO-пайплайн текста TSSR

## Статус

Прообраз — `.po`-воркфлоу Third Crisis Neon Translator (NeonTranslator/po:
template.pot + ru.po + autofill_blocklist). Источник правды для TSSR — не
дамп Unity, а Ren'Py-исходники `<game>/game/*.rpy` (по умолчанию Steam-
установка, переопределяется `--game`/`TSSR_GAME`).

Шаг 1 (этот скилл): `po/template.pot` — EN-шаблон, одна запись на уникальную
пару (текст, контекст). Шаги 2+ (в работе): `ru.po` — миграция существующих
переводов из `tl/ru/` (prefill по normalizeText-твинам, human-блоклист как
`autofill_blocklist.txt`), затем обновление PO при апдейтах игры (fuzzy-перенос).

## Скрипты (в корне скилла)

- `potgen.mts` — генератор EN-шаблона: скан game/*.rpy → po/template.pot
- `po_core.mts` — PO-ядро: parsePo/renderPo/poEscape/poUnescape/normalizeText
  (порт проверенного po_file.py NeonTranslator)

```bash
# Пересборка EN-шаблона из установки игры
npm run potgen
# то же с явными путями
node .opencode/skills/renpy-po/potgen.mts --game "C:/.../The Survival of Sarah Rose/game" --out patches/ai-voice-pack/po/template.pot
```

## Формат записи

```po
msgctxt "speaker:Kate"
msgid "Are you alright?"
msgstr ""
```

Контексты (msgctxt дисамбигует одинаковые реплики, как в Neon):

- `speaker:<Имя>` — реплика персонажа: define Display Name, иначе строковое
  имя (`"Orc" "Walk!"`), иначе идентификатор (`k "..."` → `speaker:k`);
- `narration` — нарраторские строки (голые кавычки);
- `menu` — варианты меню;
- `speaker-name` — имена персонажей (переводимые имена);
- `ui` — интерфейсные `_("...")`.

Дедуп по (msgid, msgctxt): «Hello» у Sarah и Kate — две записи, повторы того
же текста у того же спикера схлопываются. Сортировка (msgid, msgctxt) —
стабильные дифы. `#:`-референсы не пишутся (вес файла без потребителя, как
в Neon). Экранирование однострочное (`\"`, `\n`, `\\`).

## Нормализация

`normalizeText` в po_core.mts — агрессивная нормаль для матча твинов
(«004 Yeees yeees Ill be thereee 1» → «yes yes ill be there»): минус
пунктуация/апострофы/растяжение букв. Применяется при prefill-миграции
переводов: твин наследует перевод, только если вариант ровно один; отказы
человека копятся в po/autofill_blocklist.txt (порт контракта Neon).

## Гарды парсера (перенесены из renpy-extract)

- say/нарратор — только внутри `label` (screen `text "..."` не парсится);
- тела `image`/ATL-блоков не разбираются (ассеты не становятся строками);
- пункты меню — пока отступлены; эхо-реплика внутри опции — отдельная
  запись диалога;
- многострочные реплики и python-блоки внутри label не разбираются.

## Тесты

```bash
node --test .opencode/skills/renpy-po/potgen.test.mts
node --test .opencode/skills/renpy-po/po_core.test.mts
```

## Источники

- NeonTranslator (Third Crisis): po/template.pot, potgen.py, po_file.py,
  prefill_po.py — образец организации и контрактов.
- renpy-extract (TSSR): проверенные правила парсинга .rpy.
- Ren'Py Translation Documentation: https://www.renpy.org/doc/html/translation.html
