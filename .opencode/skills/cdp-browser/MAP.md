# MAP — cdp-browser (проверено 2026-11-13/14 на Nexus Mods)

## Канал

- Chrome CDP: `--remote-debugging-port=9333`; `GET /json/list` отдаёт таргеты,
  у каждого `webSocketDebuggerUrl` — к нему и подключаемся по WS.
- Node ≥22 умеет `WebSocket` глобально — внешние пакеты не нужны.
- Скриншоты: `Page.captureScreenshot`; полная страница —
  `Page.getLayoutMetrics` → `cssContentSize` → `clip` + `captureBeyondViewport`.

## Готчи

- ⚠️ **Cloudflare challenge**: navigator на nexusmods иногда отдаёт страницу
  «Один момент… / Выполнение проверки безопасности» (HTTP 403). Решение: подождать
  8–12 с, при необходимости один `location.reload()`; повторные долбёжки ухудшают.
- ⚠️ **headlessui-диалоги дублируются**: в DOM бывает 2–3 `[role=dialog]`,
  часть внутри `[inert]`. Синтетические клики в них не срабатывают — брать
  последний **не-inert**: `[...dialogs].filter(d => !d.closest('[inert]')).pop()`.
- ⚠️ **Нативный file chooser**: `input[type=file]` есть не всегда; иногда его
  создаёт диалог по клику «Add file». Если input есть — проще
  `input.files` через `DataTransfer` нельзя (файлы с диска не прочитать),
  поэтому нужен либо Playwright `filechooser`, либо клик по input в UI.
- ⚠️ **SCEditor (BBCode-редактор Nexus)**: `textarea` внутри `.bbcode-editor`
  СКРЫТА, текст живёт в `iframe` (WYSIWYG). Установка `textarea.value` +
  `input`/`change` **не сохраняется** (React-состояние не обновляется, после
  reload пусто). Рабочий путь:
  1. `iframe.contentDocument` → `body.focus()` → `execCommand('selectAll')` →
     `execCommand('insertHTML', false, html)`;
  2. `textarea.value = iframeBody.innerText` нативным сеттером + события
     `input`/`change`;
  3. клик `Save`;
  4. **проверить после `Page.reload`** — только это доказывает запись.
     После рестарта скрипта сбрасывается: делать всё в одном `eval`.
- ⚠️ **`Input.insertText`** вставляет только в сфокусированный элемент;
  на скрытую textarea SCEditor не действует (проверено: `len` остался 0).
- ⚠️ **React-инпуты** (не SCEditor): работают нативный сеттер
  `HTMLInputElement.prototype.value` + `input`/`change` — проверять после reload.
- ⚠️ **Кнопка может быть реально `disabled`** (атрибут + класс
  `nxm-button-disabled`): `el.disabled = false; el.click()` ничего не даёт —
  не тратить время, искать причину в обязательных полях/серверном гейте.
- ⚠️ **Node 24 type-stripping не поддерживает `constructor(private x)`**
  (parameter properties) — писать `x: string; constructor(x: string) { this.x = x; }`,
  иначе `SyntaxError` при запуске `.mts`.

## Сценарий «форма Nexus» (проверенный порядок)

1. `tabs` → найти вкладку по подстроке (`edit/general`).
2. Прочитать состояние: счётчик `(\d+) Required field(s)? left`, кнопка `Publish`,
   значения полей.
3. Заполнять поля (см. готчи), каждый раз проверяя `Save` + перезагрузкой.
4. Скриншот `shot` — быстрый способ убедиться глазами, что всё на месте.

- ⚠️ **Нативный beforeunload-диалог Chrome блокирует рендерер**: `location.reload()`
  из `eval` поднимает окошко Chrome «Перезагрузить сайт?» — и после этого ЛЮБОЙ
  следующий `eval`/`Runtime.evaluate` висит до таймаута, потому что main thread
  занят. `Page.handleJavaScriptDialog {accept}` его НЕ закрывает (это не JS-диалог,
  а UI браузера). Решения:
  - не вызывать `location.reload()` из скрипта; для перезагрузки — CDP `Page.reload`
    (перед этим лучше сохранить форму, чтобы не было beforeunload);
  - если окошко уже висит — попросить человека нажать «Отмена»/«Перезагрузить»
    (CDP тут бессилен);
  - проверять сохранение лучше не перезагрузкой, а повторным чтением данных
    (GraphQL/API), если для сущности он есть.

## Nexus: заголовки картинок мода (проверено 2026-11-14)

- Заголовок картинки («No title») задаётся **только в диалоге загрузки**, который
  открывается штатным путём (`Add image(s)` → нативный file chooser → выбран файл).
- Прямая заливка в `input[type=file]` через CDP (`DOM.setFileInputFiles`) файлы
  загружает, но **метаданные пропускает**: картинка появляется с «No title».
- Постфактум отредактировать нельзя: на `edit/media` у картинки только
  `Delete image`; на публичной вкладке `?tab=images` — только лайтбокс;
  в `users/myaccount?tab=images` неопубликованного мода пусто; в API v3
  эндпоинта для картинок нет.
- Вывод: нужен заголовок — заливать через нативный chooser (тогда открывается
  форма с Title/Description), а не через `DOM.setFileInputFiles`.
