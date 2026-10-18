---
description: "Извлечение текстов из оригиналов Ren'Py и проверка целостности переводов"
---

Загрузи скил renpy-extract.

Запусти скрипт:

```text
node .opencode/skills/renpy-extract/extract_texts.mts $ARGUMENTS
```

Режимы:

- `extract` — извлечение всех текстов из `game/*.rpy` в `game/tl/ru/{Arc}/{Scene}.rpy`
- `verify` — проверка целостности и прогресса переводов
- `stats` — статистика по блокам и аркам

Верни результат пользователю в читаемом виде.
