# Актуализация гайда в Steam + канал распространения (Nexus/релиз) + пересборка .7z

Статус: READY (2026-11-14). **В работу берём после доводки zh-перевода** (волновые
прогоны, по оценке владельца — несколько дней). Правка гайда сейчас дополнительно
заблокирована авто-сканом Steam (см. «Готчи»), так что начинать раньше нет смысла.

## Цель

Чтобы новый игрок из Steam видел актуальную инструкцию и живые ссылки: гайд ведёт
на лендинг и (когда откроется) на страницу мода в Nexus; раздача `.7z` соответствует
текущему состоянию (свежая версия, актуальный состав языков).

## Контекст

- Гайд: <https://steamcommunity.com/sharedfiles/filedetails/?id=3733106761> —
  «Русская локализация The Survival of Sarah Rose (русификатор v0.75)».
- Лендинг: <https://domovikx.github.io/The-Survival-of-Sarah-Rose-Mods/> — актуален
  (демо-плеер 11 языков, установка под `.7z`/Vortex, скриншоты).
- Nexus: страница мода (`game 11043`, `mod 1`) **ждёт апрува** — ссылку ставим, но
  предупреждаем, что она откроется после одобрения. Расширение Vortex опубликовано:
  <https://www.nexusmods.com/site/mods/2600>.
- Раздача: `dist/*.7z` (main + 11 голосов), исполняемых файлов внутри нет. Журнал —
  `docs/distribution-ledger.md`.

## Что устарело в гайде (проверено 2026-11-14)

- заголовок «русификатор v0.75» → игра 0.79;
- установка через `master.zip` + копирование папки `game` (старая раскладка; теперь
  `mods/tssr-ai-voice-pack/` + `environment.txt`, архивы `.7z`, FOMOD);
- «66 464 строки… переведены вручную» → 69 120 строк, машинный перевод с вычиткой;
- про AI-озвучку не сказано ни слова; нет ссылок на лендинг и Nexus;
- 4 скриншота протухли (preview id: `46015222`, `46015225`, `46015228`, `46015230`).

## Что сделать

1. **Дождаться, пока с гайда спадёт баннер** «ещё не проанализирована системой
   автоматической проверки контента» — до этого правки невозможны.
2. Обновить основную информацию: английский заголовок и краткое описание
   (в разделе «Готовый текст»), поле `language` → `english`.
3. Заменить содержимое раздела (`sectionid=8970476`) на английский текст, заголовок
   раздела — «What this is, demo status and installation».
4. Скриншоты — опционально (решение владельца: минорно, не блокирует). Если
   меняем — 9 кадров из `site/public/shots/` вместо 4 старых превью
   (`46015222`, `46015225`, `46015228`, `46015230`).
5. Пересобрать `.7z` после завершения zh (`npm run build:pack`, `7z t`, одна версия
   на выпуск), залить и записать в `docs/distribution-ledger.md`.
6. Если Nexus не откроют за разумный срок — временный канал: ветка/релиз GitHub с
   `dist/` (только `.7z`), ссылку в гайд с пометкой «временный канал».

## Как взаимодействовать со Steam (проверено на живом гайде)

**Чтение** — только из авторизованного Chrome (CDP :9333): гайд 18+ без сессии
отдаёт «You must be logged in», `webfetch` бесполезен.

- Основная информация: `.../editguide/?id=3733106761` → «Сохранить и продолжить» →
  `POST .../sharedfiles/finishguide` (`id`, `sessionid`, `title`, `description`,
  `language`, `tags[]`). Язык гайда — один `select` (сейчас `russian`).
- Разделы: `.../editguidesubsection/?id=…&sectionid=<sid>` → AJAX
  `POST .../sharedfiles/setguidesubsection` (`id`, `sectionid`, `sessionid`,
  `title`, `description`), ответ `{"success":1}`.
- Порядок разделов: `POST .../sharedfiles/setguidesubsectionorder`
  (`sub_sections[<sid>][sort_order]`); скриншотов —
  `POST .../sharedfiles/setpreviewsortorder` (`previews[<id>][sort_order]`).
- Картинки: форма `https://depot-ingest.discovery.steamserver.net/ugcupload/3`
  (hidden `wg`, `wg_hmac`, `realm`, `publishedfileid`, `appid=766`, `sessionid`,
  `token`, `cloudfilenameprefix`, `file`), file-input `input#files`, дальше
  глобальные `UploadPreviewFile()`, `StartPreviewFileUpload()`, `DoneFileUpload()`.
- Справка по форматированию: `GET /comment/Guide/formattinghelp?ajax=1` —
  поддерживаются `[h1][h2][h3][b][u][i][strike][spoiler][noparse][hr][url=…][list]
[olist][quote][code][table][tr][th][td]`, пункт списка — `[*]`.
  `[previewimg=…]` — тег редактора гайдов (вставляет загрузчик).

### Готчи

1. **Правки режет авто-скан.** Пока на странице висит баннер «ещё не
   проанализирована… временно скрыта», `setguidesubsection` отвечает
   `success:15 / Failed ban content check` на ЛЮБОЙ текст (проверено: один символ,
   несуществующий id). Триггер — любое сохранение (в т.ч. пустое): Steam
   переставляет гайд в очередь скана. → Ждать, пока баннер исчезнет; после
   сохранения не долбить повторно.
2. **Ссылки** — вероятная причина долгого скана (баннер прямо упоминает «ссылки на
   сайты для кражи информации»). В новой версии оставляем минимум: лендинг + Nexus
   (+ Vortex extension); мёртвую ссылку `master.zip` убираем.
3. **CDP-фильтр вкладок по подстроке**: `editguide` матчит и
   `editguidesubsection` — фильтровать с `/` (`editguide/?id=`) или полным URL.
4. «Сохранить» в редакторе раздела — это `<a href="javascript:
ValidateEditSubSectionForm()">`; синтетический `.click()` не срабатывает,
   вызывать функцию напрямую.

## Готовый текст (английский — решение владельца 2026-11-14)

Решение: гайд делаем **на английском**, язык гайда в поле `language` ставим
`english`, а все остальные ссылки (Nexus, Vortex-расширение, языки) уводим на
лендинг — дальше лендинг сам перенаправляет куда надо. В гайде остаётся ОДНА
ссылка — наш лендинг. Это снимает и вопрос «какой язык у мультиязычного
руководства», и риск долгого скана из-за внешних ссылок.

- **Title:** The Survival of Sarah Rose — AI Voice Pack + 11 Languages (Install)
- **Краткое описание:** короткая версия + голый URL лендинга (Steam показывает
  его ссылкой).
- **Раздел** (`sectionid=8970476`), заголовок «What this is, demo status and
  installation»:

```bbcode
[h1]What this is[/h1]

Unofficial fan patch for The Survival of Sarah Rose: AI voice acting (voice cloning) plus text translations. The game must be purchased on Steam. The patch is free under CC BY-NC 4.0 and is for adults only (18+).

[h1]What is complete and what is demo[/h1]

[list]
[*][b]Text:[/b] Russian — complete translation of the whole game (69,120 lines). The other 10 languages are a demo: the intro up to the first choice.
[*][b]Voice:[/b] demo in all 11 languages — 1,195 voiced lines per language (Russian: 1,397). A full voice run is planned and will arrive as updates.
[*]The in-game mod menu shows the status per language (text and voice separately) and marks every language button with a note sign when its voice pack is installed.
[/list]

[h1]Installation[/h1]

[b]With Vortex (recommended)[/b]

[list]
[*]Install the game extension once — the link is on the patch website
[*]In Vortex: Mods → "Install from file" → pick [b]main.7z[/b], then the [b]voice-language.7z[/b] packs you want
[*]Deploy: files go to mods/tssr-ai-voice-pack/, no game files are modified
[/list]

[b]Manual[/b]

[list]
[*]Unpack [b]main.7z[/b] into the game folder (the one with TheSurvivalofSarahRose.exe): you get mods/tssr-ai-voice-pack/ and environment.txt
[*]Unpack any [b]voice-language.7z[/b] packs into the same folder
[*]Launch the game, open the mod menu (badge in the top-right) and pick your language
[/list]

[b]Update[/b] — install the new archives over the old ones. [b]Uninstall[/b] — delete mods/tssr-ai-voice-pack and environment.txt. The archives contain no executables, only .7z.

[h1]Features[/h1]

[list]
[*]75+ cloned voices: characters and narration
[*]Per-line emotions matched to the scene
[*]Opus 24 kbps — about 17 MB per language pack
[*]Language switcher inside the game menu (11 languages)
[*]Demo/completeness status and voice-pack indicator in the menu
[*]A line without a voice file plays silently — no crashes
[*]Atomic mod folder: no original game files are touched
[/list]

[h1]Links[/h1]

Patch website — demo player in 11 languages, screenshots, FAQ, downloads:
[url=https://domovikx.github.io/The-Survival-of-Sarah-Rose-Mods/]https://domovikx.github.io/The-Survival-of-Sarah-Rose-Mods/[/url]

[h1]FAQ[/h1]

[b]Is this an official translation?[/b]
No, it is an unofficial fan work, not affiliated with the developers or publishers.

[b]Why is the voice called a demo?[/b]
The intro up to the first choice is voiced — 1,195 lines per language. A full run is planned; the status is visible in the mod menu.

[b]Are the voices real?[/b]
All voices are AI-generated (voice cloning); translations are machine-aided and human-reviewed.

[b]Is it free?[/b]
Yes, CC BY-NC 4.0: free to share and adapt with attribution, non-commercial only.

[b]How can I help?[/b]
Downloads and endorsements help other players find the patch; bugs and suggestions — via the patch website.
```

Файл для вставки: `tmp/steam_guide_paste_en.txt` (4 блока: заголовок, краткое
описание, заголовок раздела, текст раздела).

## Скриншоты

**Решение владельца (2026-11-14):** расхождение только в кадре меню мода, и это
минорный момент — гайд из-за скринов не держим, переснимаем опционально позже или
вообще не переснимаем (существенного в UI не поменялось).

**Что всё-таки расходится:** 9 картинок в `site/public/shots/nexus_*.jpg` сняты
2026-11-14 в 12:25, ДО правок UI. На них:

- `nexus_01` — меню мода **без** индикаторов озвучки (`♪`) и без строк статуса
  «Текст/Озвучка»;
- `nexus_05` — нижняя панель с багой **«Сохранить · Сохранить»** (исправлено:
  теперь `Б.сохр.` / `Б.загр.`).
  Новые картинки нужны только если решим показать обновлённое меню; на смысл гайда
  это не влияет.

**Как снимать:** драйвер `patches/ai-voice-pack/tools/generate/scripts/shots_capture.ps1`
(харнесс `zz_capture.rpy`, в игру пишется только `mods/_tssr-test/`, снимки — в
`tmp/shots/`), затем `shots_for_site.mts` раскладывает в `site/public/shots/`.

**Набор для гайда (9 шт.):**

1. Главное меню с бейджем языка (RUS) — точка входа.
2. Меню мода, верх: язык + `♪` на кнопках + легенда + статус «Текст/Озвучка».
3. Меню мода, низ: три ручки кеглей (Реплики / Имена / Интерфейс) + «ОК».
4. Настройки/языки в игре (11 языков в порядке приоритета).
5. Диалог с озвучкой (RU) — нижняя панель уже с `Б.сохр./Б.загр.`.
6. Выбор реплик (choice) — крупный текст.
7. CG-кадр 1 (объятия с репликой).
8. CG-кадр 2 (король в дверях + наррация).
9. Панорама столицы + наррация.

**Проверка перед заливкой:** на снимке №2 видны `♪` и «демо»-статус; на №5 нет
двух одинаковых подписей.

**Старые превью в гайде удалить:** `46015222`, `46015225`, `46015228`, `46015230`.

## Приёмка

- С баннера гайда снят статус «не проанализирована», правки проходят (`success:1`).
- Заголовок/описание/раздел совпадают с текстом выше; `v0.75` и `master.zip` не
  упоминаются.
- 9 актуальных скриншотов стоят вместо 4 старых.
- `dist/*.7z` собраны из актуального состояния, `7z t` чистый, строка в
  `docs/distribution-ledger.md` соответствует залитому.
- Ссылка на Nexus открывается в инкогнито (или стоит временная с пометкой).

## Вне рамок

- Правки описания на Nexus (обновлено 2026-11-14).
- Повторная озвучка демо-скоупа и полный прогон голоса.
- Продвижение в Reddit/DTF/Telegram — `tasks/2026-10-15-external-promotion.md`.

## Открытые решения

- Nexus как основной канал vs GitHub-релиз (решить после апрува).
- Гайд на английском как второй (для EN-аудитории) — решение отложено: сначала
  приводим в порядок русский.
