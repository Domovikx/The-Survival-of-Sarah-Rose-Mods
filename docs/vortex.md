# Vortex — как устроен и как у нас настроен

Дата: 2026-11-14 · источники — в конце файла.

## 1. Что такое Vortex (в двух абзацах)

Vortex — официальный менеджер модов от Nexus Mods. Он **не «на игру»**: это одно
приложение, внутри которого много игр. Чтобы Vortex умел работать с конкретной
игрой, ему нужна **game-extension** — плагин, который описывает: как найти игру на
диске, куда раскладывать файлы модов, какие установщики (FOMOD) понимать.

Для игр из каталога Nexus такие расширения уже встроены/публикуются официально. Для
игр, которых в каталоге нет (наша), расширение делает автор модов и публикует на
Nexus в разделе **Modding Tools → Vortex Extensions**.

## 2. Модель: одно расширение — много модов

- **Расширение = поддержка игры.** Vortex показывает **одно расширение на игру**.
  Если их несколько — берётся то, у которого больше endorsements на Nexus.
- **Моды/патчи = контент.** Их сколько угодно и от любых авторов. Расширение
  **не содержит списка модов** и ничего не «перелинковывает»: оно задаёт правила,
  по которым Vortex ставит **любой** мод этой игры.
- Следствие: другим авторам патчей **не нужно** своё расширение — они просто
  публикуют мод в игре. Своё расширение имеет смысл только чтобы улучшить саму
  поддержку игры (load order, спец-установщики, save-менеджмент) — и тогда это
  конкуренция расширений по популярности.

## 3. Наше расширение (как есть)

| Параметр                     | Значение                                                              |
| ---------------------------- | --------------------------------------------------------------------- |
| `id`                         | `thesurvivalofsarahrose`                                              |
| `gameId` (Nexus)             | `11043` — **обязательное** поле `info.json`                           |
| Steam App ID                 | `2166470` (автодетект игры через библиотеку Steam)                    |
| `mergeMods` / `queryModPath` | `true` / `''` → моды ставятся **в корень игры**                       |
| Файлы архива                 | `info.json`, `gameart.png` (640×360, ≤1 МБ), `index.js` — **в корне** |
| Версия                       | 1.0.0 (semver; обязана совпадать с версией файла на Nexus)            |
| Nexus-страница               | https://www.nexusmods.com/site/mods/2600 (Published, 1 файл)          |
| Исходники в репе             | `patches/ai-voice-pack/vortex-extension/game-thesurvivalofsarahrose/` |
| Установленная копия          | `%APPDATA%\Vortex\plugins\game-thesurvivalofsarahrose\`               |

Почему `queryModPath: ''`: наш пак — это FOMOD-архивы с путями `mods/tssr-ai-voice-pack/...`
и файлом `environment.txt` в корне. Ровно так их ждёт Ren'Py (searchpath), поэтому
точка деплоя = корень игры.

## 4. Путь пользователя (полная цепочка)

```text
1. Скачал Vortex:      https://www.nexusmods.com/about/vortex
2. Поставил, залогинился (OAuth Nexus, пароль в приложение не вводится)
3. Vortex просканировал ПК → список найденных игр
4. Нашу игру он не знает → нужно расширение:
   оно подтягивается из Modding Tools → Vortex Extensions (≤2 ч после публикации)
5. Игра появилась плиткой (gameart) → Play / Mods
6. Mods → «Get mods» / Browse Nexus → страница игры на Nexus
7. Любой мод → «Download with Vortex» (nxm://) → FOMOD → Deploy
```

## 5. Где сейчас затык (2026-11-14)

| Звено                                                | Статус            | Комментарий                                             |
| ---------------------------------------------------- | ----------------- | ------------------------------------------------------- |
| Расширение в Vortex (детект, FOMOD, деплой)          | ✅ работает       | проверено E2E: установка/удаление/purge                 |
| Страница расширения на Nexus                         | ✅ Published      | `site/mods/2600`, 1 файл 1.0.0                          |
| Подхват расширения каталогом Vortex                  | ⏳ ≤2 ч           | после публикации; проверять `GET /v3/vortex/extensions` |
| Страница игры `nexusmods.com/thesurvivalofsarahrose` | ❌ 404            | игра **не одобрена** Nexus                              |
| Наш мод на Nexus                                     | ⏳ не опубликован | «will be published when the game is approved»           |

**Вывод:** Vortex у нас рабочий и полезный (разработка, тесты, установка у тех, кто
уже поставил расширение). Публичным каналом распространения он станет, когда Nexus
одобрит игру: до этого страница игры и наш мод закрыты.

## 6. Что делать (по шагам)

1. **Сейчас — ждать апрув игры.** Ускорить нельзя; письма в support не пишем
   (решение владельца).
2. **Через ~2 часа** проверить, что каталог отдаёт наше расширение:
   `node tmp/vortex_ext.mts` (или `GET /v3/vortex/extensions`), либо в Vortex →
   Extensions → Check for updates.
3. **После апрува игры** — прогнать чек-лист:
   - открывается `nexusmods.com/thesurvivalofsarahrose`, в каталоге виден наш мод;
   - кнопка Vortex «Get mods» ведёт на страницу игры, а не 404;
   - в чистом профиле Vortex: установка main + voice-ru из Nexus (не из файла),
     проверка раскладки (`mods/tssr-ai-voice-pack/` + `environment.txt`), удаление.
4. **Не блокируется апрувом** (можно делать параллельно): обновить скриншоты,
   дополнить `README.txt` в архивах (нужна пересборка `npm run build:pack`),
   освежить описание на странице мода.

## 7. Автоматизация (наши инструменты)

- `skills/cdp-browser/` (в этом репозитории, `.opencode/skills/cdp-browser/`) —
  управление живым Chrome через CDP: `tabs | eval | shot | nav | click | open | dialog`.
  Нужен, когда Playwright MCP недоступен, а вкладки пользователя уже залогинены.
- `skills/vortex-ops/` (в `indie-ops`) — E2E-цикл установки модов в Vortex,
  game-extension, FOMOD, готчи (purge, drag&drop, `gamePath`).

## 8. Источники

- Упаковка расширения: https://github.com/Nexus-Mods/Vortex/wiki/How-to-package-a-game-extension
- Загрузка на Nexus: https://github.com/Nexus-Mods/Vortex/wiki/How-to-upload-an-extension-to-nexus
- Тестирование расширения: https://github.com/Nexus-Mods/Vortex/wiki/How-to-test-a-game-extension
- Ревью (процесс закрыт): https://github.com/Nexus-Mods/Vortex/wiki/How-to-submit-a-game-extension-for-review
- Разработка расширения: https://github.com/Nexus-Mods/Vortex/wiki/How-to-develop-a-game-extension
- Скачать Vortex: https://www.nexusmods.com/about/vortex
- Каталог игр Nexus (id/домены): https://data.nexusmods.com/file/nexus-data/games.json
- API (расширения): `GET https://api.nexusmods.com/v3/vortex/extensions`
