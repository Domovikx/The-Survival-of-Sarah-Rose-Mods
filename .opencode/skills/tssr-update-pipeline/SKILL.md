---
name: tssr-update-pipeline
description: Полный пайплайн обновления TSSR после апдейта игры — от регенерации переводов через озвучку и упаковку дистрибутива до сайта и релиза. Используй, когда владелец говорит «игра обновилась», «прогони обновление», «новая версия игры», «прогони пайплайн от начала до конца» или просит обновить мод под новую версию. Длинный многоступенчатый процесс с точками решения владельца (помечены ⚠).
license: MIT
compatibility: opencode
metadata:
  engine: renpy
  task: game-update-pipeline
---

# Пайплайн обновления TSSR под новую версию игры

Единственный источник правды по полному циклу: игра обновилась → переводы →
озвучка → дистрибутив → сайт → релиз. Каждая ступень заканчивается коротким
докладом владельцу; ⚠ = ТОЧКА РЕШЕНИЯ владельца — стоп и спроси, не спеши.

База запуска — корень репы; команды озвучки — из `patches/ai-voice-pack/`.
Все пути установки берутся из `TSSR_GAME` или Steam-дефолта (voicekit.paths).

## Ступень 0 — Подготовка

1. `git status` — репа чистая (или известно, что мешает; чужую недоделку не
   трогай). `git log --oneline -3` — понять, на чём остановились.
2. Установка игры на месте: `ls "$TSSR_GAME/game/script.rpy"` (или
   Steam-путь). `gh` залогинен. КосyVoice: `C:\tools\cosyvoice3\.venv\Scripts\python.exe`.
3. Договориться с владельцем про PUSH: коммиты по готовности, пуш — ТОЛЬКО
   по явной просьбе.

## Ступень 1 — Регенерация и аудит переводов

```bash
npm run extract -- --game "<установка>/game" --tl patches/ai-voice-pack/tl/ru
npm run tlaudit  -- --game "<установка>/game"
npm run tlstat
```

Аудит — источник правды по изменениям игры:

- LOST_TRANS / NOTINGAME / MISSING > 0 = баги — расследовать ДО перевода;
  обычно их нет, а удаления = правки автора.
- ADDED = новые строки (объём на перевод); DROPPED = пропавшие (классифицировать:
  правки автора — легитимно; мусор старых тулов — удалить).
- Если изменилась структура аркад (новые сцены/лейблы) — ничего не делать,
  extract уже перегенерил tl.

## Ступень 2 — Перевод новых строк (ADDED)

Пропустить, если ADDED = 0.

**Волны.** По 5-7 файлов в волне: по одному агенту на файл, инструкция —
скилл skill-translate-rpy (+ glossary.ru.md). Оркестрация — скилл
orchestrator или сам владелец-агент волнами.

**Ревью.** После волн — по каждому файлу skill-review-rpy (исключение
клавиш: floor-строки new == old легитимны).

**Дедуп.** Если регенерация породила дубли old между файлами:

```bash
npm run dedup -- --tl patches/ai-voice-pack/tl/ru --dry-run   # посмотреть
npm run dedup -- --tl patches/ai-voice-pack/tl/ru             # применить
```

**Проверка.**

```bash
npm run verify -- --game "<установка>/game" --tl patches/ai-voice-pack/tl/ru ru
```

→ 100.0% (остаток = конвенция floor: engine renpy_common + UI-клавиши).

## Ступень 3 — Озвучка

**Пересборка каталога** под новый tl и новый script.rpy:

```bash
npm run potgen        # po/template.pot перезаписан (roundtrip тона + label-map)
npm run po:update     # ru.po досинхронизирован (перенос/ретаргет/новые пустые)
# дельта added/changed/dropped = git diff po/template.pot
```

Манифесты читаются из диффа шаблона (tmp/voice_delta/{added,changed,dropped}.txt
больше не пишутся — source of truth POT):

- added — новые uid: генерировать ru + en;
- changed — ru-текст изменился при том же old: переозвучить ru (--force);
  en не трогаем (текст = old, uid = md5(old) не менялся);
- dropped — сироты: если у них были аудиофайлы — ⚠ чистка с владельца.

**Слои кастов:**

```bash
node tools/generate/scripts/voice_sync.mts status
```

NEW > 0 (новые персонажи) → ⚠ процесс добавления голоса по скиллу
tssr-voice: `voice_sync.mts update --apply` (заглушки) → владелец заполняет
контракты (texts/instruct) → voice_design кандидаты → выбор владельца →
add_candidate + voice_manage select. Без активного рефа персонаж
НЕ озвучивается (пропускается батчем, виден как [--] в voice_status/voice_manage).

**Генерация** (существующие файлы скипаются, resumable, можно рвать):

```bash
node tools/generate/scripts/voice_batch.mts --lang ru
node tools/generate/scripts/voice_batch.mts --lang en
```

Переозвучка изменённого (changed > 0):

```bash
node tools/generate/scripts/voice_batch.mts \
  --lang ru --force --uid $(cat ../../tmp/voice_delta/changed.txt)
```

**Итог:** `node tools/generate/scripts/voice_status.mts --fast` → RU и EN
100%. Внимание на арки без ✓ и на счётчики done > total (остатки старых
файлов).

**Эмоции:** новые uid без разметки озвучиваются без эмоциональных
инструкций — это ок; глобальная разметка — `emotion_tag.mts`
(черновик tmp/emotions_tagged.json, в шаблон — `npm run potgen -- --emotions`).

## Ступень 4 — Дистрибутив

```bash
npm run build:pack
```

→ `dist/TSSR-AI-Voice-Pack-{main,voice-ru,voice-en}.zip` (dist gitignored,
НЕ коммитится). Тест-гарды: pytest tests/test_build_layout.py проходит.

⚠ Установка в реальную игру для приёмки = распаковка zip в корень игры
(внутри main.zip лежат INSTALL/UNINSTALL). Перед тестом: `npm run clearcache`.

## Ступень 5 — Приёмка владельцем ⚠

Владелец слушает новые реплики/голоса в игре. Замечания → точечная
переозвучка (--force --uid), затем сборка дистрибутива заново (Ступень 4).

## Ступень 6 — Коммиты (по явной прости владельца!)

Атомарно, русские однострочные, БЕЗ обратных кавычек в сообщениях:
код/доки тулов → каталог+отчёты (voices.jsonl, label_arc, missing_voices,
voice_sync_report) → tl → аудио (audio/vo_ru + vo_en новые opus).
Гейты перед коммитом: node --test (пофайлово), pytest patches/ai-voice-pack/tests,
npm run spell, npm run lint:md, npm run format:check.
ПUSH — только по явной просьбе.

## Ступень 7 — Сайт (лендинг)

1. Цифры в site/src (i18n-локали: voice.total и соседние ключи) — по
   verify / tlstat / voice_status.
2. Визуальные правки UI игры → скриншоты: shots_capture.ps1 → shots_for_site.py.
3. `cd site && npm run build` (tsc + vite); e2e — если менялось поведение.
4. ⚠ Деплой `npm run deploy` (gh-pages) — публикация только по явному «да».

## Ступень 8 — Релиз ⚠

1. GitHub Releases: 3 zip из dist/ через gh CLI, changelog по изменениям.
2. Nexus — скилл nexus-ops (новая версия патча на существующей странице).
3. Пуш main (по явной прости; перед этим — финальные гейты).

## Ступень 9 — Финал

1. Чистка: tmp/translate/ru, одноразовые песочницы; tmp/voice_delta оставить
   (манифесты полезны до релиза).
2. Финальный доклад: что изменилось (цифры), что сделано, что ждёт решений.

## Ловушки (из опыта 2026-10-20)

- npm-тулу extract/verify/dedup ВСЕГДА передавать --game и --tl (дефолтные
  пути указывают в несуществующее game/).
- Голосовые тулы живут в tools/generate/scripts/ (не tools/).
- Озвучка делается на ОБА языка: ru из new, en из old — всегда два прогона
  voice_batch.
- changed-манифест = переозвучка ТОЛЬКО ru.
- Оркестратор-перевод: один агент = один файл; не проси агентов переводить
  пачками — путают контексты.
- Гейты питоновские тяжёлые (~10 с), node --test гонять пофайлово.
- Воркеры батча не параллелить без нужды (CPU/перегрев); генерацию можно
  рвать и продолжать — всё resumable.
