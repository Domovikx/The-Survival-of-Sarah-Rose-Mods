---
name: renpy-audit
description: Аудит целостности переводов Ren'Py после extract-регенерации или апдейта игры. Сравнивает git-ref (HEAD), рабочую копию tl и скан текущей игры; находит потерянные переводы (LOST_TRANS), осиротевшие пары (NOTINGAME), непокрытые строки (MISSING) и классифицирует пропавшие/появившиеся пары (DROPPED/ADDED). Используй после регенерации tl, при подозрении на потерю переводов или мусор в tl.
license: MIT
compatibility: opencode
metadata:
  engine: renpy
  task: translations-audit
---

## Что делает

Скрипт `review_translations.mts` отвечает на вопрос «регенерация ничего не
сломала?» тремя независимыми источниками правды:

- **git-ref снимок** — пары `old/new` из tl на `HEAD` (или другом ref)
- **рабочая копия** — пары из текущего tl-каталога
- **скан игры** — реальные переводимые строки текущей установки (общий
  парсер с `renpy-extract`)

### Категории

- **LOST_TRANS** — была пара с переводом, из рабочей копии пропала, а ЕЁ
  `old` ВСЁ ЕЩЁ есть в игре. Это реальная потеря — расследовать!
- **NOTINGAME** — пара в рабочей копии, но такого `old` в игре больше нет
  (сирота от старой версии игры; `renpy_common.rpy` исключён — engine
  builtins живут вне скана)
- **MISSING** — строка игры, у которой нет пары в рабочей копии
- **DROPPED** — были в ref, нет в рабочей. Классифицируются:
  `[gone|…]` — игры больше нет (автор правил/удалял — легитимно);
  `[IN_GAME|was-translated]` — = LOST_TRANS; `[IN_GAME|was-untranslated]`
  — пропала непереведённая пара (мусор/джунь старого экстрактора)
- **ADDED** — появились в рабочей копии (новые/изменённые строки игры).
  `[UNTRANSLATED]` — требуют перевода

LOST_TRANS/NOTINGAME/MISSING > 0 => exit code 1 (можно ставить в гейты).
DROPPED/ADDED — информационные.

## Использование

```bash
node .opencode/skills/renpy-audit/review_translations.mts \
  --game "<установка>/game" \
  --tl patches/ai-voice-pack/tl/ru \
  [--ref HEAD] [--lang ru]
```

Тот же скрипт через npm: `npm run tlaudit -- --game "<установка>/game"`.

В этом репо `--game` обязателен (в репе нет `game/` — источник строк это
read-only установка).

## Типовой сценарий

1. Зарегенерил tl (`renpy-extract extract`) или обновилась игра
2. Запустил аудит — посмотри LOST_TRANS/NOTINGAME/MISSING (это баги)
3. DROPPED/ADDED глазами: legit-правки игры vs мусор старого экстрактора
4. Новые `[UNTRANSLATED]` из ADDED — на перевод через `/translate-arc`

## Тесты

```bash
cd .opencode/skills/renpy-audit
node --test review_translations.test.mts
```

Покрытие: `parsePairs` (экранирование, границы translate-блока, missing new),
`classify` (все категории, engine-исключение, границы LOST vs DROPPED).
