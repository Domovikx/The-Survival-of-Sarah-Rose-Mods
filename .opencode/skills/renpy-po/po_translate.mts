/**
 * po_translate.mts — батч-перевод po/<lang>.po через локальную LLM (LM Studio).
 *
 * Тот же поход, что пилот в opencode: batch N записей -> один запрос
 * (массив JSON-строк) -> запись msgstr. Резюмабельно: перезапуск берёт только
 * пустые msgstr. Сохранение каждые 4 батча (защита от kill).
 *
 * Скилл-контракт перевода — skill-translate-es-po (лексикон в SYSTEM_PROMPT;
 * держать в синхроне). Контекст по фразе (спикер/тон) — из template.pot по
 * ключу msgctxt+msgid.
 *
 * Запуск:
 *   node .opencode/skills/renpy-po/po_translate.mts --lang es --limit 500
 *   (env: TSSR_LM_URL, TSSR_LM_MODEL, TSSR_LM_THINK=1)
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

import { parsePo, renderPo, type PoEntry } from "./po_core.mts";
import { poHeaderLines } from "./po_update.mts";

const SKILL_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(SKILL_DIR, "..", "..", "..");
const PO_DIR = join(REPO_ROOT, "patches", "ai-voice-pack", "po");

const LM_URL = process.env.TSSR_LM_URL ?? "http://127.0.0.1:1234/v1/chat/completions";
const LM_MODEL = process.env.TSSR_LM_MODEL ?? "qwen/qwen3.5-9b";
const THINK = process.env.TSSR_LM_THINK === "1";

const SYSTEM_PROMPT = `You are translating an adult (18+) erotic visual novel from English into neutral Spanish (tense informal second person: Spain, and Latin America). Style: literary, explicit, inimitable — not medical, not euphemistic, not softened. Translate ALL meanings and connotations.

Core dictionary: sex = follar/sexo, fuck = follar (in dialogue "¡Fóllame!" etc.), cock = polla/verga (alternate, don't repeat one word 3 times in a row), dick = polla/verga (alternate), pussy = chocho/concha, cunt = coño, ass = culo, tits = tetas/senOS, balls = huevos, come = correrse, make love = hacer el amor, naked = desnudo, naked woman = desnuda, wet = mojada, nipples = pezones, clitoris = clítoris, orgasm = orgasmo.

REGULAR WORDS NOT TO TRANSLATE AS OBSCENE: fuck around = salir de juicio, fuck up = cagarla, fuck you = jódete/que te jodan, shit = mierda (not "puta"), etc.

SYNONYM RULES AND STYLES: "to fuck" = follar, "fucking awesome" = jodidamente/flipantemente, "what the fuck?" = "¿Qué narices?" (Spain) / "¿Qué carajo?" (LatAm); "bullshit" = "¡Qué gilipolleces!" (Spain) / "¡Qué pendejadas!" (LatAm); "asshole" = "cabrón" (Spain) / "pendejo" (LatAm). Choose one style (Spain or LatAm) and keep it consistent throughout the scene.

Use strong literary words, not euphemisms. Keep names, titles, oaths and interjections; transfer the author's style — sarcasm, irony, pathos, abruptness — and the intensity of the scene (gasp = jadeo, moan = gemido, etc.). Translate dialogue naturally and dynamically, not stiffly. Narration is expressive literary prose. You may adapt idioms to Spanish equivalents if the literal meaning of the idiom is lost.

FORMAT: return ONLY a JSON array of strings, in the same order, no numbering, no extra text. Do not leave any string untranslated.

IMPORTANT: respond ONLY in JSON. Do not use any tools. Do not output code blocks, do not output anything except the JSON array.`;

interface Pending {
  entry: PoEntry;
  speaker: string;
  emotion: string | null;
}

function key(e: PoEntry): string {
  return `${e.msgctxt}\u0000${e.msgid}`;
}

async function askLm(user: string): Promise<string[]> {
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const res = await fetch(LM_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: LM_MODEL,
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            { role: "user", content: user },
          ],
          temperature: 0.3,
          max_tokens: 12000,
          stream: true,
          ...(THINK ? {} : { reasoning_effort: "none" }),
        }),
        signal: AbortSignal.timeout(600_000),
      });
      if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);
      // SSE: content-чанки одного ответа склеиваем; thinking отбрасываем
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      let content = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const data = line.slice(6).trim();
          if (data === "[DONE]") continue;
          try {
            const delta = JSON.parse(data)?.choices?.[0]?.delta?.content;
            if (typeof delta === "string") content += delta;
          } catch {
            // не-JSON-хвост потока — пропускаем
          }
        }
      }
      const m = content.match(/\[[\s\S]*\]/);
      if (!m) throw new Error(`нет JSON-массива в ответе: ${content.slice(0, 120)}`);
      // модель оборачивает в ```json или выдаёт объекты вместо строк — чиним
      const cleaned = m[0].replace(/,\s*\]$/, "]");
      let arr: unknown = JSON.parse(cleaned);
      if (Array.isArray(arr) && arr.every((x) => x && typeof x === "object")) {
        arr = arr.map((x: Record<string, unknown>) => Object.values(x).find((v) => typeof v === "string"));
      }
      if (Array.isArray(arr) && arr.every((x) => typeof x === "string" && x.trim()) && arr.length > 0) {
        return arr.map((x) => x.trim());
      }
      throw new Error(`массив не строк или пуст: ${JSON.stringify(arr).slice(0, 300)}`);
    } catch (err) {
      console.warn(`  [попытка ${attempt}/2] ${err instanceof Error ? err.message : err}`);
    }
  }
  return [];
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    args: process.argv.slice(2),
    options: {
      "lang": { type: "string" },
      "limit": { type: "string" },
      "batch": { type: "string" },
      "dry-run": { type: "boolean" },
    },
  });
  const lang = values.lang ?? "es";
  const limit = values.limit ? parseInt(values.limit, 10) : Infinity;
  const batchSize = values.batch ? parseInt(values.batch, 10) : 16;
  const poPath = join(PO_DIR, `${lang}.po`);
  const potPath = join(PO_DIR, "template.pot");

  const potMeta = new Map<string, { speaker: string; emotion: string | null }>();
  for (const e of parsePo(readFileSync(potPath, "utf8"))) {
    if (!e.msgid) continue;
    const comment = (p: string): string | null => {
      const c = e.comments.find((x) => x.startsWith(p));
      return c ? c.slice(p.length).trim() : null;
    };
    potMeta.set(key(e), { speaker: e.msgctxt, emotion: comment("emotion:") });
  }

  const poText = readFileSync(poPath, "utf8");
  const headerLines = poHeaderLines(poText);
  const entries = parsePo(poText).filter((e) => e.msgid);
  const pending: Pending[] = entries
    .filter((e) => !e.msgstr)
    .map((e) => {
      const meta = potMeta.get(key(e)) ?? { speaker: e.msgctxt, emotion: null };
      return { entry: e, speaker: meta.speaker, emotion: meta.emotion };
    })
    .slice(0, limit);

  console.log(
    `${lang}.po: пустых записей к переводу: ${pending.length}` +
      ` (батч ${batchSize}, LM ${LM_MODEL}${THINK ? ", thinking" : ""})`,
  );
  if (values["dry-run"] || pending.length === 0) {
    for (const p of pending.slice(0, 5)) console.log(`  ${p.entry.msgid.slice(0, 80)}`);
    return;
  }

  const save = (): void => {
    writeFileSync(poPath, renderPo(entries, headerLines));
  };
  const SAVE_EVERY = 4; // батча
  let done = 0;
  let failedBatches = 0;

  for (let i = 0; i < pending.length; i += batchSize) {
    const batch = pending.slice(i, i + batchSize);
    const payload = JSON.stringify(
      batch.map((p, j) => ({
        i: j,
        speaker: p.speaker,
        emotion: p.emotion,
        text: p.entry.msgid,
      })),
      null,
      0,
    );
    const out = await askLm(payload);
    if (out.length === batch.length) {
      batch.forEach((p, j) => {
        p.entry.msgstr = out[j];
      });
      done += batch.length;
    } else {
      failedBatches += 1;
      console.warn(`  батч ${i} пропущен (${out.length} из ${batch.length})`);
    }
    console.log(`[${Math.min(i + batchSize, pending.length)}/${pending.length}] ok=${done} fail=${failedBatches}`);
    if ((i / batchSize) % SAVE_EVERY === SAVE_EVERY - 1) save();
  }
  save();
  console.log(`готово: переведено ${done}, потеряно батчей ${failedBatches} (перезапуск доберёт)`);
}

await main();
