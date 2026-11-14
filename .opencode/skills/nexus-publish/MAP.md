# MAP — nexus-publish (проверено 2026-11-13/14)

## Идентификаторы

- Наш мод: `game_id=11043`, номер страницы `mods/1`
  (публичный URL появится как `/thesurvivalofsarahrose` после апрува игры).
- Расширение Vortex: игра **Modding Tools** (`site`), `site/mods/2600`.
- `groupId` (нужен для заливки версии) берётся **только** через GraphQL
  `api.nexusmods.com/v2/graphql` с cookie-сессией со страницы:
  `query ModFiles($gameId: ID!, $modId: ID!) { modFiles(gameId:$gameId, modId:$modId) { name version groupId fileId categoryId primary } }`.
  Из node по API-ключу этот запрос недоступен → делать из браузера (см.
  `.opencode/skills/cdp-browser/`).

## Заливка (API v3)

- Auth: заголовок `apikey`. Premium не нужен.
- `PUT` в presigned URL обязателен с `Content-Disposition: attachment; filename="…"`,
  `Content-MD5` (base64 от md5-байтов) и **`Content-Length`** — без него R2 отдаёт
  `411 MissingContentLength` (node-fetch не ставит его для стрима автоматически).
- `POST /v3/uploads` принимает `md5` (hex); с 2026-12-01 он обязателен.
- После `finalise` поллить `GET /v3/uploads/{id}` до `state=available`.
- Версия: `POST /v3/mod-files/{groupId}/versions`
  `{upload_id, name, version, file_category, archive_existing_file, update_mod_version}`.
  `name` должен **точно** совпадать с текущим именем файла, иначе создастся новый файл.
- ⚠️ Повторный прогон создаёт **дубль версии** (у нас так появился второй 1.0.2 у
  Voice PT — архивный, пользователю не виден; удалить нельзя).

## Статусы и гейты

- `GET /v3/mods/<id>` и `/v3/games/<domain>` отдают 404, пока игра не одобрена —
  это не ошибка заливки.
- Страница мода при неодобренной игре показывает
  «This file will be published when the game is approved.»
- Публикация **страницы мода** (не файлов) требует заполненных:
  Full description, тегов, AI-дисклоуза, ≥1 картинки и файла. Когда всё сошлось —
  баннер «Well done! Your mod is ready to publish», кнопка `Publish` активна.
- Кнопка `Publish` может быть реально `disabled` (атрибут) — форс-клик бесполезен.

## UI-путь (когда API недоступен)

- Редактор описания — **SCEditor** (WYSIWYG в iframe). Программная установка
  `textarea.value` не сохраняется. Рабочий способ: править iframe
  (`execCommand('insertHTML')`), затем скопировать `innerText` в скрытую textarea
  нативным сеттером + `input`/`change`, затем `Save`, затем **проверить после
  перезагрузки**. Детали — `.opencode/skills/cdp-browser/MAP.md`.
- Диалоги подтверждения (`[role=dialog]`) в DOM дублируются и часть внутри
  `[inert]` — брать последний не-inert.
- Нативный Chrome-диалог «Перезагрузить сайт?» (beforeunload) через CDP не
  закрывается: не вызывать `location.reload()` из скриптов.

## Проверки после заливки

```bash
node .opencode/skills/nexus-publish/check.mts          # игра в каталоге? расширение в каталоге Vortex?
node .opencode/skills/nexus-publish/verify_dist.mts    # архивы: 7z t, версия, exe, sha256
```

- «Игра одобрена» ⇔ в `data.nexusmods.com/file/nexus-data/games.json` есть
  `"The Survival of Sarah Rose"`. Это самый быстрый детерминированный признак.
