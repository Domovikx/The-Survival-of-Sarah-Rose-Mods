/**
 * cdp — управление уже запущенным Chrome через DevTools Protocol (без Playwright).
 *
 * Зачем: когда браузерный MCP недоступен/отвалился, а вкладки пользователя открыты
 * и залогинены. Скрипт цепляется к живому Chrome по порту (по умолчанию 9333).
 *
 * Команды:
 *   node cdp.mts tabs [--filter <подстрока url>]
 *   node cdp.mts eval <файл.js> [--tab <подстрока url>]
 *   node cdp.mts eval --expr "выражение" [--tab ...]
 *   node cdp.mts shot <out.png> [--tab ...] [--full]
 *   node cdp.mts nav <url> [--tab ...]
 *   node cdp.mts type "<текст>" [--tab ...]
 *   node cdp.mts click "<css-селектор>" [--tab ...]
 *   node cdp.mts dialog [--dismiss]          # закрыть JS-диалог (beforeunload и пр.)
 *
 * Общее: --port 9333
 */
import { readFileSync, writeFileSync } from "node:fs";

type Target = { id: string; type: string; url: string; title: string; webSocketDebuggerUrl: string };

const argv = process.argv.slice(2);

function flagOf(name: string): string | undefined {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : undefined;
}

function positionals(): string[] {
  const out: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith("--")) {
      const needsValue = !["full"].includes(argv[i].slice(2));
      if (needsValue) i++;
      continue;
    }
    out.push(argv[i]);
  }
  return out;
}

const pos = positionals();
const cmd = pos[0] ?? "tabs";
const port = flagOf("port") ?? "9333";
const tabFilter = flagOf("tab");

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

async function listTabs(): Promise<Target[]> {
  const res = await fetch(`http://127.0.0.1:${port}/json/list`);
  return (await res.json()) as Target[];
}

function pickTab(list: Target[], filter?: string): Target {
  const pages = list.filter((t) => t.type === "page");
  const hit = filter ? pages.find((t) => t.url.includes(filter)) : pages[0];
  if (!hit)
    throw new Error(
      `вкладка не найдена (filter=${filter ?? "—"}); есть:\n${pages.map((p) => "  " + p.url).join("\n")}`,
    );
  return hit;
}

class Session {
  ws: WebSocket;
  seq = 0;
  pending: Map<number, (v: unknown) => void> = new Map();

  constructor(url: string) {
    this.ws = new WebSocket(url);
  }

  open(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.ws.onopen = () => resolve();
      this.ws.onerror = () => reject(new Error("не удалось подключиться по CDP"));
      this.ws.onmessage = (e: MessageEvent<string>) => {
        const msg = JSON.parse(e.data) as { id?: number; result?: unknown };
        if (msg.id !== undefined && this.pending.has(msg.id)) {
          const fn = this.pending.get(msg.id);
          this.pending.delete(msg.id);
          fn?.(msg.result);
        }
      };
    });
  }

  send<T = unknown>(method: string, params: Record<string, unknown> = {}, timeoutMs = 60_000): Promise<T> {
    const id = ++this.seq;
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`${method}: таймаут ${timeoutMs} мс`));
      }, timeoutMs);
      this.pending.set(id, (v) => {
        clearTimeout(timer);
        resolve(v as T);
      });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  async eval(code: string, timeoutMs = 120_000): Promise<unknown> {
    const res = await this.send<{
      result?: { value?: unknown };
      exceptionDetails?: { exception?: { description?: string } };
    }>(
      "Runtime.evaluate",
      { expression: `(async () => { ${code} })()`, awaitPromise: true, returnByValue: true, userGesture: true },
      timeoutMs,
    );
    if (res.exceptionDetails) throw new Error(res.exceptionDetails.exception?.description ?? "ошибка в eval");
    return res.result?.value;
  }

  close(): void {
    this.ws.close();
  }
}

async function main(): Promise<void> {
  const list = await listTabs();

  if (cmd === "tabs") {
    const filter = flagOf("filter");
    const pages = list.filter((t) => t.type === "page" && (!filter || t.url.includes(filter)));
    for (const t of pages) console.log(`${t.id.slice(0, 8)}  ${t.url}\n          ${t.title.slice(0, 90)}`);
    return;
  }

  const target = pickTab(list, tabFilter);
  const session = new Session(target.webSocketDebuggerUrl);
  await session.open();
  // Page.enable подавляет нативные beforeunload-подтверждения Chrome в этой сессии
  // (иначе «Перезагрузить сайт?» вешает рендерер и любой следующий eval таймаутит).
  await session.send("Page.enable").catch(() => undefined);

  switch (cmd) {
    case "eval": {
      const expr = flagOf("expr");
      const code = expr ?? readFileSync(pos[1] ?? "", "utf-8");
      console.log(JSON.stringify((await session.eval(code)) ?? null, null, 1));
      break;
    }
    case "shot": {
      const out = pos[1] ?? "shot.png";
      const params: Record<string, unknown> = { format: "png" };
      if (argv.includes("--full")) {
        const m = await session.send<{ cssContentSize?: { width: number; height: number } }>("Page.getLayoutMetrics");
        if (m.cssContentSize) {
          params.clip = { x: 0, y: 0, width: m.cssContentSize.width, height: m.cssContentSize.height, scale: 1 };
          params.captureBeyondViewport = true;
        }
      }
      const shot = await session.send<{ data?: string }>("Page.captureScreenshot", params);
      const buf = Buffer.from(shot.data ?? "", "base64");
      writeFileSync(out, buf);
      console.log(`${out} — ${Math.round(buf.length / 1024)} КБ`);
      break;
    }
    case "nav": {
      const url = pos[1];
      if (!url) throw new Error("нужен URL");
      await session.send("Page.navigate", { url });
      await sleep(4000);
      console.log("перешли:", (await session.eval("return location.href;")) as string);
      break;
    }
    case "type": {
      const text = pos[1] ?? "";
      await session.send("Input.insertText", { text });
      console.log("введено символов:", text.length);
      break;
    }
    case "open": {
      // Новая вкладка в том же профиле: обход зависшей (заблокированной диалогом) вкладки.
      const url = pos[1] ?? "about:blank";
      const created = await session.send<{ targetId?: string }>("Target.createTarget", { url });
      await sleep(1500);
      console.log("новая вкладка:", created.targetId ?? "?", "→", url);
      break;
    }
    case "dialog": {
      const accept = !argv.includes("--dismiss");
      await session.send("Page.handleJavaScriptDialog", { accept });
      await sleep(500);
      console.log(accept ? "диалог принят" : "диалог отклонён");
      break;
    }
    case "click": {
      const sel = pos[1];
      if (!sel) throw new Error("нужен css-селектор");
      const out = await session.eval(
        `const el = document.querySelector(${JSON.stringify(sel)}); if (!el) return 'не найден'; el.scrollIntoView({ block: 'center' }); el.click(); return 'clicked';`,
      );
      console.log(out);
      break;
    }
    default:
      console.error(`неизвестная команда: ${cmd}`);
      process.exitCode = 1;
  }

  session.close();
}

await main();
