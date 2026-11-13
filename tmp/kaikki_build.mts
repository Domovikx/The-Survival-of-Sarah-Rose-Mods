import { createReadStream, writeFileSync } from "node:fs";
import { createInterface } from "node:readline";

const SRC = process.argv[2]!;
const OUT = process.argv[3]!;
const REG = new Set(["vulgar", "slang", "colloquial", "childish", "derogatory", "euphemistic", "offensive", "informal"]);
const SEX = new Set(["sexuality", "sex", "anatomy", "pornography", "bdsm", "prostitution", "lgbt", "physiology"]);
// Английские «телесные» слова в толковании = надёжный признак, что слово из этого слоя.
const BODY =
  /\b(pussy|cunt|twat|vagina|vulva|labia|clitoris|penis|cock|dick|prick|phallus|testicles|scrotum|balls|semen|sperm|cum|ejaculat\w*|orgasm\w*|intercourse|coitus|fuck\w*|sodom\w*|anal|anally|buttocks|butt|arse|ass|anus|rectum|nipples?|breasts?|bosom|genitals?|genitalia|groin|crotch|pubic|masturbat\w*|blowjob|handjob|prostitut\w*|whore|slut|bitch|brothel|erection|arous\w*)\b/i;
const strip = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "");

const rows: string[] = [];
const rl = createInterface({ input: createReadStream(SRC, "utf-8"), crlfDelay: Infinity });
let total = 0;
for await (const line of rl) {
  total++;
  let e: any;
  try {
    e = JSON.parse(line);
  } catch {
    continue;
  }
  const senses: any[] = e.senses ?? [];
  for (const s of senses) {
    const tags: string[] = s.tags ?? [];
    const topics: string[] = s.topics ?? [];
    const gloss = (s.glosses ?? []).join("; ");
    const reg = tags.filter((t) => REG.has(t));
    const sexTopic = topics.some((t) => SEX.has(t));
    const bodyGloss = BODY.test(gloss);
    if (reg.length === 0 && !sexTopic) continue;
    if (!sexTopic && !bodyGloss) continue;
    rows.push([strip(e.word), e.pos ?? "", reg.join(","), topics.filter((t) => SEX.has(t)).join(","), gloss].join("\t"));
  }
}
writeFileSync(OUT, rows.join("\n") + "\n", "utf-8");
console.log(`${SRC}: записей ${total} -> отобрано смыслов ${rows.length} (${OUT})`);
