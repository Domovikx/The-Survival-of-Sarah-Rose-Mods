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

Живут ТОЛЬКО в template.pot; ru.po/es.po их не наследуют — writer записывает
записи без `#.`-комментариев (машинные данные генерации, переводчику не
нужны; желающие используют как подсказку тона):

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
  включая Narrator): тон из `patches/ai-voice-pack/catalog/emotions.json`,
  джойн по ключу md5(текста). Пусто, если файла эмоций нет (`--no-emotions`).

### Памятка: жизненный цикл эмоций (инцидент 2026-10-21)

- **На каждой озвучиваемой записи POT обязана стоять `#. emotion:`** —
  потgen ставит её джойном `catalog/emotions.json[uid]`; запись `speaker:*`
  без тона = баг генерации (WARN в potgen), а не норма.
- **Привязка — только uid (`#. uid:` = md5(msgid))**: при обновлении игры
  неизменённая фраза сохраняет uid → тон переживает обновление (potgen
  пересобирает POT, джойн тот же).
- **Фраза изменилась → новый uid → эмоция сбрасывается** и навешивается
  ЗАНОВО ВРУЧНУЮ (emotion_tag.py) — по семантике фразы и её эмоциональному
  контексту; автоматический перенос старого тона на новый uid запрещён.
  Старые ключи в emotions.json остаются (безвредные сироты), хранить.
- **Эмоция ВСЕГДА на английском** — инструкция диктора для CosyVoice
  (русские/китайские инструкции дают акцент, проверено 2026-09-02).
- **`catalog/emotions.json` — НЕ легаси, удалять запрещено**: коммит
  a16e21ef9 (2026-10-21) вынес каталог как «легаси-каталоги» → POT записался
  без `#. emotion:` и 68 181 запись потеряла тон; восстановлено
  из истории (a16e21ef9^). LLM-разметка (67 267 ключей) не пересоздаётся
  дёшево — отношение как к данным, не к производным. Гард: e2e potgen
  генерирует свежий POT с джойном и сравнивает байт-в-байт с закоммиченным —
  пропажа json или `#. emotion:` валит тест («запусти npm run potgen»).

POT — **единственная мапа озвучки**: иерархия «сцена → арка → строки» живёт
в комментариях записей (`#. scene:` / `#. arc:`), ничего параллельного ей
не нужно. Рантайм-`label_arc.json` — больше НЕ источник: это артефакт
сборки дистрибутива, который генерится из POT (задача catalog-legacy-removal;
в репе источником не является). Ребячий случай «пустых» лейблов (6 шт.:
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
node --test .opencode/skills/renpy-po/potgen.e2e.test.mts
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
