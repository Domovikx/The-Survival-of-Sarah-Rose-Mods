/**
 * translate_ctl.mts — ПУЛЬТ ПЕРЕВОДА: модель, прогон, сброс, прогресс.
 *
 * Зачем отдельный тул (инцидент 2026-11-15): перевод гоняли «как получится» —
 * раннер брал бэкенд из пульта (`scripts/llm_backend.mts`), пульт стоял на
 * Strata, и 94 % китайского перевела ОБЩАЯ Qwen3.6-35B вместо переводческой
 * Index-Translate-9B. Теперь модель перевода закреплена кодом
 * (`translate_backend.mts`) и проверяется в раннере (STOP на чужой модели), а
 * этот пульт поднимает правильную модель с правильными параметрами.
 *
 * Команды (из корня репы):
 *   node .opencode/skills/translate/translate_ctl.mts status
 *   node .opencode/skills/translate/translate_ctl.mts up        # LM Studio + index-translate-9b
 *   node .opencode/skills/translate/translate_ctl.mts run zh    # прогон в фоне (resumable)
 *   node .opencode/skills/translate/translate_ctl.mts reset zh --yes   # чистое поле под язык
 *   node .opencode/skills/translate/translate_ctl.mts stop zh
 *
 * Конфиги модели (журнал tasks/2026-11-03-index-translate-9b.md):
 *   `lms load index-translate-9b -c 8192 --parallel 4 --gpu max` (~8.9 ГБ VRAM);
 *   temp 0 + лестница повторов 0.7/1.0 и промпт {"scene","tr"} — в самом раннере.
 */
import { execFileSync, spawn, spawnSync } from "node:child_process";
import { existsSync, openSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { parsePo, renderPo, writePoAtomic } from "../renpy-po/po_core.mts";
import { poHeaderLines } from "../renpy-po/po_update.mts";
import { TRANSLATE_BACKEND } from "./translate_backend.mts";

const LANG_RE = /^(ru|de|es|fr|it|pl|pt|ja|ko|zh)$/;
const PO = (lang: string): string => join("patches", "ai-voice-pack", "po", `${lang}.po`);
const DONE = (lang: string): string => join("tmp", `translate_${lang}.done`);
const LOG = (lang: string): string => join("tmp", `translate_${lang}.run.log`);
const PID = (lang: string): string => join("tmp", `translate_${lang}.pid`);
const RUNNER = join(".opencode", "skills", "translate", "translate_run.mts");
const LMS = join(process.env.USERPROFILE ?? "", ".lmstudio", "bin", "lms.exe");

const die = (message: string): never => {
  console.error(message);
  process.exit(1);
};

/** Вывод команды целиком: lms пишет часть сообщений в stderr, а не в stdout. */
const run = (bin: string, args: string[]): string => {
  const r = spawnSync(bin, args, { encoding: "utf-8", timeout: 30 * 60_000 });
  return `${r.stdout ?? ""}${r.stderr ?? ""}`.trim();
};

/**
 * Модель ЗАГРУЖЕНА в память? Проверяем `lms ps`, а не `/v1/models`: эндпоинт
 * отдаёт все СКАЧАННЫЕ модели (проверено 2026-11-15 — «загружена» было ложью).
 */
const lmsLoaded = (): boolean => /index-translate-9b\s+index-translate-9b/m.test(run(LMS, ["ps"]));

/** Сервер LM Studio отвечает? (`lms load` иногда оставляет сервер выключенным.) */
const lmsServerUp = (): boolean => /running/i.test(run(LMS, ["server", "status"]));

const progress = (lang: string): { filled: number; total: number } => {
  const text = readFileSync(PO(lang), "utf-8").replace(/\r\n/g, "\n");
  const entries = parsePo(text).filter((e) => e.msgid);
  return { filled: entries.filter((e) => e.msgstr.trim()).length, total: entries.length };
};

const alive = (pid: number): boolean => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};

const runningPid = (lang: string): number | null => {
  const file = PID(lang);
  if (!existsSync(file)) return null;
  const pid = Number(readFileSync(file, "utf-8").trim());
  return pid && alive(pid) ? pid : null;
};

const main = async (): Promise<void> => {
  const [cmd, langArg] = process.argv.slice(2);
  const lang = langArg ?? "";
  const args = process.argv.slice(2);

  if (!cmd || cmd === "status") {
    console.log(`бэкенд перевода: ${TRANSLATE_BACKEND.url} | ${TRANSLATE_BACKEND.model}`);
    console.log(
      `LM Studio: сервер ${lmsServerUp() ? "UP" : "DOWN"} | модель ${lmsLoaded() ? "загружена" : "НЕ загружена — нужен up"}`,
    );
    const langs = args.filter((a) => LANG_RE.test(a));
    for (const l of langs.length ? langs : ["zh"]) {
      const { filled, total } = progress(l);
      const pid = runningPid(l);
      console.log(
        `${l}: ${filled}/${total} (${((filled / total) * 100).toFixed(1)}%)${pid ? ` | идёт прогон PID ${pid}` : ""}`,
      );
    }
    return;
  }

  if (cmd === "up") {
    if (!existsSync(LMS)) die(`не нашёл lms.exe: ${LMS}`);
    if (!lmsServerUp()) console.log(run(LMS, ["server", "start"]) || "server start: ok");
    else console.log("сервер LM Studio уже работает");
    if (lmsLoaded()) {
      console.log(`модель ${TRANSLATE_BACKEND.model} уже загружена (8192 / parallel 4)`);
    } else {
      console.log("загружаю index-translate-9b (-c 8192 --parallel 4 --gpu max)…");
      console.log(run(LMS, ["load", TRANSLATE_BACKEND.model, "-c", "8192", "--parallel", "4", "--gpu", "max"]));
      // `lms load` умеет поднять приложение и оставить сервер выключенным.
      if (!lmsServerUp()) console.log(run(LMS, ["server", "start"]) || "server start: ok");
    }
    if (!lmsLoaded() || !lmsServerUp()) die("модель/сервер не поднялись — смотри вывод lms");
    console.log(`готово: ${TRANSLATE_BACKEND.url} | ${TRANSLATE_BACKEND.model}`);
    return;
  }

  if (cmd === "run") {
    if (!LANG_RE.test(lang)) die("укажи язык: ru|de|es|fr|it|pl|pt|ja|ko|zh");
    if (runningPid(lang)) die(`${lang}: прогон уже идёт (PID ${runningPid(lang)})`);
    if (!lmsServerUp() || !lmsLoaded()) {
      die(
        `LM Studio: сервер ${lmsServerUp() ? "up" : "DOWN"}, модель ${lmsLoaded() ? "загружена" : "НЕ загружена"}. Сначала: translate_ctl.mts up`,
      );
    }
    const fd = openSync(LOG(lang), "a");
    const child = spawn(process.execPath, [RUNNER, lang], {
      detached: true,
      stdio: ["ignore", fd, fd],
      env: {
        ...process.env,
        TSSR_LLM_URL: TRANSLATE_BACKEND.url,
        TSSR_LLM_MODEL: TRANSLATE_BACKEND.model,
      },
    });
    child.unref();
    writeFileSync(PID(lang), `${child.pid}\n`, "utf-8");
    const { filled, total } = progress(lang);
    console.log(`прогон ${lang} запущен (PID ${child.pid}) | ${filled}/${total} | лог: ${LOG(lang)}`);
    return;
  }

  if (cmd === "stop") {
    if (!LANG_RE.test(lang)) die("укажи язык");
    const pid = runningPid(lang) ?? 0;
    if (pid === 0) die(`${lang}: прогон не найден`);
    try {
      process.kill(pid);
    } catch {
      execFileSync("taskkill", ["/PID", String(pid), "/T", "/F"]);
    }
    rmSync(PID(lang), { force: true });
    console.log(`${lang}: остановлен (PID ${pid}), po дописан раннером`);
    return;
  }

  if (cmd === "reset") {
    if (!LANG_RE.test(lang)) die("укажи язык");
    if (!args.includes("--yes")) die(`reset ${lang} обнулит ВСЕ переводы в po. Повтори с --yes`);
    if (runningPid(lang)) die(`${lang}: сначала stop — прогон идёт`);
    const text = readFileSync(PO(lang), "utf-8").replace(/\r\n/g, "\n");
    const backup = join("tmp", `${lang}.po.bak`);
    writeFileSync(backup, text, "utf-8");
    const cleared = parsePo(text).map((e) => ({ ...e, msgstr: "" }));
    writePoAtomic(PO(lang), renderPo(cleared, poHeaderLines(text)));
    rmSync(DONE(lang), { force: true });
    console.log(`reset ${lang}: переводы очищены (резерв: ${backup}), кэш done удалён`);
    return;
  }

  die(`неизвестная команда «${cmd}». Есть: status | up | run <lang> | stop <lang> | reset <lang> --yes`);
};

await main();
