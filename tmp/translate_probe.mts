/**
 * Пробный перевод по скиллу `translate` — ЗЕРКАЛО промпта translate_run.mts:
 * правила из блока ПРАВИЛА скилла, контекст 3+1 с подписями PREVIOUS/NEXT,
 * гендер из casts/gender.mts, канон имён из строк speaker-name,
 * STEP 1 ресёрч → STEP 2 перевод, ответ JSON {"scene","tr"}.
 * Ничего не пишет: EN / БЫЛО / СТАЛО + scene для ревью владельца.
 * Запуск: node tmp/translate_probe.mts [lang] [фильтр-подстроки]
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { parsePo } from "../.opencode/skills/renpy-po/po_core.mts";
import { resolveBackend } from "../scripts/llm_backend.mts";
import { SPEAKER_GENDER } from "../patches/ai-voice-pack/casts/gender.mts";

const LANG = process.argv[2] ?? "ru";
const FILTER = process.argv[3] ?? "";
const TARGET: Record<string, string> = { ru: "Russian", es: "Spanish", de: "German", fr: "French", it: "Italian", pl: "Polish", pt: "Portuguese", ja: "Japanese", ko: "Korean", zh: "Chinese" };
const PO = join("patches", "ai-voice-pack", "po", `${LANG}.po`);
const SKILL = join(".opencode", "skills", "translate", "SKILL.md");

// 1. Правила — из скилла (блок ПРАВИЛА), единый источник с раннером.
const skill = readFileSync(SKILL, "utf-8");
const open = skill.indexOf("<!-- ПРАВИЛА -->");
const close = skill.indexOf("<!-- /ПРАВИЛА -->");
if (open < 0 || close <= open) throw new Error("в translate/SKILL.md нет блока ПРАВИЛА");
const rules = skill.slice(open + "<!-- ПРАВИЛА -->".length, close).trim();

// 2. Контрольные строки: проблемные кейсы проходов + разнообразие регистров.
const SAMPLE = [
  "A cunt.",
  "Speaking of growing up, have you seen...",
  "So mean!",
  "Marion shrugs.",
  "A man waved at Marion from across the room, and Marion waved back.",
  "Marion turned to Thomas now, pleading for his support instead of convincing Varga.",
  "She sunk back into the bed. She felt every limb tingle with the afterglow.",
  "Jaeid grabbed Sarah by her upper arm and dragged her into the cart, putting her down on the floor of the cart.",
  "What you are about to play is a work-in-progress.",
  "The great castle rests at the heart of the nation of Rosanna.",
  "Down near to her own sex, she felt him.",
  "Sarah felt her chest tighten as her friend shared her grief.",
  "Pleeeeeease.",
  "A crowd of people gathered to watch them, and I couldn't keep away. I was drawn in like everyone else.",
  // Выборочный тест18+-регистра (правило 3 скилла: откровенно, без медицинщины
  // и приличных заглушек) + ловушки: cock-глагол, ирония.
  "His cock was standing up, rock hard. Sarah figured he was big enough that she could wrap both her hands around it.",
  "Varga put one hand on his own cock, and slowly guided it into Sarah's pussy, gently pushing into her.",
  "Sarah felt Varga's cum slide out from her, down between her legs.",
  "She felt her head cock back, and began to moan loudly. The sounds echoed through her bedroom.",
  "Sarah still felt every part of her being controlled, her hair still pulled tight, her pussy exposed and being penetrated. Holding onto the wall was the only thing she could manage.",
  "Varga, understanding the hint, began to pick up his tempo, fucking her faster and deeper with every thrust.",
  "What's the matter, Sarah? You're not sleeping naked under the blankets, are you?",
  "The already impressive feeling of his cock inside of her, built further, as it expanded for one last time.",
  // Девять строк, где модель дважды ошибалась — проверка «может ли локальная сама».
  "With practiced effort, Kate got to work on Sarah.",
  "I didn't mean to-",
  "You did. Which is fine. Do not apologize.",
  "Sarah saw a sea of heads, turning about, all looking at her.",
  "Again, in Rosanna, they would have paid dearly for it.",
  "Crown Kamal",
  "From Normandi, one of the neighbouring kingdoms to Rosanna, a member of the Union Kingdoms.",
  "I heard the horns of war blast when the Khan's legion rode out towards Rosanna.",
  "With Kate's arm still trapped in the shield, and her neck pinned to the ground by Sarah who was standing over her, Kate knew she had lost.",
];

const entries = parsePo(readFileSync(PO, "utf-8").replace(/\r\n/g, "\n")).filter((e) => e.msgid);
const idxOf = new Map<string, number>();
entries.forEach((e, i) => {
  if (!idxOf.has(e.msgid)) idxOf.set(e.msgid, i);
});

// Канон имён — как в раннере: строки msgctxt=speaker-name.
const NAME_CANON = new Map<string, string>();
for (const e of entries) {
  if (e.msgctxt === "speaker-name" && e.msgid && e.msgstr.trim() && !NAME_CANON.has(e.msgid)) {
    NAME_CANON.set(e.msgid, e.msgstr.trim());
  }
}

const { url, model } = resolveBackend();
const TEMP = Number(process.env.PROBE_TEMP ?? 0.5);
const chat = async (messages: Array<{ role: string; content: string }>): Promise<string> => {
  const r = await fetch(`${url.replace(/\/+$/, "")}/v1/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model, messages, temperature: TEMP, max_tokens: 700, stream: false, reasoning_effort: "none" }),
    signal: AbortSignal.timeout(120_000),
  });
  const d = (await r.json()) as { choices?: Array<{ message?: { content?: string } }>; error?: unknown };
  const c = d.choices?.[0]?.message?.content ?? "";
  if (!c) throw new Error(`пустой ответ: ${JSON.stringify(d.error ?? d).slice(0, 200)}`);
  return c;
};
const fieldOf = (raw: string, key: string): string => {
  const m = new RegExp(`"${key}"\\s*:\\s*"((?:[^"\\\\]|\\\\.)*)"`).exec(raw) ?? new RegExp(`"${key}"\\s*:\\s*«([^»]*)»"`).exec(raw);
  if (!m) return "";
  try {
    return JSON.parse(`"${m[1]}"`) as string;
  } catch {
    return m[1];
  }
};

console.log(`бэкенд: ${url} | модель: ${model} | язык: ${LANG} | правил: ${rules.length} симв.\n`);

let done = 0;
let ms = 0;
for (const msgid of SAMPLE) {
  if (FILTER && !msgid.includes(FILTER)) continue;
  const i = idxOf.get(msgid);
  if (i === undefined) {
    console.log(`[нет в po] ${msgid.slice(0, 70)}`);
    continue;
  }
  const e = entries[i];
  const at = (k: number): string | null => {
    const x = entries[i + k];
    return x ? `${x.msgctxt} ${x.msgid}` : null;
  };
  const prevCtx = [-3, -2, -1].map(at).filter((x): x is string => Boolean(x));
  const nextCtx = [at(1)].filter((x): x is string => Boolean(x));
  const ctxBlock =
    prevCtx.length || nextCtx.length
      ? `CONTEXT — for understanding only; translate ONLY the target line:\n` +
        (prevCtx.length ? `PREVIOUS lines (already happened):\n${prevCtx.join("\n")}\n` : "") +
        (nextCtx.length ? `NEXT line (comes right AFTER this line):\n${nextCtx.join("\n")}\n` : "") +
        "\n"
      : "";
  const name = e.msgctxt.replace(/^speaker:/, "").replace(/^"|"$/g, "");
  const g = SPEAKER_GENDER[name] ?? null;
  const genderNote = name === "Narrator"
    ? " (narration: agreement follows the characters in the line, never the narrator)"
    : g ? ` (gender ${g})` : "";
  const names: string[] = [];
  const gtag = (en: string): string => {
    const gt = SPEAKER_GENDER[en];
    return gt ? ` (${gt === "M" ? "MALE — masculine agreement: он, -лся, -л" : "FEMALE — feminine agreement: она, -лась, -ла"})` : "";
  };
  if (NAME_CANON.has(name)) names.push(`${name} -> ${NAME_CANON.get(name)}${gtag(name)}`);
  for (const [en, canon] of NAME_CANON) if (e.msgid.includes(en)) names.push(`${en} -> ${canon}${gtag(en)}`);
  const namesBlock = names.length
    ? `NAMES — exact renderings; the GENDER in parentheses drives grammatical agreement (trust it, never guess from the name):\n${[...new Set(names)].join("\n")}\n\n`
    : "";
  const msgs = [
    { role: "system", content: `You translate this game into ${TARGET[LANG] ?? LANG}. Follow these rules:\n\n${rules}` },
    {
      role: "user",
      content:
        ctxBlock +
        namesBlock +
        `Said by: ${name}${genderNote}\nEN: ${e.msgid}\n\n` +
        `STEP 1 — RESEARCH: using the context, write 2-3 sentences in English about the situation: ` +
        `who is speaking to whom, what just happened, and what this line does — and note each character's gender from NAMES in parentheses. ` +
        `Mind the ADDRESSEE — it decides forms like past-tense "you" — and the GENDER of every character (from NAMES).\n` +
        `STEP 2 — TRANSLATE ONLY the EN line into ${TARGET[LANG] ?? LANG}. The value of "tr" must contain ` +
        `the translation and NOTHING ELSE: no speaker name, no label, no line breaks. Keep EVERY clause of the EN line ` +
        `and make "tr" grammatically correct.\n` +
        `BEFORE outputting, check "tr" against your STEP 1 research: 2nd-person past forms follow the ADDRESSEE you found, ` +
        `agreement follows the GENDER of each character (see NAMES). Never guess gender from a name itself — NAMES is the only source. ` +
        `Fix "tr" if it disagrees.\n` +
        `Output ONLY JSON {"scene":"<research>","tr":"<translation>"}.`,
    },
  ];
  try {
    if (process.env.DEBUG) console.log("=== USER PROMPT ===\n" + msgs[1].content + "\n=== /PROMPT ===\n");
    const t0 = Date.now();
    const raw = await chat(msgs);
    const dt = Date.now() - t0;
    ms += dt;
    done++;
    const tr = fieldOf(raw, "tr") || raw.trim().slice(0, 200);
    const scene = fieldOf(raw, "scene");
    console.log(`[${done}] ${e.msgctxt} | гендер: ${g ?? "-"} | ${(dt / 1000).toFixed(1)}с`);
    console.log(`   EN:    ${e.msgid}`);
    console.log(`   БЫЛО:  ${e.msgstr}`);
    console.log(`   СТАЛО: ${tr}`);
    if (scene) console.log(`   СЦЕНА: ${scene.slice(0, 220)}`);
    console.log("");
  } catch (err) {
    console.log(`[ошибка] ${msgid.slice(0, 50)}: ${String(err).slice(0, 160)}`);
  }
}
console.log(`готово: ${done} строк, суммарно ${(ms / 1000).toFixed(1)}с, в среднем ${done ? (ms / 1000 / done).toFixed(1) : "-"}с/стр (${done ? (1000 * done / ms).toFixed(2) : "-"} стр/с)`);
