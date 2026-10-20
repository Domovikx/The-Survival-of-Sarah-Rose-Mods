---
description: "Извлечение текстов из оригиналов Ren'Py и проверка целостности переводов"
---

Загрузи скил renpy-extract.

Запусти скрипт:

```text
node .opencode/skills/renpy-extract/extract_texts.mts $ARGUMENTS
```

Режимы:

- `extract` — перегенерация `tl/<lang>/{Arc}/{Scene}.rpy` из `game/*.rpy` (существующие переводы сохраняются, новые строки падают как `new == old`)
- `verify` — проверка целостности и прогресса переводов
- `stats` — статистика по блокам и аркам

В этом репо передавай пути явно:

```text
node .opencode/skills/renpy-extract/extract_texts.mts <режим> ru --game "<установка>/game" --tl patches/ai-voice-pack/tl/ru
```

Верни результат пользователю в читаемом виде.
