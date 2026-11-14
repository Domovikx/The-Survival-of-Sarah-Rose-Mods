# Nexus Mods — наши страницы, статусы и как это устроено

Дата: 2026-11-14 · источники — в конце файла.

## 1. Две сущности, которые нельзя путать

| Что                         | Где живёт на Nexus                                    | Зачем                                |
| --------------------------- | ----------------------------------------------------- | ------------------------------------ |
| **Мод** (наш AI Voice Pack) | игра **The Survival of Sarah Rose** (`game_id=11043`) | контент для игроков: тексты + голоса |
| **Vortex Extension**        | игра **Modding Tools** (`site`)                       | плагин поддержки игры для менеджера  |

Это **разные игры Nexus**, поэтому и страниц две — слить нельзя. Дублировать
контент тоже не надо: у мода — полное описание и файлы, у расширения — короткое
техническое описание и ссылка на мод.

Правило категории Vortex Extensions (из вики): **один файл** в Main Files, версия
`info.json` = версия файла, обязателен `gameId`.

## 2. Что у нас есть сейчас

### Мод

- Страница: https://www.nexusmods.com/mods/1?game_id=11043
  (канонический домен появится после апрува игры: `/thesurvivalofsarahrose`)
- Версия: **1.0.2**, файлов: **12** (main + 11 голосов), картинок: 10
- Состав: `TSSR-AI-Voice-Pack-main.7z` + `voice-<lang>.7z`, все с FOMOD
- Статус: **не опубликован** — «will be published when the game is approved»
- Старые версии 1.0.0/1.0.1 в архиве групп; у Voice PT есть архивный дубль 1.0.2
  (следствие двойного прогона API; пользователю не виден, удалить нельзя — DELETE
  файлов на Nexus нет).

### Расширение Vortex

- Страница: https://www.nexusmods.com/site/mods/2600 — **Published**
- Файл: `TSSR-Vortex-Extension-1.0.0.zip` (1 шт., Main/Primary), 1 картинка
- Категория: Modding Tools → Vortex Extensions
- Детали — `docs/vortex.md`

## 3. Статусы Nexus и что они значат

| Статус                              | Где видно          | Что значит                                                                   |
| ----------------------------------- | ------------------ | ---------------------------------------------------------------------------- |
| `Awaiting approval`                 | страница мода/игры | ждёт одобрения **игры** модератором Nexus; до этого файлы не публикуются     |
| `Unpublished`                       | страница мода      | черновик: страницу видит только автор                                        |
| `Published`                         | страница мода      | страница и файлы доступны всем                                               |
| `Virus scan: Some suspicious files` | шапка мода         | агрегат по файлам; у нас остался от **архивных** старых файлов, новые чистые |
| `Virus scanning is in progress`     | карточка файла     | файл ещё сканируется, скачивание недоступно                                  |

Игру на Nexus заводят через «request a game»: критерии — игра standalone, аплоадер
является автором, на странице уже лежат готовые файлы по File Submission Guidelines.
Ревью обычно до недели. У нас заявка подана, статус — awaiting approval.

## 4. Как мы заливаем файлы (два способа)

### UI (через браузер)

`/games/<game>/mods/<id>/edit/files` → **Add file** → нативный выбор файла →
форма (name, category, version, Archive existing file) → **Save file** → **Save**.

### API v3 (быстрее и надёжнее, для 12 файлов)

```text
POST /v3/uploads            {size_bytes, filename, md5}      → presigned_url + upload id
PUT  <presigned_url>        заголовки: Content-Disposition, Content-MD5, Content-Length
POST /v3/uploads/{id}/finalise                                → ждать state=available
POST /v3/mod-files/{groupId}/versions
     {upload_id, name, version, file_category,
      archive_existing_file: true, update_mod_version}
```

Ключевые тонкости:

- Auth: заголовок `apikey` (personal key, Premium не нужен). Ключ хранить только
  локально (`~/.config/opencode/secrets/`), не в репе.
- **`groupId`** — «семья» файла; берётся из GraphQL
  `modFiles(gameId, modId) { groupId }` (`api.nexusmods.com/v2/graphql`, cookie-сессия).
  Не путать с `fileId` (порядковый номер) и с v3-id.
- `Content-Length` обязателен, иначе R2 отвечает `411 MissingContentLength`.
- Запускать **один раз** на файл: повтор создаёт дубль версии с тем же номером.
- Пока игра не одобрена, `GET /v3/mods/<id>` и `/v3/games/<domain>` отдают 404 —
  публичного индекса нет, но UI автора и заливка работают.

## 5. Чек-лист публикации (перед нажатием Publish)

1. **Full description** — обязательное; редактор на сайте = **SCEditor** (WYSIWYG в
   iframe). Заполнять только реальным вводом: программная установка `textarea.value`
   Nexus **не сохраняет** (см. `.opencode/skills/cdp-browser/MAP.md`).
2. **Tags** — хотя бы один.
3. **Generative AI usage** — обязательный выбор (Mod Content: AI-Generated/AI-Assisted;
   вариант «No AI» сбрасывает выбор для всего блока).
4. **Media** — минимум одна картинка (у расширений норма: 1 картинка = арт игры).
5. **Files** — файл сохранён и не «processing».
6. Когда всё сошлось — сверху появляется **«Well done! Your mod is ready to publish»**,
   кнопка `Publish` становится активной → `Publish mod` в диалоге.

## 6. Полезные ссылки

- File Submission Guidelines (требования к архивам): https://help.nexusmods.com/
- Personal API keys: https://www.nexusmods.com/settings/api-keys
- OpenAPI v3 (спека): https://api.nexusmods.com/openapi.yaml
- Каталог игр (id, домены): https://data.nexusmods.com/file/nexus-data/games.json
- Заявка на игру (help/104): https://help.nexusmods.com/article/104
- Наша учётная запись дистрибуции: `docs/distribution-ledger.md`
- Vortex-часть: `docs/vortex.md`

## 7. Что осталось

1. Дождаться одобрения игры (единственный внешний блокер).
2. После апрува: проверить, что мод и страница игры открываются, прогнать
   пользовательский путь из `docs/vortex.md` (§6).
3. Косметика: у Voice PT в истории висит архивный дубль 1.0.2 — удалить нельзя,
   оставлено как есть.
