# cdp-browser — управление живым Chrome через DevTools Protocol

Когда использовать: браузерный MCP (Playwright) недоступен — отвалился, отключён,
или нужно работать **в уже открытых вкладках пользователя** с его сессией
(логины, черновики форм). Не требует установки зависимостей: только node + Chrome,
запущенный с `--remote-debugging-port`.

## Запуск Chrome с портом

```bash
"/c/Program Files/Google/Chrome/Application/chrome.exe" \
  --remote-debugging-port=9333 \
  --user-data-dir="C:/Users/Domo/.config/opencode/chrome-profile" \
  --no-first-run --no-default-browser-check about:blank
```

Порт занят — значит уже запущен (проверить: `curl -s http://127.0.0.1:9333/json/version`).

## Команды

```bash
node .opencode/skills/cdp-browser/cdp.mts tabs                      # список вкладок
node .opencode/skills/cdp-browser/cdp.mts eval script.js --tab nexus # выполнить JS
node .opencode/skills/cdp-browser/cdp.mts eval --expr "return document.title;"
node .opencode/skills/cdp-browser/cdp.mts shot tmp/page.png --tab nexus [--full]
node .opencode/skills/cdp-browser/cdp.mts nav https://example.com --tab nexus
node .opencode/skills/cdp-browser/cdp.mts type "текст"               # в фокус
node .opencode/skills/cdp-browser/cdp.mts click "css[selector]"
```

- `--tab <подстрока url>` — какая вкладка (по умолчанию первая).
- `eval` принимает файл со скриптом: внутри доступен `await`, надо вернуть значение
  (`return {...}`), результат печатается как JSON.
- `--port 9333` — если порт другой.

## Правила

- Не уводить пользователя с его вкладок без нужды: `nav` — только когда это
  осознанный шаг сценария.
- Пароли/2FA/капчи — не автоматизировать; если появилась Cloudflare-проверка,
  подождать (см. MAP) и не долбить перезагрузками.
- Всё, что «сохраняет» данные, проверять **после перезагрузки страницы**:
  синтетическая установка значения не всегда доходит до React (см. MAP).

## Файлы

- `cdp.mts` — CLI (WS к `webSocketDebuggerUrl`, `Runtime.evaluate`,
  `Input.insertText`, `Page.captureScreenshot`).
- `MAP.md` — грабли: Cloudflare, headlessui-диалоги, SCEditor, React-инпуты.
