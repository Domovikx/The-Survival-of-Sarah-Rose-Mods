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
Языки забронированы владельцем 2026-10-20: `po/ru.po` (готов, заголовок с
plural-формами) и `po/es.po` (испанский, кандидат №1 после ru — один язык на
Испанию и LatAm).

**Решение владельца (2026-10-20): каталог `po/` — источник истины текстовой
стороны.** Карта источников:

- `po/template.pot` — EN-текст + контексты + uid + тон; пишет ТОЛЬКО potgen
  (e2e-гард байт-в-байт против игры);
- `po/template.speakers.mts` — типизированный список спикеров POT
  (POT_SPEAKERS / PotSpeaker, `export type PotSpeaker = (typeof
POT_SPEAKERS)[number]`); генерится potgen тем же прогоном (e2e-гард
  байт-в-байт); это СПИКЕРЫ (кто говорит), не касты — CAST_NAMES кастов
  рукописный в casts/casts.mts;
- `po/<lang>.po` — переводы (ru: prefill из tl/ru → переводчик → po_update);
- `po/`-блоклисты — human-отказы autofill;
- `casts/` — голоса (касты/рефы + типизированная мапа `casts/casts.mts`),
  гейт человека — вне PO;
- `catalog/` (voices.jsonl, emotions) — производная джойн-таблица, не истина;
- `game/*.rpy` — апстрим-источник строк (зеркало = POT).

Переключение фиксируется тремя шагами (порядок): prefill ru.po из tl/ru →
po_update (до первого апдейта игры) → голосовой пайплайн читает тексты из PO
(ru = msgstr, en = msgid), а не из каталога.

## Скрипты (в корне скилла)

- `potgen.mts` — генератор EN-шаблона: скан game/*.rpy → po/template.pot +
  po/template.speakers.mts (список спикеров POT как TS-константа)
- `po_update.mts` — освежение po/<lang>.po от нового POT (порт Neon
  po_update.py: точный перенос / ретаргет / legacy / новые пустые)
- `po_core.mts` — PO-ядро: parsePo/renderPo/poEscape/poUnescape/normalizeText
  (порт проверенного po_file.py NeonTranslator)

```bash
# Пересборка EN-шаблона из установки игры
npm run potgen
# то же с явными путями
node .opencode/skills/renpy-po/potgen.mts --game "C:/.../The Survival of Sarah Rose/game" --out patches/ai-voice-pack/po/template.pot
# освежить переводы от нового POT (обновление игры)
npm run po:update
```

## Формат записи

```po
#. arc: UnionKingdom
#. scene: MercenaryQueen1
#. uid: 928b18805931076c6fd6fe86d3d240c4
#. emotion: Warmly, with affection
msgctxt "speaker:Voice"
msgid "Go to the ships!"
msgstr ""
```

Это формат POT. В языковом ru.po/es.po из POT течёт **только тон** —
arc/scene/uid не дублируются (решение владельца 2026-10-22, прецедент
NeonTranslator TCCN): связь идёт ключом (msgctxt, msgid) — через ключ
запись .po резолвится в POT и оттуда берёт арку/сцену/uid:

```po
#. emotion: Warmly, with affection
msgctxt "speaker:Voice"
msgid "Go to the ships!"
msgstr "На корабли!"
```

Контексты (msgctxt дисамбигует одинаковые реплики, как в Neon):

- `speaker:<Имя>` — реплика персонажа: define Display Name, иначе строковое
  имя (`"Orc" "Walk!"`), иначе идентификатор (`k "..."` → `speaker:k`);
- `speaker:Narrator` — нарратор (голые кавычки). Оформлен как спикер: для
  озвучки Narrator — полноценный голос (casts/Narrator, `who_to_voice[
'narrator']`), инвариант каталога: `speaker:*` = озвучиваемо, остальное
  = не-речь. В статистике счётчика группа называется «narration»;
- `menu` — варианты меню;
- `speaker-name` — имена персонажей (переводимые имена);
- `ui` — интерфейсные `_("...")`.

Дедуп по (msgid, msgctxt): «Hello» у Sarah и Kate — две записи, повторы того
же текста у того же спикера схлопываются. Сортировка (msgid, msgctxt) —
стабильные дифы. `#:`-референсы не пишутся (вес файла без потребителя, как
в Neon). Экранирование однострочное (`\"`, `\n`, `\\`).

## Метаданные озвучки (комментарии `#.`)

Полный набор (`arc/scene/uid/emotion`) живёт ТОЛЬКО в template.pot, и в
языковые `po/*.po` не течёт **НИЧЕГО** (DRY 2026-10-23: раньше в .po течёк
только тон — убрано, экономия ~2.3 MB на язык / 22.8 MB на все 10). Кто
нуждается в тоне/арке — берёт обратным пайплайном
`pot_resolve.mts` (`loadPotIndex().resolve(msgctxt, msgid)` →
`{uid, arc, scene, emotion, category, speaker}`, `null` при дрейфе), связь с
POT идёт ключом (msgctxt, msgid). po:update (po_update.mts) комментарии в .po
не пишет; po_translate читает тон через резолвер. Потребители резолвера:
`po_translate.mts` (промпт+судья), будущие тулы ревью/озвучки. Каждый вид
комментария:

- `#. arc: <Арка>` — арка текущего label записи: выводится potgen ИЗ ИМЁН
  ЛЕЙБЛОВ ИГРЫ (таблица правил ARC_BY_LABEL/ARC_BY_PREFIX — никаких внешних
  json): префиксная семья (`UnionKingdom*` → UnionKingdom) или точное имя;
  неизвестные лейблы → Other; галереи (art.rpy, replay_gallery.rpy) и
  splashscreen — без арки (не сюжет). При дедупе побеждает первый
  label-владелец. Это роутинг аудио (папка `ai_voice/{lang}/{Arc}/`):
  **каждая озвучиваемая запись (`speaker:*`) обязана нести арку** —
  голосуемая запись без арки = структурная дыра, e2e-гард валит тест;
- `#. scene: <Сцена>` — label записи: тоньше арки (сцена = label игры) —
  таргетинг `--scene` при точечной перегенерации. Якорь первый-побеждает —
  семантика паритетна scene в voices.jsonl;
- `#. uid: <md5(msgid)>` — у КАЖДОЙ записи: наш id фразы, ключ каталога
  (emotions/voices) и суффикс аудиофайла `uid__Who.opus`; мостик POT → аудио;
- `#. emotion: <тон>` — только для `speaker:*` (что реально озвучивается,
  включая Narrator): тон из РАНТРИПА САМОГО ШАБЛОНА — potgen main()
  подхватывает `#. emotion:` предыдущего POT по uid (md5 текста); overlay
  поверх roundtrip — `--emotions FILE`. Пусто при `--no-emotions` или
  первичной генерации без шаблона.

### Эмоции в POT (жизненный цикл — в скилле emotion-tag)

DRY 2026-10-26: правила качества тона, жизненный цикл по uid (сброс при
изменении фразы, инцидент a16e21ef9 и запрет `catalog/emotions.json`,
английский тон, аудит `npm run emotion:audit`, полная переразметка) живут
в скилле `.opencode/skills/emotion-tag/`. Здесь — только механика POT:
roundtrip по uid + overlay `--emotions` (описание самого `#. emotion:` —
в «Метаданные озвучки» выше). Гард: пропажа `#. emotion:` в закоммиченном
POT валит e2e-тест `potgen_e2e.test.mts` («запусти npm run potgen»).

POT — **единственная мапа озвучки**: иерархия «сцена → арка → строки» живёт
в комментариях записей (`#. scene:` / `#. arc:`), ничего параллельного ей
не нужно. Рантайм-`label_arc.json` — НЕ источник: артефакт сборки, который
генерит `catalog_gen.mts` из POT-инвентаря (блок `#. label-map:` — КАЖДЫЙ
сюжетный label игры, 247 шт.; scene-комментарии неполны из-за дедупа).
Ребячий случай «пустых» лейблов (6 шт.:
все их строки — дубли ранних сцен, POT-владельцем стал другой label) в мапу
не попадает — рантайм-фолбэк по uid находит общий аудиофайл в любой арке.

## Нормализация

`normalizeText` в po_core.mts — агрессивная нормаль для матча твинов
(«004 Yeees yeees Ill be thereee 1» → «yes yes ill be there»): минус
пунктуация/апострофы/растяжение букв. Применяется при prefill-миграции
переводов: твин наследует перевод, только если вариант ровно один; отказы
человека копятся в po/autofill_blocklist.txt (порт контракта Neon).

## Гарды парсера (перенесены из renpy-extract)

- define Character собираются ДВУМЯ проходами (все define → затем реплики):
  say-строки в файлах до источника define (replay_gallery/prosalaric vs
  script.rpy) иначе утекали в спикеров-идентификаторов (`speaker:s`,
  `speaker:al`);
- скриптовый `label` — ТОЛЬКО на нулевом отступе: screen-язык
  `label h.who:` (History-экран, screens.rpy:1002) иначе включал парсер, и
  `text "▸"` утекал как спикер «text»;
- statement-ключи Ren'Py (text/extend/voice/imagebutton/…) не бывают
  спикерами (гард SAY_KEYWORDS);
- say с атрибутами (`s happy "текст"`) парсится, если идент — известный
  define (screen-элементы вроде `imagebutton idle "ассет"` так не утекают);
- say/нарратор — только внутри `label` (screen `text "..."` не парсится);
- тела `image`/ATL-блоков не разбираются (ассеты не становятся строками);
- пункты меню — пока отступлены; эхо-реплика внутри опции — отдельная
  запись диалога;
- многострочные реплики и python-блоки внутри label не разбираются.

## Обновление игры («вышла новая версия»)

template.pot перезаписывается ЦЕЛИКОМ — безопасно по построению: POT
генерируемый, переводов не содержит (msgstr всегда ""), история — в git.
Переводы живут в po/<lang>.po и переживают обновление через po_update:

```bash
npm run potgen     # 1. новый POT из обновлённой игры
npm run po:update  # 2. переводы перенесены в новый POT
```

Правила merge (порт NeonTranslator po_update.py): точный (msgid, msgctxt)
переносится; ключ исчез, но EN-текст жив под другим контекстом — перевод
спасён ретаргетом; текст выпал из POT целиком — human-работа священна,
запись остаётся live с флагом `legacy`; новый ключ — пустой msgstr; никаких
fuzzy-догадок (эвристики миграции — дело prefill). Симуляция цикла — в
тестах po_update.test.mts и e2e «новая версия» (копия игры, мутация,
регенерация, merge).

## Тесты

```bash
node --test .opencode/skills/renpy-po/potgen.test.mts
node --test .opencode/skills/renpy-po/po_core.test.mts
node --test .opencode/skills/renpy-po/po_update.test.mts
node --test .opencode/skills/renpy-po/potgen_e2e.test.mts
```

E2E-гард актуальности: закоммиченный template.pot обязан байт-в-байт
совпадать со свежей генерацией (объёмы, uid, emotion, arc/scene, define-резолв;
плюс гард: каждая speaker:*-запись несёт арку) — после
апдейта игры падает с подсказкой «запусти npm run potgen».

## Источники

- NeonTranslator (Third Crisis): po/template.pot, potgen.py, po_file.py,
  prefill_po.py — образец организации и контрактов.
- renpy-extract (TSSR): проверенные правила парсинга .rpy.
- Ren'Py Translation Documentation: https://www.renpy.org/doc/html/translation.html
