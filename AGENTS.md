# AGENTS.md — правила работы в репе The-Survival-of-Sarah-Rose-Mods

- Репа приватная; контент патчей TSSR (RU+EN). Публичный артефакт — только zip, выложенный
  человеком, когда он решит это делать.
- Коммиты — по ходу задачи; push — с уведомлением человека.
- Первичные файлы в game-репе (`Domovikx/The-Survival-of-Sarah-Rose`, рабочая копия в
  Steam-папке) НЕ удалять и НЕ изменять без явного «ок» человека.
- Маршрут контента: `patches/<патч>/{mod, tl, audio, tools}`. Аудио — простой git (решение
  человека: 20GB wav в репу — ок), без LFS.
- Конвейер патча: `extract → generate → build → deploy` (в `patches/<патч>/tools/`).
- Именование скриптов: `<название>.<сущность>.mts` (spec/tool/util/probe) — канон indie-ops.
- Операционные правила агентов (деньги, браузер, коммиты, ресёрч-first) — indie-ops:
  `tasks/AGENT.md` и скиллы `skills/*-ops`.
