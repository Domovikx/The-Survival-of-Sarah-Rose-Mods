# nexus-publish — публикация пакета на Nexus Mods

Когда использовать: выпуск новой версии мода (main + голоса) на Nexus, проверка
статуса страниц/файлов, проверка собранных архивов перед заливкой.

## Быстрый старт

```bash
# 1. Собрать архивы (если ещё не собраны)
npm run build:pack

# 2. Проверить архивы: 7z t, версия внутри, отсутствие exe/cmd/ps1, sha256
node .opencode/skills/nexus-publish/verify_dist.mts

# 3. Залить новую версию (все голоса + main)
node .opencode/skills/nexus-publish/upload.mts --version 1.0.3
node .opencode/skills/nexus-publish/upload.mts --version 1.0.3 --only "Voice RU"

# 4. Проверить состояние публикации
node .opencode/skills/nexus-publish/check.mts
```

## Что нужно

- Personal API key: `nexusmods.com/settings/api-keys` → положить в
  `~/.config/opencode/secrets/nexus-apikey.txt` (в репу не коммитить).
- `tmp/openapi.yaml` — спека API (скачать: `curl -s https://api.nexusmods.com/openapi.yaml -o tmp/openapi.yaml`).
- 7-Zip в `C:\Program Files\7-Zip\7z.exe` (для `verify_dist.mts`).

## Как устроено (коротко)

- Файл на Nexus = «версия» внутри группы файлов (`groupId`). Группа — это «семья»
  (main / Voice RU / …), версии растут внутри неё.
- Заливка: `POST /v3/uploads` → `PUT` presigned (нужны `Content-Disposition`,
  `Content-MD5`, **`Content-Length`**) → `finalise` → `state=available` →
  `POST /v3/mod-files/{groupId}/versions`.
- Старые версии не удаляются (DELETE в API/UI нет), а **архивируются**
  (`archive_existing_file: true`).

## Правила

1. Версия мода и версия файла должны совпадать с `PACK_VERSION` сборки.
2. Один прогон на файл — **повтор создаёт дубль версии** с тем же номером.
3. `update_mod_version: true` только у главного файла.
4. Пока игра не одобрена Nexus, публичного индекса нет (`/v3/mods/<id>` → 404),
   но UI автора и заливка работают.
5. UI-путь (если API недоступен) — см. `MAP.md`, там же грабли SCEditor/headlessui.
