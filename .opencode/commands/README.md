# Команды (Commands)

Кастомные слэш-команды. Определяются в `.opencode/commands/<name>.md` или в `opencode.json`.

**Документация:** https://opencode.ai/docs/commands/

**Формат Markdown:**

```text
---
description: Что делает команда
mode: subagent  # опционально
---
Шаблон промпта для команды. $ARGUMENTS подставляется из аргументов.
```

**Формат JSON:**

```json
{
  "command": {
    "my-command": {
      "template": "Сделай то-то с $ARGUMENTS",
      "description": "Описание"
    }
  }
}
```

**Пример:**

```text
---
description: Запустить тесты с покрытием
---

Запусти полный набор тестов с отчётом о покрытии:
$ARGUMENTS
```

**Текущие команды:**

- `renpy-extract` — извлечение/проверка переводов
- `list-translation-files` — статус перевода по аркам
- `translate-arc` — перевод арки через orchestrator

Чтобы добавить новую команду, создай `<имя>.md`.
