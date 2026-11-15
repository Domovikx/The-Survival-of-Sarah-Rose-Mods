/**
 * translate_queue.mts — ОЧЕРЕДЬ ПЕРЕВОДОВ: языки по приоритету, с возобновлением.
 *
 * Зачем: 8 языков × ~67 тыс. строк = ~537 тыс. строк модельного времени (~4 суток
 * непрерывно). Прогон должен переживать выключение света и ребут: состояние не
 * хранится в памяти — источник истины po (пустая строка = не переведено), поэтому
 * после любого сбоя очередь продолжает с того же места.
 *
 * Что делает на каждый язык:
 *   1) гарантирует бэкенд (headless llama-server на :8081; поднимает, если лежит);
 *   2) «пасс имён»: сначала канон имён (msgctxt speaker-name) — от него зависит
 *      единообразие имён в остальном тексте;
 *   3) основной прогон (translate_run), повторами до нуля пустых строк;
 *   4) пишет прогресс в tmp/translate_queue.json.
 *
 * Запуск (из корня репы):
 *   node .opencode/skills/translate/translate_queue.mts            # все незавершённые по приоритету
 *   node .opencode/skills/translate/translate_queue.mts es de      # только эти
 *   node .opencode/skills/translate/translate_queue.mts es --limit 40   # смоук-тест
 */
import { spawn, spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { parsePo } from "../renpy-po/po_core.mts";

const PO_DIR = join("patches", "ai-voice-pack", "po");
const RUNNER = join(".opencode", "skills", "translate", "translate_run.mts");
const STATE = join("tmp", "translate_queue.json");
const LOG = join("tmp", "translate_queue.log");
const LLAMA = join(
  process.env.USERPROFILE ?? "",
  ".lmstudio",
  "extensions",
  "backends",
  "llama.cpp-win-x86_64-nvidia-cuda-avx2-2.54.0",
  "llama-server.exe",
);
const MODEL = join(
  process.env.USERPROFILE ?? "",
  ".lmstudio",
  "models",
  "IndexTeam",
  "Index-Translate-9B-GGUF",
  "Index-Translate-9B.Q4_K_S.gguf",
);
const PORT = 8081;
const URL = `http://127.0.0.1:${PORT}`;

const args = process.argv.slice(2);
const limitAt = args.indexOf("--limit");
const LIMIT = limitAt >= 0 ? Number(args[limitAt + 1]) : 0;
const only = args.filter((a, i) => !a.startsWith("--") && (limitAt < 0 || i !== limitAt + 1));

const log = (message: string): void => {
  const line = `${new Date().toISOString()} ${message}`;
  console.log(line);
  try {
    writeFileSync(LOG, `${line}\n`, { encoding: "utf-8", flag: "a" });
  } catch {
    /* лог не критичен */
  }
};

const progress = (lang: string): { filled: number; total: number; empty: number } => {
  const text = readFileSync(join(PO_DIR, `${lang}.po`), "utf-8").replace(/\r\n/g, "\n");
  const entries = parsePo(text).filter((e) => e.msgid);
  const filled = entries.filter((e) => e.msgstr.trim()).length;
  return { filled, total: entries.length, empty: entries.length - filled };
};

const backendUp = async (): Promise<boolean> => {
  try {
    const r = await fetch(`${URL}/v1/models`, { signal: AbortSignal.timeout(3000) });
    return r.ok;
  } catch {
    return false;
  }
};

/** Поднимает llama-server и ждёт, пока модель загрузится (до 10 минут). */
const ensureBackend = async (): Promise<void> => {
  if (await backendUp()) return;
  if (!existsSync(LLAMA) || !existsSync(MODEL)) throw new Error(`нет llama-server или модели: ${LLAMA}`);
  log("бэкенд лежит — запускаю llama-server");
  const child = spawn(
    LLAMA,
    [
      "-m",
      MODEL,
      "-c",
      "8192",
      "-np",
      "4",
      "-ngl",
      "99",
      "--host",
      "127.0.0.1",
      "--port",
      String(PORT),
      "--alias",
      "index-translate-9b",
      "--no-webui",
    ],
    { detached: true, stdio: "ignore" },
  );
  child.unref();
  for (let i = 0; i < 120; i++) {
    await new Promise((r) => setTimeout(r, 5000));
    if (await backendUp()) {
      log("бэкенд готов");
      return;
    }
  }
  throw new Error("llama-server не поднялся за 10 минут");
};

const runOnce = (lang: string, extra: string[] = []): number => {
  const env = {
    ...process.env,
    TSSR_LLM_URL: URL,
    TSSR_LLM_MODEL: "index-translate-9b",
    TSSR_RETRANS_NO_JUDGE: "1",
  };
  const r = spawnSync(process.execPath, [RUNNER, lang, ...extra], { stdio: "inherit", env });
  return r.status ?? 1;
};

const namesPass = (lang: string): void => {
  const entries = parsePo(readFileSync(join(PO_DIR, `${lang}.po`), "utf-8").replace(/\r\n/g, "\n")).filter(
    (e) => e.msgid,
  );
  const ids = entries.map((e, i) => (e.msgctxt === "speaker-name" && !e.msgstr.trim() ? i : -1)).filter((i) => i >= 0);
  if (!ids.length) return;
  const list = join("tmp", `names_${lang}.txt`);
  writeFileSync(list, ids.map((i) => `${i}\n`).join(""), "utf-8");
  log(`${lang}: пасс имён — ${ids.length} строк speaker-name`);
  runOnce(lang, ["--retrans", list]);
};

const main = async (): Promise<void> => {
  const order = JSON.parse(readFileSync(join("config", "language-priority.json"), "utf-8")).languages as Array<{
    code: string;
  }>;
  const done = new Set(["en"]);
  const targets = (only.length ? only : order.map((l) => l.code).filter((c) => !done.has(c))).filter((lang) => {
    const { empty } = progress(lang);
    return empty > 0;
  });

  log(`очередь: ${targets.join(" → ") || "всё переведено"}${LIMIT ? ` (limit ${LIMIT})` : ""}`);
  for (const lang of targets) {
    let passes = 0;
    for (;;) {
      await ensureBackend();
      const before = progress(lang);
      writeFileSync(
        STATE,
        `${JSON.stringify({ lang, empty: before.empty, filled: before.filled, total: before.total, at: new Date().toISOString() }, null, 2)}\n`,
        "utf-8",
      );
      if (!before.empty) break;
      if (passes === 0) namesPass(lang);
      const t0 = Date.now();
      const status = runOnce(lang, LIMIT ? ["--limit", String(LIMIT)] : []);
      const after = progress(lang);
      const rate = ((after.filled - before.filled) / Math.max(1, (Date.now() - t0) / 1000)).toFixed(2);
      log(
        `${lang}: пасс ${passes + 1} — переведено ${after.filled}/${after.total} (пусто ${after.empty}), ` +
          `${rate} стр/с, код ${status}`,
      );
      passes++;
      if (LIMIT) break;
      if (!after.empty) break;
      if (after.filled === before.filled) {
        log(`${lang}: пасс не дал прогресса — пауза 60 с и ещё попытка`);
        await new Promise((r) => setTimeout(r, 60_000));
      }
      if (passes >= 30) {
        log(`${lang}: 30 пассов — оставляю остаток на следующий запуск`);
        break;
      }
    }
  }
  log("очередь завершена");
};

await main();
