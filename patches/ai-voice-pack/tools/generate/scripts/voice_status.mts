/**
 * voice_status.mts — статус и прогноз генерации озвучки (ПОРТ voice_status.py).
 *
 * Считает: сделано реплик (стем с .opus/.wav, RU/EN), % от плана
 * (POT: dialogue+narration), завершённые арки, размер, скорость
 * (замер прироста), прогноз до конца, здоровье процессов и tmp-сирот.
 *
 * План берётся из того же каталога, что и voice_batch.mts (единый источник).
 * Формат вывода — паритет с python-версией (сверка кросс-инструментом в тесте).
 *
 * ЗАПУСК:
 *   node voice_status.mts                  # полный отчёт (замер 60с)
 *   node voice_status.mts --fast           # без замера скорости (мгновенно)
 *   node voice_status.mts --arc Other      # точечно: по конкретной арке
 *   node voice_status.mts --char Sarah     # точечно: по персонажу (голосу)
 *   node voice_status.mts --detail         # подробно: арки × %, топ, размеры
 */
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";

import { loadCatalog, PKG_ROOT } from "./voice_batch.mts";

const LANGS = ["ru", "en"] as const;
const AUDIO_DIR = join(PKG_ROOT, "audio");
const OUTPUT_DIR = join(PKG_ROOT, "tools", "generate", "output");
const aiVoiceDir = (lang: string) => join(AUDIO_DIR, `vo_${lang}`);

// ------------------------------------------------------------- файлы -----

/** {арка: число готовых стемов} + всего (пара wav+opus = один стем). */
export function countDone(lang: string): { made: Map<string, number>; total: number } {
  const made = new Map<string, number>();
  const base = aiVoiceDir(lang);
  if (!existsSync(base)) return { made, total: 0 };
  let total = 0;
  for (const arc of readdirSync(base)) {
    const p = join(base, arc);
    try {
      if (!statSync(p).isDirectory()) continue;
      const stems = new Set<string>();
      for (const f of readdirSync(p)) {
        if (f.includes(".ln.tmp.")) continue; // сироты loudnorm — не реплики
        if (f.endsWith(".wav") || f.endsWith(".opus")) stems.add(f.replace(/\.[^.]+$/, ""));
      }
      made.set(arc, stems.size);
      total += stems.size;
    } catch {
      /* гонка с параллельной генерацией: папка пропала между чтениями */
    }
  }
  return { made, total };
}

// ----------------------------------------------------------- каталог -----

let catalogCache: ReturnType<typeof loadCatalog> | null = null;
function catalog(): ReturnType<typeof loadCatalog> {
  if (catalogCache === null) {
    try {
      catalogCache = loadCatalog();
    } catch {
      catalogCache = [];
    }
  }
  return catalogCache;
}

/** {арка: фраз} — озвучиваемые (dialogue+narration). */
export function plan(): Map<string, number> {
  const p = new Map<string, number>();
  for (const e of catalog()) {
    if (e.category === "dialogue" || e.category === "narration") {
      p.set(e.arc, (p.get(e.arc) ?? 0) + 1);
    }
  }
  return p;
}

/** {имя_голоса: {арка: фраз}} — план по голосам (Narrator = наррация). */
export function charPlan(): Map<string, Map<string, number>> {
  const out = new Map<string, Map<string, number>>();
  for (const e of catalog()) {
    if (e.category !== "dialogue" && e.category !== "narration") continue;
    const who = e.category === "dialogue" ? e.who_name : "Narrator";
    if (!who) continue;
    const m = out.get(who) ?? new Map<string, number>();
    m.set(e.arc, (m.get(e.arc) ?? 0) + 1);
    out.set(who, m);
  }
  return out;
}

/** {variant: число стемов RU+EN} — сделано по голосам (стем uid__variant). */
export function charMade(): Map<string, number> {
  const out = new Map<string, number>();
  const re = /^([0-9a-f]{32}__.+)\.(?:wav|opus)$/;
  for (const lang of LANGS) {
    const base = aiVoiceDir(lang);
    if (!existsSync(base)) continue;
    for (const arc of readdirSync(base)) {
      const p = join(base, arc);
      try {
        if (!statSync(p).isDirectory()) continue;
        const stems = new Set<string>();
        for (const f of readdirSync(p)) {
          const m = f.match(re);
          if (m) stems.add(m[1]); // полный стем uid__variant
        }
        for (const s of stems) {
          const variant = s.split("__")[1];
          out.set(variant, (out.get(variant) ?? 0) + 1);
        }
      } catch {
        /* гонка с генерацией */
      }
    }
  }
  return out;
}

/** Текущая арка каждого воркера: последняя START-метка без DONE после неё. */
export function activeArcs(): Map<string, string> {
  const out = new Map<string, string>();
  for (const lang of LANGS) {
    let arc = "?";
    const log = join(OUTPUT_DIR, "voice", `gen_all_${lang}.log`);
    if (existsSync(log)) {
      const text = readFileSync(log, "utf8");
      const starts = [...text.matchAll(new RegExp(`START ${lang} (\\w+)`, "g"))];
      if (starts.length) {
        const last = starts[starts.length - 1];
        const pos = last.index ?? 0;
        if (!new RegExp(`DONE ${lang} \\w+`).test(text.slice(pos))) arc = last[1];
      }
    }
    out.set(lang, arc);
  }
  return out;
}

/** Число живых инференс-шимов (python cosyworker) — приблизительно. */
export function shimWorkers(): number {
  try {
    const r = spawnSync(
      "powershell",
      [
        "-NoProfile",
        "-Command",
        "(Get-CimInstance Win32_Process -Filter \"Name='python.exe'\" | Where-Object { $_.CommandLine -match 'cosyworker' }).Count",
      ],
      { stdio: ["ignore", "pipe", "pipe"], timeout: 20_000, windowsHide: true },
    );
    if (r.status !== 0) return -1;
    const n = parseInt(String(r.stdout).trim(), 10);
    return Number.isFinite(n) ? n : -1;
  } catch {
    return -1;
  }
}

/** Дископотребление арки (opus/wav на диске). */
export function arcSize(lang: string, arc: string): number {
  const p = join(aiVoiceDir(lang), arc);
  if (!existsSync(p)) return 0;
  let sum = 0;
  for (const f of readdirSync(p)) {
    if (f.endsWith(".wav") || f.endsWith(".opus")) {
      try {
        sum += statSync(join(p, f)).size;
      } catch {
        /* гонка */
      }
    }
  }
  return sum;
}

// ------------------------------------------------------------ вывод -----

const padL = (v: string | number, n: number) => String(v).padStart(n);
const padR = (v: string | number, n: number) => String(v).padEnd(n);
const pct = (a: number, b: number) => (b ? (100 * a) / b : 0);

// ---------------------------------------------------------------- CLI ----

interface Opts {
  fast: boolean;
  arc?: string;
  char?: string;
  detail: boolean;
}

export function parseCli(argv: string[]): Opts {
  const { values } = parseArgs({
    args: argv,
    options: {
      fast: { type: "boolean", default: false },
      arc: { type: "string" },
      char: { type: "string" },
      detail: { type: "boolean", default: false },
    },
  });
  return { fast: values.fast ?? false, arc: values.arc, char: values.char, detail: values.detail ?? false };
}

// ------------------------------------------------------------- команды ----

function cmdArc(arc: string, fast: boolean): number {
  const p = plan();
  const planTotal = p.get(arc) ?? 0;
  if (!planTotal) {
    console.log(`Арка '${arc}' не найдена. Арки: ${[...p.keys()].sort().join(", ")}`);
    return 1;
  }
  console.log(`=== АРКА ${arc} ===`);
  for (const lang of LANGS) {
    const { made } = countDone(lang);
    const c = made.get(arc) ?? 0;
    console.log(
      `  ${padR(lang.toUpperCase(), 2)}: ${padL(c, 5)} / ${padR(planTotal, 6)} (${padL(pct(c, planTotal).toFixed(2), 5)}%) ${c >= planTotal ? "✓" : ""}`,
    );
    if (c) {
      const base = join(aiVoiceDir(lang), arc);
      const byVariant = new Map<string, number>();
      for (const f of readdirSync(base)) {
        const m = f.match(/^[0-9a-f]{32}__(.+)\.(?:wav|opus)$/);
        if (m) byVariant.set(m[1], (byVariant.get(m[1]) ?? 0) + 1);
      }
      const top = [...byVariant.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12);
      console.log(`     по голосам: ${top.map(([v, n]) => `${v} ${n}`).join(", ")}`);
      console.log(`     размер: ${(arcSize(lang, arc) / 1048576).toFixed(1)} МБ`);
    }
  }
  if (!fast) {
    let left = 2 * planTotal;
    for (const l of LANGS) left -= countDone(l).made.get(arc) ?? 0;
    console.log(`  осталось в арке: ${left} фраз (RU+EN)`);
  }
  return 0;
}

function cmdChar(char: string): number {
  const cp = charPlan();
  const arcs = cp.get(char);
  if (!arcs) {
    console.log(`Персонаж '${char}' не найден. Есть: ${[...cp.keys()].sort().slice(0, 30).join(", ")}`);
    return 1;
  }
  const totalPlan = [...arcs.values()].reduce((a, b) => a + b, 0);
  const done = charMade().get(char) ?? 0;
  console.log(`=== ПЕРСОНАЖ ${char} ===`);
  console.log(`  план: ${totalPlan} фраз | сделано (RU+EN): ${done} (${pct(done, 2 * totalPlan).toFixed(1)}%)`);
  console.log("  по аркам (план):");
  for (const arc of [...arcs.keys()].sort()) {
    console.log(`    ${padR(arc, 18)} ${padL(arcs.get(arc)!, 5)}`);
  }
  return 0;
}

function cmdDetail(): number {
  const p = plan();
  console.log("=== ПОДРОБНЫЙ ОТЧЁТ ===");
  console.log(
    `План: ${[...p.values()].reduce((a, b) => a + b, 0)} фраз × 2 языка = ${[...p.values()].reduce((a, b) => a + b, 0) * 2}`,
  );
  console.log();
  const hdr = `${padR("Арка", 20)} | ${padL("RU", 8)} | ${padL("EN", 8)} | ${padL("RU%", 7)} | ${padL("EN%", 7)} | ${padL("Размер RU+EN", 10)}`;
  console.log(hdr);
  console.log("-".repeat(hdr.length));
  const ru = countDone("ru").made;
  const en = countDone("en").made;
  for (const arc of [...p.keys()].sort()) {
    const cr = ru.get(arc) ?? 0;
    const ce = en.get(arc) ?? 0;
    const t = p.get(arc)!;
    const sizeMb = (arcSize("ru", arc) + arcSize("en", arc)) / 1048576;
    console.log(
      `${padR(arc.slice(0, 20), 20)} | ${padL(cr, 8)} | ${padL(ce, 8)} | ${padL(pct(cr, t).toFixed(1) + "%", 7)} | ${padL(pct(ce, t).toFixed(1) + "%", 7)} | ${padL(sizeMb.toFixed(1) + "МБ", 10)}`,
    );
  }
  console.log();
  const cm = [...charMade().entries()].sort((a, b) => b[1] - a[1]).slice(0, 15);
  console.log("=== ТОП ГОЛОСОВ (фразы RU+EN) ===");
  for (const [v, n] of cm) console.log(`  ${padR(v, 30)} ${n}`);
  console.log();
  const act = activeArcs();
  console.log("=== ВОКЕРЫ ===");
  console.log(`  процессы cosyworker: ${shimWorkers()}`);
  for (const lang of LANGS) console.log(`  ${lang.toUpperCase()}: арка ${act.get(lang) ?? "?"}`);
  console.log(`  tmp-сирот (loudnorm): ${healthScan().orphans}`);
  return 0;
}

/** Один обход корпуса: сироты .ln.tmp, недописанные .part, размеры по языкам. */
export function healthScan(): { orphans: number; parts: number; sizes: Record<string, number> } {
  let orphans = 0;
  let parts = 0;
  const sizes: Record<string, number> = { ru: 0, en: 0 };
  for (const lang of LANGS) {
    const base = aiVoiceDir(lang);
    if (!existsSync(base)) continue;
    const stack = [base];
    while (stack.length) {
      const dir = stack.pop()!;
      let names: string[];
      try {
        names = readdirSync(dir);
      } catch {
        continue;
      }
      for (const f of names) {
        const full = join(dir, f);
        let st;
        try {
          st = statSync(full);
        } catch {
          continue;
        }
        if (st.isDirectory()) {
          stack.push(full);
        } else if (f.includes(".ln.tmp.")) {
          orphans++; // темпы loudnorm И конвертера
        } else if (f.endsWith(".part")) {
          parts++;
        } else if (f.endsWith(".wav") || f.endsWith(".opus")) {
          sizes[lang] += st.size;
        }
      }
    }
  }
  return { orphans, parts, sizes };
}

/** Замер скорости: прирост стемов за 60с -> прогноз. */
async function reportSpeed(planTotal: number, total: number): Promise<void> {
  console.log("\n=== СКОРОСТЬ (замер 60с) ===");
  const before = LANGS.map((l) => countDone(l).total);
  await new Promise((r) => setTimeout(r, 60_000));
  const after = LANGS.map((l) => countDone(l).total);
  const delta = after.reduce((a, b) => a + b, 0) - before.reduce((a, b) => a + b, 0);
  const perHour = delta * 60;
  const left = planTotal - (total + delta);
  const days = perHour ? left / perHour / 24 : Infinity;
  console.log(`  прирост: ${delta} фраз/мин ≈ ${perHour} /час суммарно`);
  console.log(`  осталось: ${left} фраз`);
  console.log(
    `  ПРОГНОЗ: ${perHour ? (left / perHour).toFixed(0) : 0} ч ≈ ${Number.isFinite(days) ? days.toFixed(1) : "∞"} дня (без остановок)`,
  );
}

// --------------------------------------------------------------- main ----

export async function main(argv: string[] = process.argv.slice(2)): Promise<number> {
  const opts = parseCli(argv);
  if (opts.arc) return cmdArc(opts.arc, opts.fast);
  if (opts.char) return cmdChar(opts.char);
  if (opts.detail) return cmdDetail();

  const p = plan();
  const planPerLang = [...p.values()].reduce((a, b) => a + b, 0);
  const planTotal = planPerLang * 2;
  const made = { ru: countDone("ru"), en: countDone("en") };
  const total = made.ru.total + made.en.total;

  console.log("=== СТАТУС ГЕНЕРАЦИИ ОЗВУЧКИ ===");
  console.log(`План: ${planTotal} фраз (${planPerLang} × 2 языка)`);
  for (const lang of LANGS) {
    console.log(
      `  ${padR(lang.toUpperCase(), 2)} ${padL(made[lang].total, 6)} готово (${padL(pct(made[lang].total, planPerLang).toFixed(2), 5)}%)`,
    );
  }
  console.log(`  ВСЕГО: ${padL(total, 6)} / ${planTotal} (${pct(total, planTotal).toFixed(2)}%)`);

  console.log("\n=== АРКИ ===");
  const arcs = [...p.keys()].sort();
  for (const lang of LANGS) {
    const lines = arcs.map(
      (a) =>
        `${a.slice(0, 14)} ${made[lang].made.get(a) ?? 0}/${p.get(a)!} ${(made[lang].made.get(a) ?? 0) >= p.get(a)! ? "✓" : ""}`,
    );
    console.log(`  ${lang.toUpperCase()}: ${lines.join(" | ")}`);
  }

  const act = activeArcs();
  console.log("\n=== ВОКЕРЫ ===");
  const workers = shimWorkers();
  console.log(`  процессы cosyworker: ${workers >= 0 ? workers : "? (нет tasklist)"}`);
  for (const lang of LANGS) {
    const arc = act.get(lang) ?? "?";
    console.log(`  ${lang.toUpperCase()}: арка ${arc} (всего в арке ${p.get(arc) ?? 0})`);
  }

  console.log("\n=== ЗДОРОВЬЕ ===");
  const h = healthScan();
  console.log(`  tmp-сирот (loudnorm/конвертер): ${h.orphans}`);
  console.log(`  недописанных .part (обрыв конверта): ${h.parts}`);
  console.log(`  размер: RU ${(h.sizes.ru / 1e9).toFixed(1)} GB, EN ${(h.sizes.en / 1e9).toFixed(1)} GB`);

  if (opts.fast || total === 0) {
    console.log("\n(без замера скорости: --fast)");
    return 0;
  }
  await reportSpeed(planTotal, total);
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().then(
    (code) => process.exit(code),
    (e) => {
      console.error(e);
      process.exit(1);
    },
  );
}
