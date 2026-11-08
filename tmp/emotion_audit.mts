/**
 * tmp/emotion_audit.mts — аудит качества `#. emotion:` в template.pot.
 *
 * Проверяет нарушения ПРАВИЛ разметки (AGENTS.md + emotion_tag.mts):
 *   - не-английский тон (кириллица/CJK)
 *   - пустой тон
 *   - «none» (запрещено)
 *   - слишком длинный (>6 слов = модель ушла в описание содержания)
 *   - однословные (нет инструкции состояния)
 *   - не-существительное/глагольная форма? (простая эвристика)
 *   - доля DEFAULT_EMO и топ-тонов (однообразие)
 *
 * Запуск: node tmp/emotion_audit.mts
 */
import { readFileSync } from "node:fs";

const POT = "patches/ai-voice-pack/po/template.pot";
const text = readFileSync(POT, "utf-8");

interface Row {
  uid: string;
  emo: string;
  ctxt: string;
  msgid: string;
}

const rows: Row[] = [];
const lines = text.split("\n");
let emo = "";
let ctxt = "";
let uid = "";
let msgid = "";
const flush = (): void => {
  if (uid && emo !== null) rows.push({ uid, emo, ctxt, msgid });
};

for (const l of lines) {
  if (l.startsWith("#. uid: ")) {
    if (uid) flush();
    uid = l.slice(8).trim();
    emo = "";
    ctxt = "";
    msgid = "";
  } else if (l.startsWith("#. emotion: ")) {
    emo = l.slice(12);
  } else if (l.startsWith("#. emotion:")) {
    emo = l.slice(11).trim();
  } else if (l.startsWith("msgctxt ")) {
    ctxt = l.slice(8).replace(/^"|"$/g, "");
  } else if (l.startsWith("msgid ") && !msgid) {
    msgid = l.slice(6).replace(/^"|"$/g, "").slice(0, 60);
  }
}
if (uid) flush();

const speech = rows.filter((r) => r.ctxt.startsWith("speaker:"));
console.log(`записей с uid: ${rows.length} | speaker:*: ${speech.length}`);

const cyr = /[Ѐ-ӿ]/;
const cjk = /[぀-ヿ가-힯一-鿿]/;
const problems: Record<string, Row[]> = {
  "кириллица в тоне": [],
  "CJK в тоне": [],
  "пустой тон": [],
  '"none"': [],
  "больше 6 слов": [],
  "1 слово (нет инструкции)": [],
  "не начинается с заглавной": [],
};
for (const r of speech) {
  const e = r.emo.trim();
  const w = e.split(/\s+/).filter(Boolean);
  if (!e) problems["пустой тон"].push(r);
  if (cyr.test(e)) problems["кириллица в тоне"].push(r);
  if (cjk.test(e)) problems["CJK в тоне"].push(r);
  if (/^none$/i.test(e)) problems['"none"'].push(r);
  if (w.length > 6) problems["больше 6 слов"].push(r);
  if (w.length === 1) problems["1 слово (нет инструкции)"].push(r);
  if (e && !/^[A-Z]/.test(e)) problems["не начинается с заглавной"].push(r);
}
console.log("\n=== нарушения правил ===");
for (const [k, v] of Object.entries(problems)) {
  console.log(`  ${String(v.length).padStart(6)}  ${k}`);
  for (const r of v.slice(0, 3)) console.log(`            «${r.emo}» <- ${r.msgid}`);
}

// однородность
const counts = new Map<string, number>();
for (const r of speech) counts.set(r.emo, (counts.get(r.emo) ?? 0) + 1);
const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]);
console.log(`\n=== однородность: ${counts.size} уникальных тонов на ${speech.length} строк ===`);
console.log("топ-8:");
for (const [e, n] of sorted.slice(0, 8)) {
  console.log(`  ${String(n).padStart(6)} (${((100 * n) / speech.length).toFixed(1)}%)  ${e}`);
}
const single = sorted.filter(([, n]) => n === 1).length;
console.log(`уникальных «один раз»: ${single} (${((100 * single) / counts.size).toFixed(0)}% словаря) — мусорный хвост?`);
const top10share = sorted.slice(0, 10).reduce((s, [, n]) => s + n, 0);
console.log(`топ-10 покрывают ${((100 * top10share) / speech.length).toFixed(1)}% строк`);
