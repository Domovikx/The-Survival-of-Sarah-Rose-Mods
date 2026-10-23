/**
 * voice_role_audit.mts — аудит «роль по PO → озвучка в audio/vo_*».
 *
 * Баг-клас (инцидент 2026-10): пачка файлов озвучена под роль из тикета,
 * а PO (po/template.pot msgctxt speaker:*) говорит про другую роль —
 * файлы висят, игра их не находит/играет не тем голосом. Источник истины —
 * PO + casts.mts SPEAKERS; резолюция ровно та же, что у батча
 * (loadCatalog/voiceForSpeaker — импорт из voice_batch.mts), поэтому
 * расхождений «логика генерации vs логика аудита» быть не может.
 *
 * Классы (uid = md5(msgid), суффикс файла = вариант = имя каста):
 *   OK         — суффикс ∈ ожидаемым голосам uid
 *   WRONG_ROLE — суффикс не совпал с SPEAKERS[спикера] — ГЛАВНЫЙ класс
 *   VOICELESS  — спикер с null в SPEAKERS (осознанно без голоса), файл есть
 *   NON_SPEECH — uid есть в POT только как menu/ui/имя, а файл озвучен
 *   STALE      — uid в POT нет (строка выпала / текст изменился)
 *   ARC        — суффикс верен, файл лежит не в той арке (report-only)
 *   WEIRD      — имя файла вне формата {32hex}__{variant}.opus (report-only)
 *
 * Лечение:
 *   --delete   WRONG_ROLE/VOICELESS/NON_SPEECH/STALE → удаление (оба языка).
 *              При (--delete --verify) STALE с ЖИВОЙ строкой в игре сохраняется.
 *   --fix-arc  ARC → перенос файла из чужой арки в POT-арку (rename;
 *              существующий файл-приёмник = конфликт, пропуск, без перезаписи).
 *   --verify   сверка с СЫРЬЁМ игры (game/): ПОТЕРЯ vs POT (нужен ли potgen)
 *              и смертность STALE (uid = md5(текста): строки нет в игре →
 *              файл мёртв навсегда; строка жива → файл НЕ удалять).
 *   --dry      сухой прогон: печатает план, ФС не трогает.
 *   --game <d> каталог сырья для --verify (по умолчанию рабочая установка).
 *
 * Источники истины: casts.mts SPEAKERS + po/template.pot (фразы/арки, генерит
 * potgen из game/). mods/, label_arc.json, voice_list.json — артефакты сборки,
 * НЕ источник. Инструмент правит ТОЛЬКО репу: установка синхронизируется
 * сборкой (npm run build:pack) и установкой дистрибутива.
 *
 * Запуск:
 *   node voice_role_audit.mts                  # отчёт обеих языков
 *   node voice_role_audit.mts --verify         # + сверка POT/STALE с сырьём
 *   node voice_role_audit.mts --delete         # отчёт + удаление мёртвых
 *   node voice_role_audit.mts --fix-arc --dry  # план переноса ARC
 *   node voice_role_audit.mts --fix-arc        # перенос ARC в свои арки
 *
 * Покрытие (что вообще должно существовать) — НЕ здесь: voice_status.mts.
 */

import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  renameSync,
  rmSync,
  rmdirSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseArgs } from "node:util";

import { scanGame } from "../../../../../.opencode/skills/renpy-po/potgen.mts";
import { loadCatalog, voiceForSpeaker } from "./voice_batch.mts";

const SCRIPTS_DIR = dirname(fileURLToPath(import.meta.url));
const PKG_ROOT = join(SCRIPTS_DIR, "..", "..", "..");
const REPO_ROOT = join(PKG_ROOT, "..", "..");
const AUDIO_DIR = join(PKG_ROOT, "audio");
const REPORT_JSON = join(REPO_ROOT, "tmp", "role_audit.json");
/** Исторический путь рабочей установки (см. AGENTS.md); переопределяется --game. */
const DEFAULT_GAME_DIR = "C:/Program Files (x86)/Steam/steamapps/common/The Survival of Sarah Rose/game";

type Kind = "OK" | "WRONG_ROLE" | "VOICELESS" | "NON_SPEECH" | "STALE" | "ARC" | "WEIRD";

/** Классы, которые удаляются при --delete (полностью, оба языка). */
const DELETE_KINDS: ReadonlySet<Kind> = new Set<Kind>(["WRONG_ROLE", "VOICELESS", "NON_SPEECH", "STALE"]);

interface UidInfo {
  /** Ожидаемые варианты (SPEAKERS[спикера]); пусто = спикер без голоса. */
  voices: Set<string>;
  /** Спикер(ы) реплики для отчёта. */
  who: string;
  /** Арки, в которых uid встречается в POT. */
  arcs: Set<string>;
  /** Реплика непереведена на ru (для контекста отчёта). */
  ruTranslated: boolean;
}

interface Finding {
  lang: string;
  rel: string;
  uid: string;
  variant: string;
  arc: string;
  kind: Kind;
  detail: string;
}

// ------------------------------------------------------------- ожидание ---

interface Expectation {
  /** uid речевых строк (dialogue/narration) → ожидания. */
  speech: Map<string, UidInfo>;
  /** uid не-речевых строк (menu/ui/имя). */
  nonSpeech: Set<string>;
  /** Все uid POT (речь + не-речь) — дрейф в --verify. */
  allUids: Set<string>;
}

function buildExpectation(): Expectation {
  const speech = new Map<string, UidInfo>();
  const nonSpeech = new Set<string>();
  const allUids = new Set<string>();
  for (const e of loadCatalog()) {
    allUids.add(e.uid);
    if (e.category !== "dialogue" && e.category !== "narration") {
      nonSpeech.add(e.uid);
      continue;
    }
    let info = speech.get(e.uid);
    if (!info) {
      info = { voices: new Set(), who: e.who_name || "Narrator", arcs: new Set(), ruTranslated: false };
      speech.set(e.uid, info);
    }
    const v = voiceForSpeaker(e);
    if (v) info.voices.add(v);
    info.arcs.add(e.arc);
    if (e.new) info.ruTranslated = true;
  }
  return { speech, nonSpeech, allUids };
}

// ---------------------------------------------------------------- скан ----

/** Рекурсивный список файлов (относительных путей с /). */
function listFiles(dir: string, base = ""): string[] {
  const out: string[] = [];
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const name of entries) {
    const rel = base ? `${base}/${name}` : name;
    const abs = join(dir, name);
    if (statSync(abs).isDirectory()) out.push(...listFiles(abs, rel));
    else out.push(rel);
  }
  return out;
}

const FILE_RE = /^([0-9a-f]{32})__(.+)\.opus$/;

function classify(lang: string, rel: string, exp: Expectation): Finding {
  const fileArc = rel.includes("/") ? rel.slice(0, rel.indexOf("/")) : "";
  const name = rel.slice(rel.lastIndexOf("/") + 1);
  const m = FILE_RE.exec(name);
  if (!m) {
    return { lang, rel, uid: "", variant: "", arc: fileArc, kind: "WEIRD", detail: "имя не {32hex}__{variant}.opus" };
  }
  const [, uid, variant] = m;
  const info = exp.speech.get(uid);
  if (!info) {
    if (exp.nonSpeech.has(uid)) {
      return { lang, rel, uid, variant, arc: fileArc, kind: "NON_SPEECH", detail: "uid = не-речь (menu/ui/имя)" };
    }
    return {
      lang,
      rel,
      uid,
      variant,
      arc: fileArc,
      kind: "STALE",
      detail: "uid нет в POT (строка выпала/текст изменился)",
    };
  }
  if (info.voices.size === 0) {
    return {
      lang,
      rel,
      uid,
      variant,
      arc: fileArc,
      kind: "VOICELESS",
      detail: `спикер ${info.who} → null (без голоса)`,
    };
  }
  if (!info.voices.has(variant)) {
    return {
      lang,
      rel,
      uid,
      variant,
      arc: fileArc,
      kind: "WRONG_ROLE",
      detail: `ожидалось [${[...info.voices].join(" | ")}] (спикер ${info.who}), в файле: ${variant}`,
    };
  }
  if (fileArc && !info.arcs.has(fileArc)) {
    return {
      lang,
      rel,
      uid,
      variant,
      arc: fileArc,
      kind: "ARC",
      detail: `POT-арка: ${[...info.arcs].join(" | ")}, файл лежит в: ${fileArc}`,
    };
  }
  return { lang, rel, uid, variant, arc: fileArc, kind: "OK", detail: "" };
}

// --------------------------------------------------------------- отчёт ----

const ALL_KINDS: Kind[] = ["OK", "WRONG_ROLE", "VOICELESS", "NON_SPEECH", "STALE", "ARC", "WEIRD"];
const EXAMPLES = 30;

function report(lang: string, findings: Finding[]): Map<Kind, number> {
  const counts = new Map<Kind, number>(ALL_KINDS.map((k) => [k, 0]));
  for (const f of findings) counts.set(f.kind, (counts.get(f.kind) ?? 0) + 1);
  console.log(`\n=== vo_${lang}: файлов ${findings.length}`);
  for (const k of ALL_KINDS) {
    const n = counts.get(k) ?? 0;
    if (k === "OK") {
      console.log(`  OK          ${n}`);
      continue;
    }
    if (n === 0) continue;
    console.log(`  ${k.padEnd(11)} ${n}`);
    for (const f of findings.filter((x) => x.kind === k).slice(0, EXAMPLES)) {
      console.log(`    - ${f.rel}\n        ${f.detail}`);
    }
    if (n > EXAMPLES) console.log(`    … и ещё ${n - EXAMPLES} (полный список в tmp/role_audit.json)`);
  }
  return counts;
}

// ----------------------------------------------------- сверка с сырьём ---

interface VerifyResult {
  freshUids: number;
  potUids: number;
  onlyInGame: number;
  onlyInPot: number;
  /** uid STALE, чья строка ЕЩЁ есть в игре — файл НЕ удалять. */
  staleAlive: Set<string>;
}

function verifyAgainstSource(exp: Expectation, staleUids: Set<string>, gameDir: string): VerifyResult {
  console.log(`\n=== --verify: свежий scanGame(${gameDir})`);
  const cat = scanGame(gameDir);
  const fresh = new Set<string>();
  for (const e of cat.entries.values()) fresh.add(e.uid);
  let onlyInGame = 0;
  for (const u of fresh) if (!exp.allUids.has(u)) onlyInGame++;
  let onlyInPot = 0;
  for (const u of exp.allUids) if (!fresh.has(u)) onlyInPot++;
  const staleAlive = new Set<string>();
  for (const u of staleUids) if (fresh.has(u)) staleAlive.add(u);
  console.log(`  uid: свежая игра ${fresh.size} | POT ${exp.allUids.size}`);
  console.log(`  только в игре (POT отстаёт): ${onlyInGame} | только в POT (строки ушли): ${onlyInPot}`);
  if (onlyInGame + onlyInPot === 0) console.log("  POT ≡ игра ✓ (potgen не нужен)");
  else console.log("  ⚠️ POT разошёлся с игрой — регенерируй: npm run potgen");
  console.log(`  STALE uid: живы в игре ${staleAlive.size} | мертвы ${staleUids.size - staleAlive.size}`);
  return { freshUids: fresh.size, potUids: exp.allUids.size, onlyInGame, onlyInPot, staleAlive };
}

// ------------------------------------------------------------ лечение ----

const MOVE_EXAMPLES = 30;

function fixArc(
  dir: string,
  arcFindings: Finding[],
  exp: Expectation,
  dry: boolean,
): { moved: number; conflicts: number; kept: number } {
  let moved = 0;
  let conflicts = 0;
  let kept = 0;
  let printed = 0;
  const touchedDirs = new Set<string>();
  for (const f of arcFindings) {
    const dests = [...(exp.speech.get(f.uid)?.arcs ?? [])].filter((a) => a && a !== f.arc);
    if (dests.length === 0) {
      kept++; // арка неизвестна/совпадает — не трогаем
      continue;
    }
    const name = `${f.uid}__${f.variant}.opus`;
    const free = dests.filter((a) => !existsSync(join(dir, a, name)));
    conflicts += dests.length - free.length;
    if (free.length === 0) {
      kept++; // везде занято — конфликт, без перезаписи
      continue;
    }
    if (!dry) {
      mkdirSync(join(dir, free[0]), { recursive: true });
      renameSync(join(dir, f.rel), join(dir, free[0], name));
      for (const a of free.slice(1)) copyFileSync(join(dir, free[0], name), join(dir, a, name));
    }
    moved += free.length;
    touchedDirs.add(f.arc);
    if (printed < MOVE_EXAMPLES) {
      console.log(`    ${dry ? "plan" : "move"}: ${f.rel} -> ${free.join(" | ")}/`);
      printed++;
      if (printed === MOVE_EXAMPLES && arcFindings.length > MOVE_EXAMPLES) {
        console.log(`    … и ещё ${arcFindings.length - MOVE_EXAMPLES} (полный список в tmp/role_audit.json)`);
      }
    }
  }
  if (!dry) {
    for (const d of touchedDirs) {
      try {
        rmdirSync(join(dir, d)); // опустела — убрать; не пустая — исключение, остаётся
      } catch {
        /* остаётся */
      }
    }
  }
  return { moved, conflicts, kept };
}

// ---------------------------------------------------------------- main ----

export function main(argv: string[] = process.argv.slice(2)): number {
  const { values } = parseArgs({
    args: argv,
    options: {
      "lang": { type: "string" },
      "delete": { type: "boolean", default: false },
      "fix-arc": { type: "boolean", default: false },
      "verify": { type: "boolean", default: false },
      "dry": { type: "boolean", default: false },
      "game": { type: "string", default: DEFAULT_GAME_DIR },
    },
  });
  const langs = values.lang ? [values.lang] : ["ru", "en"];

  const exp = buildExpectation();
  const voiceless = [...exp.speech.values()].filter((i) => i.voices.size === 0).length;
  console.log(
    `PO: речевых uid ${exp.speech.size} (из них без голоса: ${voiceless}), не-речевых uid ${exp.nonSpeech.size}`,
  );

  // 1) скан и классификация всех языков — ДО любых правок
  const scanned = langs.map((lang) => {
    const dir = join(AUDIO_DIR, `vo_${lang}`);
    return { lang, dir, findings: listFiles(dir).map((rel) => classify(lang, rel, exp)) };
  });

  // 2) сверка с сырьём — до лечения: живые STALE защищают --delete
  let verify: VerifyResult | null = null;
  if (values.verify) {
    const staleUids = new Set(scanned.flatMap((s) => s.findings.filter((f) => f.kind === "STALE").map((f) => f.uid)));
    try {
      verify = verifyAgainstSource(exp, staleUids, values.game ?? DEFAULT_GAME_DIR);
    } catch (e) {
      console.error(`--verify: scanGame не прошёл: ${(e as Error).message}`);
      return 1;
    }
  }

  const json: Record<string, unknown> = {
    generated: new Date().toISOString(),
    verify: verify
      ? {
          freshUids: verify.freshUids,
          potUids: verify.potUids,
          onlyInGame: verify.onlyInGame,
          onlyInPot: verify.onlyInPot,
          staleAlive: [...verify.staleAlive],
        }
      : null,
    langs: {},
  };
  let totalDeleted = 0;
  let totalMoved = 0;
  let totalConflicts = 0;

  // 3) отчёт + лечение
  for (const { lang, dir, findings } of scanned) {
    const counts = report(lang, findings);
    const nonOk = findings.filter((f) => f.kind !== "OK");
    (json.langs as Record<string, unknown>)[lang] = {
      total: findings.length,
      counts: Object.fromEntries(counts),
      findings: nonOk,
    };

    if (values.delete) {
      const aliveKept = verify ? nonOk.filter((f) => f.kind === "STALE" && verify.staleAlive.has(f.uid)) : [];
      const toDelete = nonOk.filter(
        (f) => DELETE_KINDS.has(f.kind) && !(verify && f.kind === "STALE" && verify.staleAlive.has(f.uid)),
      );
      if (!values.dry) {
        for (const f of toDelete) rmSync(join(dir, f.rel), { force: true });
        // пустые арки — подчистить (полностью; непустые rmdirSync не тронет)
        const dirs = new Set(toDelete.map((f) => f.rel.split("/").slice(0, -1).join("/")).filter(Boolean));
        for (const d of dirs) {
          try {
            rmdirSync(join(dir, d));
          } catch {
            /* не пустая — остаётся */
          }
        }
      }
      console.log(
        `  ${values.dry ? "будет удалено" : "удалено"} из vo_${lang}: ${toDelete.length}` +
          (aliveKept.length ? ` (сохранено — строка жива в игре: ${aliveKept.length})` : ""),
      );
      totalDeleted += toDelete.length;
    }

    if (values["fix-arc"]) {
      const r = fixArc(
        dir,
        nonOk.filter((f) => f.kind === "ARC"),
        exp,
        values.dry === true,
      );
      console.log(
        `  ${values.dry ? "план переноса ARC" : "перенесено ARC"} vo_${lang}: ${r.moved}` +
          ` (конфликтов: ${r.conflicts}, без действия: ${r.kept})`,
      );
      totalMoved += r.moved;
      totalConflicts += r.conflicts;
    }
  }

  mkdirSync(dirname(REPORT_JSON), { recursive: true });
  writeFileSync(REPORT_JSON, JSON.stringify(json, null, 2), "utf8");
  console.log(`\nJSON: ${REPORT_JSON}`);
  if (values.delete) console.log(`Итого ${values.dry ? "будет удалено" : "удалено"}: ${totalDeleted}`);
  if (values["fix-arc"]) {
    console.log(`Итого ${values.dry ? "будет перенесено" : "перенесено (файлов, с копиями)"}: ${totalMoved}`);
    if (totalConflicts) console.log(`Конфликтов пропущено (файл уже есть): ${totalConflicts}`);
  }
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = main();
}
