# Реализация: однофайловый установщик с проверкой версий и хэшей

Статус: READY

## Задача от пользователя

«давай мы сделаем иннсталятор как отдельный атомарный файл. тоесть как я это вижу мы
качаем install качаем рядом архив мэйн и те архивы которые нам надо для озвучки. далее
просто запускаем инстал и он автоматом проверяет что есть рядом, есть ли мэйн
установленный или рядом и все другие наши архивы рядом при этом нужно как то проверять
версии чтобы и мэйн и переводы имели одну версию иначе не сматчатся, как это сделать я не
знаю самое простое это какойто хэш кей во все архивы ложить, хз как это организовывают,
рекомендую идеи повебсерчить может есть общие паттерны. притом мне нужно чтобы файл инстал
был одним файлом который может система и антивирус прочекать и небольшого размера.»

## Цель

Один маленький `install.exe`, который лежит рядом со скачанными архивами, сам находит
игру, проверяет, что все архивы одной версии и целы, и ставит мод атомарно (или
отказывается, ничего не сломав). Пользователь не должен знать порядок «сначала main,
потом voice» и не должен ловить полуустановленное состояние.

## Контекст (что есть сейчас)

- Сборка (`patches/ai-voice-pack/tools/build/build_pack.mts`) делает `main.7z` и
  `voice-<lang>.7z`; `main` несёт `install.cmd`/`install.ps1`, каждый voice-архив —
  свой установщик. Ставить надо по очереди, аудио без ядра отказывается ставиться.
- Атомарность уже есть внутри установщиков: staging → swap с ретраями и откатом;
  предохранители «сначала main» (exit 3) и «игра запущена» (ждать до 3 мин, exit 4).
- Формат — `.7z` с `-mx=9` (решение владельца: минимальный размер), каждый архив
  проверяется `7z t` при сборке.
- `environment.txt` в корне игры (`RENPY_SEARCHPATH = "mods"`) — контракт движка.
- Мод ставится в `mods/tssr-ai-voice-pack/` (атомарная папка).
- 7-Zip: свободный, exe/dll под LGPL; встраивание `7za.exe` разрешено при указании
  факта использования, лицензии LGPL и ссылки на 7-zip.org (FAQ 7-Zip, прочитано
  2026-11-13).
- `MoveFileExW` с `MOVEFILE_REPLACE_EXISTING` **не заменяет существующий каталог**
  (только файл); поэтому атомарная замена папки — это переименование старой в backup,
  новой в целевую, затем удаление backup (с откатом при ошибке). Источник:
  Microsoft Learn, прочитано 2026-11-13.

## Что изучили (паттерны)

- **7-Zip SFX** (`7z.sfx` / `7zS.sfx` + `config.txt` с `RunProgram`): классический
  «маленький stub + скрипт», ровно под наш случай (install отдельно, архивы рядом).
- **NSIS / Inno Setup**: надёжные однофайловые установщики, но payload встраивается
  внутрь → файл вырастает до размера всех архивов, что противоречит требованию
  «install маленький, архивы рядом».
- **MSIX / App Installer**: версии и подпись есть, но требует сертификата и плохо
  ложится на мод игры; избыточно.
- **Chocolatey / WinGet**: манифест + checksum (SHA-256) — тот же принцип, что
  предлагаем: версия и хэши в метаданных, а не в имени файла.
- **Семантические версии + `minInstaller`**: установщик проверяет, что он достаточно
  новый для формата архивов.

## Предлагаемое решение

### 1. Манифест внутри каждого архива

Путь в архиве: `pack/manifest.json` (маленький, лежит первым/последним — не важно).

```json
{
  "pack": "tssr-ai-voice-pack",
  "format": 1,
  "version": "2026.11.13",
  "kind": "main",
  "lang": null,
  "installerMin": 1,
  "files": [{ "path": "zzz_ui.rpy", "size": 12345, "sha256": "..." }]
}
```

- `version` — тег релиза, одинаковый у main и всех voice одного выпуска.
- `kind`: `main` | `voice`; у voice обязателен `lang`.
- `files` — каждый файл payload с размером и SHA-256. Это и целостность, и защита от
  подмены/недокачки.
- Хэш самого архива внутрь не кладём (нельзя захэшировать файл в нём же), а отдельный
  `SHA256SUMS` не добавляем — лишний файл рядом.

### 2. Что такое `install.exe`

Вариант A (рекомендуемый, MVP): 7z SFX ~2–3 МБ, внутри `7za.exe`, `install.ps1`,
`LICENSE-7zip.txt`. При запуске распаковывается в `%TEMP%` и вызывает скрипт.
Плюсы: минимум кода, используется уже написанный PowerShell-установщик.
Минус: SFX + `-ExecutionPolicy Bypass` — эвристика для антивируса; лечится подписью.

Вариант B (если AV будет ругаться): маленький нативный лаунчер (Go/Rust/C#,
3–15 МБ) со встроенным `7za.exe`/`7z.dll` как ресурсом. Дороже по Toolchain, зато
нет SFX-эвристики. Решать по факту проверки Defender.

Оба варианта — **один файл**, который пользователь скачивает один раз; архивы лежат
рядом и не встраиваются.

### 3. Алгоритм

1. Определить папку игры: рядом с exe есть `game/` и `renpy/` → это корень; иначе
   подняться на уровень выше; иначе — понятная ошибка «положи install.exe в папку игры».
2. Найти рядом `TSSR-AI-Voice-Pack-*.7z` (и main, и голоса).
3. Для каждого архива прочитать `pack/manifest.json`:
   `7za.exe e -so <архив> pack/manifest.json`. Не читается — «это не наш архив».
4. Проверить:
   - `pack` и `format` совпадают, `installerMin ≤` версия установщика;
   - **все `version` равны**; если нет — показать список «архив → версия» и выйти,
     ничего не трогая;
   - ровно один `main`, языки voice уникальны;
   - если main не найден и в игре нет установленного мода — отказ.
5. Прочитать установленную версию (`mods/tssr-ai-voice-pack/pack/manifest.json`):
   та же версия → предложить «переустановить/выйти»; новее установленной → предупредить.
6. Проверить `7z t` каждого выбранного архива (CRC до распаковки).
7. Распаковать в `<игра>/mods/.tssr-staging-<rand>/`, сверить размер и SHA-256 каждого
   файла, убедиться, что лишних файлов нет.
8. Атомарная замена: `mods/tssr-ai-voice-pack` → `.tssr-backup-<rand>`;
   staging → `mods/tssr-ai-voice-pack`; удалить backup. Любая ошибка → вернуть backup.
9. Создать `environment.txt` (`RENPY_SEARCHPATH = "mods"`), если его нет.
10. Написать `install.log` рядом с exe (или в `%TEMP%`), показать итог.

### 4. Коды выхода и сообщения

- 0 — установлено;
- 2 — рядом нет архивов;
- 3 — разные версии (показать какие);
- 4 — игра запущена (ждать до 3 мин, потом отказ);
- 5 — архив битый / хэш не сошёлся;
- 6 — нет main (ни рядом, ни установленного);
- 7 — нет прав на запись.

### 5. Сборка

- `build_pack.mts` пишет `pack/manifest.json` в каждый архив (двухпроходно: файлы →
  хэши → манифест → 7z) и печатает версии.
- Там же собирается `install.exe` (SFX) с тем же `version`/`installerMin`.
- Версия берётся из одного места (package.json или аргумент сборки), чтобы не
  разъехалась.

## Что сделать

1. Согласовать формат манифеста и версию (тег) — 15 минут с владельцем.
2. Добавить запись манифеста в `build_pack.mts` + тест: у всех архивов один `version`,
   у voice есть `lang`, у main `kind=main`.
3. Написать `install.ps1` (логика выше) и упаковать SFX; тесты на фикстурах
   (main+2 voice, разные версии, битый архив, нет main).
4. Прогнать E2E на копии игры: установка, повторная установка, смешанные версии,
   игра запущена, откат при искусственной ошибке.
5. Проверить Defender/AV на собранном exe; при ложном срабатывании — вариант B.
6. Обновить README (пользовательский флоу: скачать install + архивы → запустить) и
   `docs/distribution-ledger.md`.

## Приёмка

- [ ] `install.exe` — один файл, ≤5 МБ, запускается двойным кликом без консоли.
- [ ] main + 2 voice рядом → всё ставится одной командой, версия одна.
- [ ] Смешанные версии → отказ с понятным списком, установка не изменилась.
- [ ] Битый/недокачанный архив → отказ, установка не изменилась.
- [ ] Только voice без main и без установленного мода → отказ (exit 6).
- [ ] Повторный запуск той же версии → идемпотентно.
- [ ] Игра запущена → ждёт/отказывает, мод не ломается.
- [ ] Искусственная ошибка после rename backup → старая установка восстановлена.
- [ ] Defender не блокирует (проверено вручную); подпись — если появится сертификат.
- [ ] Nexus-вариант архивов: внутри только контент, без `.exe`/`.cmd`/`.ps1` и без вложенных архивов.
- [ ] `install.exe` не загружается на Nexus (только GitHub/Boosty).
- [ ] `zip`/`7z` тесты сборки и TS-тесты остаются зелёными.

## Вне рамок (out of scope)

- Автоматическое скачивание архивов и авто-обновление (это отдельная задача).
- Покупка сертификата подписи и репутация SmartScreen.
- MSIX/Store-дистрибуция.
- Переход с `.7z` на `.zip` (размер важнее простоты распаковки).

## Файлы (ожидаемые)

- `patches/ai-voice-pack/tools/build/build_pack.mts` — манифест + сборка install.exe.
- `patches/ai-voice-pack/tools/build/installer/` — новый `install.ps1`, шаблон SFX.
- `patches/ai-voice-pack/tools/build/*.test.mts` — тесты манифеста/версий.
- `README.md`, `patches/ai-voice-pack/README.md`, `docs/distribution-ledger.md`.

## Связи

- `AGENTS.md` — атомарная установка, предохранители, `environment.txt`.
- `tasks/2026-11-11-patch-spec-distribution-e2e.md` — пользовательский флоу.
- `patches/ai-voice-pack/tools/build/installer/` — текущие установщики.

## Ограничение Nexus (проверено 2026-11-13 на странице мода)

Страница мода (`/mods/1?game_id=11043&tab=files`, читано через Chrome владельца):
все 12 файлов в карантине, «Virus scan: Some suspicious files». Текст Nexus:

- «This file has been quarantined by our automated safety checks. This could be due to:
  **Executables and similar file types**; Flagging by our internal file scanners or
  VirusTotal; **Nested archives** (e.g. a zip containing another zip).»
- «If your mod contains compiled code, include a link to the source code (on GitHub or a
  similar platform) and the steps to build it.»

Наши архивы содержат `install.cmd` + `install.ps1` → это и есть «executables and similar
file types». Плюс мод ещё не опубликован: «This file will be published when the game is
approved».

**Следствие: на Nexus нельзя класть exe/скрипты.** Поэтому каналы разделяем:

- **Nexus**: чистые архивы только с контентом (`.rpy`, `.opus`, шрифты, каталог, README).
  Установка — вручную по README или через Vortex/FOMOD. Никаких `.exe`, `.cmd`, `.ps1`.
- **Off-Nexus** (GitHub Releases / Boosty): `install.exe` + архивы рядом — как задумано
  в этой задаче.
- **FOMOD** (`fomod/ModuleConfig.xml` + `info.xml`) — родной установщик Nexus/Vortex:
  это XML-метаданные, не код; даёт выбор языков без N отдельных файлов. Рассмотреть как
  «одно-кликовый» вариант для Nexus вместо exe.

## AV-практики (свести в README/релиз)

- Не класть исполняемое в Nexus-архивы (их сканер это ловит).
- Для off-Nexus exe: Authenticode-подпись (когда будет сертификат), без упаковщиков и
  обфускации, без `ExecutionPolicy Bypass` в SFX; рядом — ссылка на исходники и шаги сборки.
- Никаких вложенных архивов (zip в zip) — отдельная причина карантина.
- Проверять сборку VirusTotal перед публикацией; хранить отчёт в журнале дистрибуции.

## Ресёрч: как это делают (первоисточники, 2026-11-13)

**Nexus, «Why has my mod been quarantined?» (help/117):**

- «Potentially malicious file types … Generally, any kind of self-extracting file that has
  the potential to cause damage … will be marked for review.» → наш `install.cmd/ps1`
  и любой SFX попадают сюда.
- «Nested archives» — архив в архиве запрещён.
- «Unrecognised archive format» — рекомендуют ZIP или 7z, `.rar` даёт ложные срабатывания.
- «Password protected archive» — запрещено.
- «Too many virus scan hits» — смотреть VirusTotal, писать вендорам.
- Разблокировка: письмо `support@nexusmods.com` со ссылкой на страницу мода; файл не удалять.

**File Submission Guidelines (help/28):** исполняемые файлы, которые лезут в интернет,
запрещены; авто-обновление «не является критичным». Значит наш установщик не должен ничего
скачивать.

**FOMOD (fomod-docs, wrye-bash wiki):**

- Структура: в корне архива папка `fomod/` с `info.xml` и `ModuleConfig.xml`; всё
  остальное — где угодно.
- `info.xml`: Name / Author / Version / Description / Website.
- `ModuleConfig.xml`: `<config>` → `moduleName`, `moduleDependencies`,
  `requiredInstallFiles`, `installSteps`, `conditionalFileInstalls`.
- `file`/`folder`: `source` (от корня пакета), `destination` (от корня установки),
  `alwaysInstall`, `priority`.
- `installStep` → `optionalFileGroups` → `group type="SelectExactlyOne|SelectAny|..."` →
  `plugin` (name, description, image, files, typeDescriptor).
- **Кода нет** — только XML; Vortex/MO2 показывают меню и раскладывают файлы. Vortex
  запоминает выбор и при повторной установке не спрашивает.
- FOMOD применим к играм с папкой модов (`/mods/` — Stardew, Witcher 3, Kenshi и др.);
  у нас как раз `mods/`.

**Вывод по каналам:**

- Nexus: чистый архив (только `.rpy`/`.opus`/шрифты/`README.txt`), установка вручную или
  Vortex. Никаких exe/cmd/ps1 и вложенных архивов.
- FOMOD — если хотим «одно-кликово» и выбор языка: тогда **один** архив со всеми
  голосами (~250 МБ) + XML. Отдельные voice-архивы и FOMOD плохо совместимы: Vortex
  ставит каждый как отдельный мод, пути пересекаются.
- Off-Nexus: `install.exe` + архивы рядом.

### Минимальный FOMOD для нашего мода

```xml
<config xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
        xsi:noNamespaceSchemaLocation="http://qconsulting.ca/fo3/ModConfig5.0.xsd">
  <moduleName>AI Voice Pack</moduleName>
  <requiredInstallFiles>
    <folder source="core" destination="mods/tssr-ai-voice-pack"/>
    <file source="environment.txt" destination="environment.txt"/>
  </requiredInstallFiles>
  <installSteps order="Explicit">
    <installStep name="Voice language">
      <optionalFileGroups order="Explicit">
        <group name="Language" type="SelectAny">
          <plugins order="Explicit">
            <plugin name="Russian">
              <description>Russian voice (full text)</description>
              <files><folder source="voice/ru" destination="mods/tssr-ai-voice-pack/ai_voice/ru"/></files>
              <typeDescriptor><type name="Recommended"/></typeDescriptor>
            </plugin>
            <!-- de, es, fr, it, ja, ko, pl, pt, zh -->
          </plugins>
        </group>
      </optionalFileGroups>
    </installStep>
  </installSteps>
</config>
```

Проверка: поставить в Vortex, выбрать языки, убедиться, что файлы легли в
`mods/tssr-ai-voice-pack/` и `environment.txt` в корень.

## Vortex E2E (2026-11-13)

- Собран game-extension `game-thesurvivalofsarahrose` (`%APPDATA%\Vortex\plugins`):
  `info.json`, `index.js`, `gameart.jpg`. `queryModPath: ""` (корень игры),
  `mergeMods: true` — тогда FOMOD-пути `mods/...` и `environment.txt` ложатся как надо.
- Vortex 2.10.1, hardlink deployment. Игра найдена (`found game: The Survival of Sarah Rose`).
- Установка main: FOMOD → `mods/tssr-ai-voice-pack/` + `environment.txt` в корне.
- Установка voice-ru: FOMOD → `mods/tssr-ai-voice-pack/ai_voice/ru/` (1397 opus).
- Удаление: «Remove» обоих модов + «Purge Mods» → папка мода и `environment.txt`
  удалены, игра чистая. E2E пройден.
- Готча: drag&drop архива в окно Vortex через CDP не срабатывает (Electron);
  рабочий путь — «Install From File» + нативный диалог (SendKeys пути).
