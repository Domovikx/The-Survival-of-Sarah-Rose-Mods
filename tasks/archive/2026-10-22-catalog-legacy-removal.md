# 2026-10-22 Выпилить каталог-легаси: роутинг озвучки из POT, отчёты в tmp

Статус: DONE

## Задача от пользователя

«label_arc.json это легаси что мы выпиливали», «арки надо при генерации темплейта получать из
источников», «POT — темплейт будет работать как мапа для озвучек». Сегодня: «легаси выпиливаем».

## Цель

Когда обновилась игра или пересобирается дистрибутив, я хочу, чтобы все мапы озвучки строились
из `po/template.pot` (единственный источник: uid, arc, scene, спикер, тон), чтобы в git не жило
ни одного производного каталога и обновление не требовало синхронизации двух источников.

Критерий «стало лучше»: в репозитории не осталось `label_arc.json`/`voices.jsonl`/голосовых
*.md-отчётов; рантайм-json дистрибутива генерируются на сборке из POT/кастов; расхождение
POT ↔ runtime-мап невозможно по построению (всё из одного скана).

## Контекст (что есть сейчас)

Прочитано 2026-10-22:

- `patches/ai-voice-pack/po/template.pot` — 69 120 записей, каждая несёт `#. arc:/scene:/uid:/emotion:`
  (генератор `.opencode/skills/renpy-po/potgen.mts`, e2e-гард байт-в-байт против игры; коммиты
  e70887021, 0207b6516). ru.po освежён с теми же метаданными — роутинг живёт и в PO.
- `patches/ai-voice-pack/catalog/` в git сейчас: `emotions.json` (НЕ легаси — источник тона для
  potgen, решение владельца не удалять), `label_arc.json` (легаси-мапа label→Arc), `voice_list.json`
  (runtime-мапа голосов из кастов), `voices.jsonl` (легаси-каталог 68 322 записи),
  `missing_voices.md` и `voice_sync_report.md` (отчёты, генерит voice_sync.py).
- Рантайм: `voice_config.rpy:62` читает `catalog/label_arc.json` (arc от label-части translation ID);
  `build_pack.py:50` кладёт в дистрибутив только `("label_arc.json", "voice_list.json")` — отчёты и
  jsonl в установку не попадают.
- Конкурентный источник: `voice_catalog.py` строит voices.jsonl + label_arc.json из tl мода +
  script.rpy — дублирует potgen и умирает вместе с jsonl.
- TS-пайплайн пока читает легаси: `voice_batch.mts:43` (`VOICES_JSONL = join(CATALOG_DIR, "voices.jsonl")`);
  `voice_status.mts` упоминает jsonl в докстринге. Переводить чтение на POT/PO — часть задачи
  (по SKILL renpy-po пайплайн читает тексты из PO: ru=msgstr, en=msgid; PO-парсер `po_core.mts` уже есть).
- pytest на HEAD: 6 падений pre-existing (легаси миграции кастов yaml→mts) — задача не должна
  добавлять новых; эти падения чинит/заменяет TS-порт, не эта задача.
- `tasks/` под gitignore НЕ попадает (git check-ignore: нет) — строка в tasks/README.md об этом
  устарела, поправить походу.

## Что сделать (ресёрч, по протоколу `tasks/AGENT.md`)

1. Вопросы ресёрча:
   - Как из POT построить мапу `label → Arc` для рантайма: в POT есть `scene` и `arc`, но именно
     LABEL (имя метки игры) хранится ли как поле, или scene == label? Установить соответствие
     1:1 или правило вывода; сравнить с текущим label_arc.json (264 метки) — расхождения должны
     быть только намеренными (fix артефактов VargaPath5/TrainingPathKate3/prostitutealaric1).
   - Кто генерит runtime-json на сборке: новый `.mts`-генератор (читает POT через po_core, пишет
     label_arc.json во временный стейджинг) versus правка build_pack.py на python-парсинг POT.
     Кандидат в вердикты: TS-генератор (POT-парсер уже в репе, python в сборке не плодить).
   - Судьба `voice_list.json`: оставить текущую генерацию из кастов (voice_manage) или тоже
     вынести на сборку из `casts/casts.mts` (тогда в git останется один emotions.json)?
   - Порог перевода `voice_batch.mts`/`voice_status.mts` на чтение POT (uid/arc/speaker/emotion
     из записей) — что из jsonl-полей (scene/category) не покрыто POT и нужно ли оно.
2. Вебсёрч по бест-практикам: как gettext-проекты хранят производные артефакты (build-time
   генерация vs коммит), ≥2 варианта, метод исключения, вердикт ±.
3. Применение: код и удаления — после согласования вердиктов ресёрча с владельцем.

## Приёмка

- [x] `git ls-files patches/ai-voice-pack/catalog/` — пусто: удалены все три файла
      (`emotions.json`, `label_arc.json`, `voice_list.json`), каталога в репе нет
      (гард `test_build_layout.py::test_patch_root_is_install_mirror`).
- [x] Сборка `npm run build:pack` без ошибок: main.zip 984 файла (143.2 MiB),
      в zip есть `mods/tssr-ai-voice-pack/catalog/{label_arc,voice_list}.json` —
      оба артефакт сборки (генерит `catalog_gen.mts`); `test_build_layout.py`
      обновлён (18/18) и зелёный.
- [x] Сборочный label_arc сверен со старым (git HEAD): 246 → 247 лейблов,
      расхождения — ровно 3 документированных фикса (TrainingPathKate3
      Other→Training, VargaPath5 Prologue→VargaMarionPath, prostitutealaric1
      добавлен), 0 выпавших.
- [x] `node voice_batch.mts --dry-run ru|en` — план байт-в-байт идентичен до/после
      миграции (68 357 фраз/язык; цифра «67 352» в контексте задачи устарела —
      её дал jsonl-эпо; сравнение по tmp/catalog_mig/plan_{ru,en}_{before,after}.txt).
- [x] TS-часть зелёная: node --test 248/248 (240 старых + 7 catalog_gen + 1 e2e
      label-map); pytest — ровно 6 pre-existing падений (baseline HEAD
      подтверждён прогоном git archive), новых нет.
- [x] `npm run potgen` байт-в-байт воспроизводим: e2e 8/8; тон пережил реген
      (68 181 `#. emotion:` до = после, roundtrip).
- [x] Edge: сборка при упавшем генераторе валится с «СБОРКА ОСТАНОВЛЕНА» и
      понятной причиной, пустой/неполный каталог в zip не попадает
      (тест `test_build_stops_with_clear_error_when_catalog_gen_fails`).
- [x] Edge: запись POT без `#. arc:` (86 ui-строк) не ломает генератор —
      фолбэк `_unknown` в рантайме сохранён, тесты potgen/voice_batch зелёные.
- [x] Вердикты ресёрча дописаны ниже (журнал решения), статус — DONE.

## Вердикты ресёрча (журнал решения, 2026-10-22)

1. **Мапа label → arc — ИНВЕНТАРЬ шаблона, не scene-комментарии**: label ≠
   scene (scene = первая сцена арки, label = имя метки). potgen добавляет в
   POT блок `#. label-map: label=arc`, где КАЖДЫЙ сюжетный label игры со spine
   arc (247 шт.); scene-комментарии неполны (дедуп схлопывает сцены без
   уникальных строк — 241 из 247).
2. **Генератор — TS** `catalog_gen.mts` (реестр файлов — этот же каталог):
   label_arc из `parseLabelMap(pot)`, voice_list из `casts/voices.mts` (VOICES:
   озвучен = активный реф; narrator = реф Narrator; 77 names). Python в
   сборке не плодим; build_pack.py зовёт node один раз (кэш), валидирует
   JSON, любая ошибка генератора = остановка сборки.
3. **voice_list.json — тоже на сборку** (из casts/voices.mts), не из kast
   ручной генерации: в git не остаётся ни одного производного каталога.
   by_who выпищен: рантайм (voice_config.rpy) читает только names+narrator.
4. **Тон — ВНУТРИ POT** (`#. emotion:` roundtrip по uid в potgen main();
   `--emotions FILE` = overlay поверх roundtrip для инкрементальной разметки).
   `catalog/emotions.json` удалён — приказ владельца «выпили полностью»
   отменил вчерашнее «не удалять» (инцидент a16e21ef9 уже искуплен: тон
   живёт в шаблоне и переживает регенерацию, пока текст не менялся).
5. **python-писатели заглушены** (не создают catalog/ заново):
   gen_voice_list_json → RuntimeError, voice_catalog.build() ничего не пишет
   (возвращает (meta, entries), --diff в tmp/ работает), voice_sync report →
   подсказка, emotion_tag → черновик в tmp/emotions_tagged.json.
6. Известная поломка ВНЕ рамок: voice_sync status / voice_manage list /
   python voice_status.py читали выпищенный в 83df voices.jsonl и сломаны с
   того коммита — их восстановит TS-порт (задача TS-migration).

## Прогресс

- 2026-10-22 (коммит 83df23398): `voices.jsonl` (23.5 МБ) и отчёты
  `missing_voices.md`/`voice_sync_report.md` выпищены; `voice_batch.mts`
  читает POT+ru.po (пустой msgstr = пропуск), тесты 27/27 + 50/50.
  Пункты ресёрча 1-4 закрыты фактом (категория из msgctxt, arc/scene из
  комментариев POT, uid = md5(msgid) — jsonl-поле `who` никем не читалось).
- 2026-10-22 (завершение): potgen — label-map инвентарь (247) + тон-roundtrip
  (emotions.json удалён, overlay `--emotions`); POT регенерирован (байт-паритет
  e2e 8/8, тон 68 181 = 68 181); catalog_gen.mts + тесты 7/7; build_pack.py
  генерит каталог на сборке (кэш+валидация, edge-тест падения); catalog/
  удалён целиком (3 × D, не закоммичено); python-писатели заглушены (5 файлов);
  тесты переведены на возврат build() (meta включает label_arc); pytest — ровно
  6 pre-existing; node --test 248/248; dry-run-план ru/en байт-идентичен до/после;
  npm run build:pack успешен (main.zip 984 файла).

## Вне рамок (out of scope)

- Порт `voice_sync`/`voice_manage`/`voice_design` на TS — идёт задачей
  `2026-10-21-voice-pipeline-ts-migration.md`; здесь только источники/артефакты.
- Чинка легаси-pytest (6 pre-existing падений от миграции кастов) — их заменяет TS-порт.
- Рантайм-поведение `voice_config.rpy` (поиск аудио, приоритеты opus/wav) — не меняется.
- Коммиты без явного разрешения владельца.

## Файлы (итог)

- `patches/ai-voice-pack/tools/generate/scripts/catalog_gen.mts` (+ `catalog_gen.test.mts`) —
  сборочные рантайм-мапы из POT+кастов (запуск CLI `--out-dir`; экспорт functions).
- `patches/ai-voice-pack/tools/build/build_pack.py` — `_catalog_payload()` (node-сабпрогресс,
  кэш, валидация JSON), в zip каталог кладётся из памяти.
- `patches/ai-voice-pack/tools/generate/scripts/voice_batch.mts` — тон из `#. emotion:` POT.
- `patches/ai-voice-pack/.opencode/skills/renpy-po/potgen.mts` — label-map инвентарь + тон-roundtrip.
- `patches/ai-voice-pack/catalog/` — УДАЛЁН целиком (emotions/label_arc/voice_list).
- python-писатели заглушены: voicekit/catalog.py, voice_manage.py, voice_sync.py,
  voice_catalog.py (возврат (meta, entries), без записи), emotion_tag.py (tmp/).
- `patches/ai-voice-pack/tests/test_build_layout.py` — flip «каталога нет» + 2 edge-теста;
  `tests/test_voice_catalog.py` — тесты на возврат build() вместо jsonl.
- `tasks/README.md` — строка задачи + правка устаревшей фразы про gitignore.

## Связи

- `tasks/2026-10-21-voice-pipeline-ts-migration.md` — верхнеуровневая задача миграции, PO-чтение пайплайна.
- `.opencode/skills/renpy-po/SKILL.md` — контракт POT (arc/scene/uid/emotion, единая мапа).
- `AGENTS.md` — рантайм-раскладка мода и границы установки (только mods/).
