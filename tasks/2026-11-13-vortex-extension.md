# Vortex game extension для TSSR — публикационное состояние

Статус: DOING (2026-11-13)

## Цель

Дать пользователям путь «поставил через Vortex» без ручных действий: Vortex
должен сам находить игру и раскладывать пакет по FOMOD-путям. Сейчас работает
только на машине автора, потому что путь к игре захардкожен.

## Что уже есть

- Рабочая extension: `%APPDATA%\Vortex\plugins\game-thesurvivalofsarahrose\`
  (`info.json`, `index.js`, `gameart.jpg`).
- `queryModPath: ''` + `mergeMods: true` → FOMOD-пути `mods/...` и
  `environment.txt` ложатся от корня игры. E2E установки/удаления пройден
  (см. `tasks/2026-11-13-single-file-installer.md`).
- Скилл `indie-ops/skills/vortex-ops/` (SKILL.md, MAP.md, шаблон).

## Что делаем

1. Автодетект игры вместо хардкода: `util.steam.findByAppId('2166470')`
   (App ID Steam; в `appmanifest_2166470.acf` совпадает), затем
   `findByName('The Survival of Sarah Rose')`, иначе — ручной выбор папки
   пользователем (стандартное поведение Vortex при неудачном `queryPath`).
2. Исходники extension держим в репозитории:
   `patches/ai-voice-pack/vortex-extension/game-thesurvivalofsarahrose/`.
3. `gameart.jpg` — 640×360 (рекомендованный Vortex размер), лёгкий.
4. Проверка в живом Vortex 2.10.1: удалить старую копию из `plugins/`,
   поставить новую, перезапустить, убедиться, что игра находится сама
   (лог `found game`, страница Games, без хардкода пути в коде).
5. Кайдзен: обновить `indie-ops/skills/vortex-ops/` — автодетект вместо
   хардкода пути в шаблоне и в MAP.

## Каналы распространения (решение после проверки)

| Канал                                             | Что нужно                                      | Комментарий                                                              |
| ------------------------------------------------- | ---------------------------------------------- | ------------------------------------------------------------------------ |
| PR в `Nexus-Mods/vortex-games`                    | форк, ветка `games/thesurvivalofsarahrose`, PR | официальный путь; попадает в сборку Vortex, пользователю ничего не нужно |
| Отдельная страница мода (Nexus, категория Vortex) | архив с папкой extension + инструкция          | быстро, но требует ручной установки в `%APPDATA%\Vortex\plugins`         |
| Ничего не публиковать                             | —                                              | работает только ручная распаковка архива                                 |

Порядок: сначала мод должен пройти апрув на Nexus, extension — PR в
`vortex-games` (если ревью затянется, продублировать страницей).

## Приёмка

- В `index.js` нет абсолютных путей.
- На чистом профиле Vortex игра находится автоматически (после «Games → Manage»).
- Установка `main.7z` + `voice-ru.7z` раскладывает файлы в корень игры и в
  `mods/tssr-ai-voice-pack/`, удаление через Remove + Purge Mods чистит папку.
- `info.json` проходит валидацию Vortex (расширение грузится без ошибок в логе).

## Out of scope

- Публикация PR без явного разрешения владельца.
- Автоматическая установка самого мода из Nexus (зависит от апрува игры).

## Найдено при проверке (2026-11-13)

- `util.steam.findByAppId('2166470')` работает и отдаёт
  `{ appid, gameStoreId, name, gamePath, lastUser, lastUpdated, manifestData }`.
- **Готча:** путь лежит в `gamePath`, а не в `path`. Если вернуть `undefined`,
  Vortex не пишет ошибку — в логе есть `discovering game`, но нет `found game`,
  игра просто не находится. Первая версия extension именно так и молчала.
- Проверка на своей машине требует «чистого» id: игра уже Managed, путь кэшируется
  в `settings.gameMode.discovered`, `queryPath` повторно не вызывается. Тест —
  копия extension с другим `id`, у неё discovery идёт с нуля.
- `gameart.jpg` — 640×360 (рекомендация Vortex), 42 КБ.

## Канал публикации — решено 2026-11-13

- PR в `Nexus-Mods/vortex-games` **отменён**: репозиторий заархивирован 20.05.2026,
  «no longer accepting pull requests»; GitHub-ревью расширений тоже retired.
- Рабочий канал: страница мода на Nexus, Game = **Modding Tools**,
  Category = **Vortex Extensions**, один файл в Main Files. Vortex подхватывает
  за ~2 часа при валидном `gameId`.
- Пакет приведён к требованиям: `gameId: 11043`, `gameart.png` (640×360, PNG,
  без текста), `info.json` version 1.0.0 = версия файла на Nexus.
- Черновик страницы создан: `https://www.nexusmods.com/games/site/mods/2600`
  (General + Media + Files заполнены). Публикация ждёт окончания вирус-скана
  файла (кнопка Publish задизейблена).
