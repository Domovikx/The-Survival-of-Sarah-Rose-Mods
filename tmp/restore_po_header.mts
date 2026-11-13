import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";

const LANGS = ["es", "it", "ja", "ko", "pl", "pt", "zh"];
for (const lang of LANGS) {
  const rel = `patches/ai-voice-pack/po/${lang}.po`;
  const head = execFileSync("git", ["show", `HEAD:${rel}`], { encoding: "utf-8", maxBuffer: 64 << 20 })
    .replace(/\r\n/gu, "\n")
    .split("\n");
  const cur = readFileSync(rel, "utf-8").replace(/\r\n/gu, "\n").split("\n");

  // В HEAD после основного заголовка идёт дубль-блок «файл забронирован».
  const h = head.findIndex((l) => l === 'msgid ""');
  let afterHeader = head.indexOf("", h);
  while (head[afterHeader] === "") afterHeader++;
  let blockEnd = head.indexOf("", afterHeader);
  const block = head.slice(afterHeader, blockEnd);
  if (!block[0]?.startsWith("# TSSR") || !block.some((l) => l.startsWith("msgstr "))) {
    console.log(`${lang}: дубль-блока нет — пропуск`);
    continue;
  }
  // Уже восстановлен?
  if (cur.join("\n").includes(block.join("\n"))) {
    console.log(`${lang}: блок уже есть`);
    continue;
  }
  const c = cur.findIndex((l) => l.startsWith("msgctxt "));
  if (c < 0) throw new Error(`${lang}: нет msgctxt`);
  cur.splice(c, 0, ...block, "");
  writeFileSync(rel, cur.join("\n"), "utf-8");
  console.log(`${lang}: восстановлен блок из ${block.length} строк`);
}
