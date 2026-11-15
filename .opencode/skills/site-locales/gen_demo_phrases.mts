/**
 * gen_demo_phrases.mts — СБОРКА демо-блока сайта из переводов игры.
 *
 * Демо-фразы — не общий каталог сайта: их текст и имя спикера берутся строго из
 * `patches/ai-voice-pack/po/<lang>.po` (из этих msgstr сделан звук,
 * uid = md5 английского текста). Порядок и английский — `demo-manifest.json`.
 *
 * Запуск (из корня репы):
 *   node .opencode/skills/site-locales/gen_demo_phrases.mts
 */
import { readFileSync, writeFileSync } from "node:fs";

const MANIFEST = ".opencode/skills/site-locales/demo-manifest.json";
const PO = "patches/ai-voice-pack/po";
const OUT = "site/src/widgets/demo/ui/DemoPhrases.phrases.ts";

const LANGS = ["en", "zh", "ru", "es", "pt", "de", "ja", "fr", "pl", "ko", "it"] as const;
type Lang = (typeof LANGS)[number];

type Manifest = { phrases: Array<{ uid: string; speaker: string; text: string }> };

const readPo = (lang: Lang): Map<string, string> => {
  const map = new Map<string, string>();
  const lines = readFileSync(`${PO}/${lang}.po`, "utf-8").split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    if (!lines[i]!.startsWith("msgid ")) continue;
    const id = JSON.parse(lines[i]!.slice(6).trim()) as string;
    const next = lines[i + 1] ?? "";
    if (next.startsWith("msgstr ")) map.set(id, JSON.parse(next.slice(7).trim()) as string);
  }
  return map;
};

/** Прежние значения из phrases.ts: нужны, пока в po для языка перевода нет. */
const readPrevious = (): Map<string, string> => {
  const previous = new Map<string, string>();
  let old = "";
  try {
    old = readFileSync(OUT, "utf-8");
  } catch {
    return previous;
  }
  const chunks = old.split(/\n  \{\n/).slice(1);
  for (const chunk of chunks) {
    const uid = /uid: "([^"]+)"/.exec(chunk)?.[1];
    if (!uid) continue;
    for (const field of ["speaker", "text"] as const) {
      const block = new RegExp(`${field}: \\{([\\s\\S]*?)\\n    \\}`).exec(chunk)?.[1] ?? "";
      for (const m of block.matchAll(/(\w+): "((?:[^"\\]|\\.)*)"/g)) {
        previous.set(`${uid}|${field}|${m[1]}`, JSON.parse(`"${m[2]}"`) as string);
      }
    }
  }
  return previous;
};

const manifest = JSON.parse(readFileSync(MANIFEST, "utf-8")) as Manifest;
if (!manifest.phrases.length) throw new Error("demo-manifest.json: нет фраз");

const previous = readPrevious();
const po = new Map<Lang, Map<string, string>>();
for (const lang of LANGS) po.set(lang, lang === "en" ? new Map() : readPo(lang));

const block = (values: Map<Lang, string>): string =>
  `{\n${LANGS.map((lang) => `      ${lang}: ${JSON.stringify(values.get(lang)!)} ,`).join("\n")}\n    }`;

const pending: string[] = [];
const phrases = manifest.phrases.map((phrase, index) => {
  const speaker = new Map<Lang, string>();
  const text = new Map<Lang, string>();
  for (const lang of LANGS) {
    if (lang === "en") {
      speaker.set(lang, phrase.speaker);
      text.set(lang, phrase.text);
      continue;
    }
    const dict = po.get(lang)!;
    const pick = (field: "speaker" | "text", english: string): string => {
      const fromPo = dict.get(english)?.trim();
      if (fromPo) return fromPo;
      const old = previous.get(`${phrase.uid}|${field}|${lang}`);
      if (old) {
        pending.push(`${lang}: ${field} #${index + 1} — в po пока пусто, оставлено прежнее`);
        return old;
      }
      pending.push(`${lang}: ${field} #${index + 1} — НЕТ ПЕРЕВОДА (осталось английское)`);
      return english;
    };
    speaker.set(lang, pick("speaker", phrase.speaker));
    text.set(lang, pick("text", phrase.text));
  }
  return `  {\n    uid: ${JSON.stringify(phrase.uid)},\n    speaker: ${block(speaker)},\n    text: ${block(text)},\n  },`;
});

const file = `/**
 * СГЕНЕРИРОВАНО — руками не править.
 *
 * Источник: \`patches/ai-voice-pack/po/<lang>.po\` (тексты и имена спикеров) и
 * \`demo-manifest.json\` (uid и английский). Перегенерация:
 * \`node .opencode/skills/site-locales/gen_demo_phrases.mts\`.
 */
import type { Lang } from "@/shared/config";

export type DemoPhrase = {
  uid: string;
  speaker: Record<Lang, string>;
  text: Record<Lang, string>;
};

export const DEMO_PHRASES: readonly DemoPhrase[] = [
${phrases.join("\n")}
];
`;

writeFileSync(OUT, file, "utf-8");
console.log(`phrases.ts: фраз ${phrases.length}`);
if (pending.length) {
  console.warn("не всё из po (язык ещё переводится):");
  for (const item of pending.slice(0, 10)) console.warn(`  - ${item}`);
}
