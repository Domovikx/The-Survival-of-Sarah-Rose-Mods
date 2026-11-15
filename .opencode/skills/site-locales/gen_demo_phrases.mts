/**
 * gen_demo_phrases.mts — СБОРКА демо-блока сайта из переводов игры.
 *
 * Демо-фразы («Послушайте, как это звучит») — ОТДЕЛЬНЫЙ кейс, не общий каталог
 * сайта (`i18n.locales.ts`). Их перевод — это перевод игры: он берётся строго
 * из `patches/ai-voice-pack/po/<lang>.po`, потому что из этих же msgstr
 * сгенерирован звук (uid = md5 английского текста). Правка «по вкусу» на сайте
 * означала бы: на странице один текст, в наушниках другой.
 *
 * Источник английского и порядок — `demo-manifest.json` рядом с этим скриптом
 * (он же держит uid для имён файлов аудио).
 *
 * Запуск (из корня репы):
 *   node .opencode/skills/site-locales/gen_demo_phrases.mts
 */
import { readFileSync, writeFileSync } from "node:fs";

const MANIFEST = ".opencode/skills/site-locales/demo-manifest.json";
const PO = "patches/ai-voice-pack/po";
const OUT = "site/src/widgets/demo/ui/DemoPhrases.phrases.ts";

/** Все языки в порядке приоритета (en первым: он же ключ/фолбэк). */
const LANGS = ["en", "zh", "ru", "es", "pt", "de", "ja", "fr", "pl", "ko", "it"] as const;
type Lang = (typeof LANGS)[number];

type Manifest = { phrases: Array<{ uid: string; speaker: string; text: string }> };

/** msgid -> msgstr для одного po-файла. */
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

const manifest = JSON.parse(readFileSync(MANIFEST, "utf-8")) as Manifest;
if (!manifest.phrases.length) throw new Error("manifest.json: нет фраз");

const translations = new Map<Lang, Map<string, string>>();
for (const lang of LANGS) translations.set(lang, lang === "en" ? new Map() : readPo(lang));

const missing: string[] = [];
const block = (values: Map<Lang, string>): string =>
  `{\n${LANGS.map((lang) => `      ${lang}: ${JSON.stringify(values.get(lang)!)},`).join("\n")}\n    }`;

const phrases = manifest.phrases.map((phrase, index) => {
  const speaker = new Map<Lang, string>();
  const text = new Map<Lang, string>();
  for (const lang of LANGS) {
    if (lang === "en") {
      speaker.set(lang, phrase.speaker);
      text.set(lang, phrase.text);
      continue;
    }
    const po = translations.get(lang)!;
    const speakerValue = po.get(phrase.speaker);
    const textValue = po.get(phrase.text);
    if (!speakerValue) missing.push(`${lang}: имя спикера «${phrase.speaker}»`);
    if (!textValue) missing.push(`${lang}: фраза #${index + 1} «${phrase.text.slice(0, 40)}…»`);
    speaker.set(lang, speakerValue ?? phrase.speaker);
    text.set(lang, textValue ?? phrase.text);
  }
  return `  {\n    uid: ${JSON.stringify(phrase.uid)},\n    speaker: ${block(speaker)},\n    text: ${block(text)},\n  },`;
});

if (missing.length) {
  console.error("НЕТ ПЕРЕВОДА В PO (сначала переведите, потом генерируйте):");
  for (const item of missing) console.error(`  - ${item}`);
  process.exit(1);
}

const file = `/**
 * СГЕНЕРИРОВАНО — руками не править.
 *
 * Демо-фразы сайта — ОТДЕЛЬНЫЙ кейс переводов: они берутся строго из
 * \`patches/ai-voice-pack/po/<lang>.po\` (из этих msgstr сгенерирован звук,
 * uid = md5 английского текста). Общий каталог сайта (\`i18n.locales.ts\`)
 * их не содержит — чтобы UI-переводы и игровые реплики не путались.
 *
 * Перегенерация: node .opencode/skills/site-locales/gen_demo_phrases.mts
 * Порядок фраз и uid — \`demo-manifest.json\` (рядом с gen_demo_phrases.mts).
 * Соответствие po стережёт \`site/e2e/demo.spec.ts\`.
 */
import type { Lang } from "@/shared/config/languages";

export type DemoPhrase = {
  /** uid = md5(английского текста) — имя файла аудио. */
  uid: string;
  /** Имя спикера по языкам (из po). */
  speaker: Record<Lang, string>;
  /** Текст реплики по языкам (из po). */
  text: Record<Lang, string>;
};

export const DEMO_PHRASES: readonly DemoPhrase[] = [
${phrases.join("\n")}
];
`;

writeFileSync(OUT, file, "utf-8");
console.log(`phrases.ts: фраз ${phrases.length}, языков ${LANGS.length}`);
