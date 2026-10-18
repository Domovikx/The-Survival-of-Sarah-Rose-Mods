# The-Survival-of-Sarah-Rose-Mods

Приватная репозиторий патчей к игре The Survival of Sarah Rose (Ren'Py). Конвейер:
`extract → generate → build → deploy`. Игра — только вход (чтение текстов) и минимальные
точки врезки (`environment.txt` + `mod/`).

## Структура

- `patches/ai-voice-pack/` — патч «AI Voice Pack + переводы»:
  - `mod/` — searchpath-слой (rpy, шрифты, картинки UI) — уходит в main zip
  - `tl/` — текстовые переводы ВСЕХ языков (`ru/`, …) — в main zip
  - `audio/vo_ru/`, `audio/vo_en/` — построенные голоса — в voice zip'ы per language
  - `tools/` — `extract/` (извлечение текстов из чистой игры), `generate/` (генерация
    голосов), `build/` (сборка zip'ов), `deploy/` (установка на чистую игру)
- `patches/<future-patch>/` — слот под будущие патчи (паттерн «сабпроект на пакет»)

## Установка (пока вручную)

1. Распаковать собранный zip в корень папки игры (появится `mod/`).
2. Скопировать `environment.txt.sample` как `environment.txt` в корень игры и поправить
   путь под свою установку.

## Сборка дистрибутива (zip'ы)

```
python patches/ai-voice-pack/tools/build/build_pack.py   # -> dist/*.zip
```

- `TSSR-AI-Voice-Pack-main.zip` — ядро (раскладка zip = раскладка установки: распаковка
  в корень папки игры). Состав: `mod/`, `game/voice_config.rpy`, `game/tl/<lang>/` (все
  языки сразу), рантайм-каталог `catalog/` (label_arc.json + voice_list.json),\n  `environment.txt` (предзаполнен стандартным Steam-путём), `INSTALL.txt`.
- `TSSR-AI-Voice-Pack-voice-<lang>.zip` — озвучка языка: `ai_voice/<lang>/` (отдельный
  zip на язык, опционально к main).
- `dist/` в `.gitignore` — артефакты в git не коммитятся.

## Точки врезки в игру (все аддитивные)

1. `environment.txt` в корне игры — внешний searchpath на `mod/` (без него игра не стартует,
   если `mod/` существует; см. `mod/README.md`).
2. `mod/` — аддитивный слой (gui-патч, настройки, шрифты).
3. `game/voice_config.rpy` — рантайм-конфиг озвучки (`config.auto_voice`), лежит ВНУТРИ
   официального `game/` (иначе игра молчит).

## Compat-матрица (патч ↔ версия игры)

- AI Voice Pack RU+EN ↔ игра 0.79 — `[ЗАПОЛНИТЬ ПОСЛЕ ПРИЁМОЧНОГО ПРОГОНА]`

## Правила

- Деньги/аккаунты — только руками человека.
- Первичные файлы в game-репе удаляются только по явному подтверждению человека.
