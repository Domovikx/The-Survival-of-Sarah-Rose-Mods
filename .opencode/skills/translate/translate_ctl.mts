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
const REVIEW = join(".opencode", "skills", "translate", "translate_review.mts");
const JUDGE = join(".opencode", "skills", "translate", "translate_judge.mts");
const REPAIR = (lang: string): string => join("tmp", `repair_${lang}.txt`);
const FLAGS = (lang: string): string => join("tmp", `judge_${lang}.txt`);
const FIX = (lang: string): string => join("tmp", `fix_${lang}.txt`);
const LMS = join(process.env.USERPROFILE ?? "", ".lmstudio", "bin", "lms.exe");

/**
 * Бэкенд перевода: env (TSSR_LLM_URL/MODEL) важнее дефолта — так пульт работает
 * и с headless llama-server, где LM Studio вообще не запущена.
 */
const BACKEND: { url: string; model: string } = {
  url: process.env.TSSR_LLM_URL ?? TRANSLATE_BACKEND.url,
  model: process.env.TSSR_LLM_MODEL ?? TRANSLATE_BACKEND.model,
};
const IS_LM_STUDIO = BACKEND.url.includes(":1234");

/** Синхронная проверка «сервер отвечает» для не-LM бэкендов. */
const httpOk = (url: string): boolean => {
  const out = spawnSync(
    "curl",
    ["-s", "-o", process.platform === "win32" ? "NUL" : "/dev/null", "-w", "%{http_code}", "--max-time", "3", url],
    {
      encoding: "utf-8",
    },
  ).stdout;
  return (out ?? "").trim() === "200";
};

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
const lmsLoaded = (): boolean =>
  IS_LM_STUDIO ? /index-translate-9b\s+index-translate-9b/m.test(run(LMS, ["ps"])) : httpOk(`${BACKEND.url}/v1/models`);

/** Сервер LM Studio отвечает? (`lms load` иногда оставляет сервер выключенным.) */
const lmsServerUp = (): boolean =>
  IS_LM_STUDIO ? /running/i.test(run(LMS, ["server", "status"])) : httpOk(`${BACKEND.url}/v1/models`);

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

/** Поднимает LM Studio и грузит переводческую модель; падает, если не вышло. */
const ensureBackend = (): void => {
  if (!IS_LM_STUDIO) {
    if (!httpOk(`${BACKEND.url}/v1/models`)) die(`бэкенд ${BACKEND.url} не отвечает (поднять: translate_queue.mts)`);
    return;
  }
  if (!existsSync(LMS)) die(`не нашёл lms.exe: ${LMS}`);
  if (!lmsServerUp()) run(LMS, ["server", "start"]);
  if (!lmsLoaded()) {
    console.log(`загружаю ${BACKEND.model} (-c 8192 --parallel 4 --gpu max --ttl 86400)…`);
    console.log(run(LMS, ["load", BACKEND.model, "-c", "8192", "--parallel", "4", "--gpu", "max", "--ttl", "86400"]));
    if (!lmsServerUp()) run(LMS, ["server", "start"]);
  }
  if (!lmsLoaded() || !lmsServerUp()) die("модель/сервер не поднялись — смотри вывод lms");
};

const main = async (): Promise<void> => {
  const [cmd, langArg] = process.argv.slice(2);
  const lang = langArg ?? "";
  const args = process.argv.slice(2);

  if (!cmd || cmd === "status") {
    console.log(`бэкенд перевода: ${BACKEND.url} | ${BACKEND.model}`);
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
    ensureBackend();
    console.log(`готово: ${BACKEND.url} | ${BACKEND.model}`);
    return;
  }

  if (cmd === "run") {
    if (!LANG_RE.test(lang)) die("укажи язык: ru|de|es|fr|it|pl|pt|ja|ko|zh");
    if (runningPid(lang)) die(`${lang}: прогон уже идёт (PID ${runningPid(lang)})`);
    ensureBackend();
    const fd = openSync(LOG(lang), "a");
    const child = spawn(process.execPath, [RUNNER, lang], {
      detached: true,
      stdio: ["ignore", fd, fd],
      env: {
        ...process.env,
        TSSR_LLM_URL: BACKEND.url,
        TSSR_LLM_MODEL: BACKEND.model,
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

  if (cmd === "watch") {
    if (!LANG_RE.test(lang)) die("укажи язык");
    console.log(`watch ${lang}: слежу за LM Studio и прогоном (раз в 20 с)`);
    let failures = 0;
    for (;;) {
      await new Promise((resolve) => setTimeout(resolve, 20_000));
      if (!runningPid(lang)) {
        console.log(`${new Date().toISOString()} прогон ${lang} завершён — watch выходит`);
        return;
      }
      if (lmsServerUp() && lmsLoaded()) {
        failures = 0;
        continue;
      }
      failures++;
      console.log(`${new Date().toISOString()} сервер/модель недоступны (попытка ${failures}) — поднимаю`);
      if (failures > 2 && !lmsServerUp()) run(LMS, ["server", "stop"]);
      ensureBackend();
    }
  }

  if (cmd === "review") {
    if (!LANG_RE.test(lang)) die("укажи язык");
    const out = run(process.execPath, [REVIEW, lang, "--all"]);
    const ids = [...out.matchAll(/\[изменено (\d+)\]/g)].map((m) => Number(m[1]));
    const lines = ids.map((id) => `${id}\n`).join("");
    writeFileSync(REPAIR(lang), lines, "utf-8");
    const found = /НАЙДЕНО: (\d+)/.exec(out)?.[1] ?? String(ids.length);
    console.log(`мех-ревью ${lang}: найдено ${found} → ${REPAIR(lang)}`);
    return;
  }

  if (cmd === "judge") {
    if (!LANG_RE.test(lang)) die("укажи язык");
    const n = Number(args.find((a) => /^\d+$/.test(a)) ?? 200);
    const spread = args.includes("--spread") ? ["--spread"] : [];
    const out = run(process.execPath, [JUDGE, lang, String(n), ...spread]);
    const ids = [...out.matchAll(/СУДЬЯ-BAD \[(\d+)\]/g)].map((m) => Number(m[1]));
    const lines = ids.map((id) => `${id}\n`).join("");
    if (lines) writeFileSync(FLAGS(lang), lines, { encoding: "utf-8", flag: "a" });
    console.log(`судья ${lang}: проверено ${n}, плохих ${ids.length} → ${FLAGS(lang)}`);
    return;
  }

  if (cmd === "fix") {
    if (!LANG_RE.test(lang)) die("укажи язык");
    if (runningPid(lang)) die(`${lang}: сначала stop — прогон идёт`);
    const ids = new Set<number>();
    for (const file of [REPAIR(lang), FLAGS(lang)]) {
      if (!existsSync(file)) continue;
      for (const token of readFileSync(file, "utf-8").split(/\s+/)) {
        if (token.trim()) ids.add(Number(token));
      }
    }
    const list = [...ids].filter((n) => Number.isFinite(n)).sort((a, b) => a - b);
    if (!list.length) die("нечего чинить: нет списков из review/judge");
    const lines = list.map((id) => `${id}\n`).join("");
    writeFileSync(FIX(lang), lines, "utf-8");
    const fd = openSync(LOG(lang), "a");
    const child = spawn(process.execPath, [RUNNER, lang, "--retrans", FIX(lang)], {
      detached: true,
      stdio: ["ignore", fd, fd],
      env: { ...process.env, TSSR_LLM_URL: BACKEND.url, TSSR_LLM_MODEL: BACKEND.model },
    });
    child.unref();
    writeFileSync(PID(lang), `${child.pid}\n`, "utf-8");
    console.log(`ремонт ${lang}: строк ${list.length} (PID ${child.pid}) | список ${FIX(lang)}`);
    return;
  }

  if (cmd === "reset") {
    if (!LANG_RE.test(lang)) die("укажи язык");
    if (!args.includes("--yes")) die(`reset ${lang} обнулит ВСЕ переводы в po. Повтори с --yes`);
    if (runningPid(lang)) die(`${lang}: сначала stop — прогон идёт`);
    const text = readFileSync(PO(lang), "utf-8").replace(/\r\n/g, "\n");
    const backup = join("tmp", `${lang}.po.bak`);
    writeFileSync(backup, text, "utf-8");
    // filter(e => e.msgid) обязателен: parsePo отдаёт и шапку, а renderPo ждёт
    // записи БЕЗ неё — иначе reset вписывает вторую шапку обычной записью.
    const cleared = parsePo(text)
      .filter((e) => e.msgid)
      .map((e) => ({ ...e, msgstr: "" }));
    writePoAtomic(PO(lang), renderPo(cleared, poHeaderLines(text)));
    rmSync(DONE(lang), { force: true });
    console.log(`reset ${lang}: переводы очищены (резерв: ${backup}), кэш done удалён`);
    return;
  }

  die(
    `неизвестная команда «${cmd}». Есть: status | up | run <lang> | stop <lang> | review <lang> | judge <lang> [n] [--spread] | fix <lang> | reset <lang> --yes`,
  );
};

await main();
