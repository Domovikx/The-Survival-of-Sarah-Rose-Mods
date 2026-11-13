import { readFileSync, writeFileSync } from "node:fs";
import { parsePo } from "../.opencode/skills/renpy-po/po_core.mts";
const entries = parsePo(readFileSync("patches/ai-voice-pack/po/ru.po", "utf-8")).filter((e) => e.msgid);
const pool = entries.map((e, i) => (e.msgstr.trim() ? i : -1)).filter((i) => i >= 0);
// Детерминированный ЛКГ: выборка воспроизводима, но не привязана к порядку файла.
let s = 20261113;
const rnd = (): number => (s = (s * 1103515245 + 12345) % 2147483648) / 2147483648;
const pick = new Set<number>();
while (pick.size < 300) pick.add(pool[Math.floor(rnd() * pool.length)]!);
const idx = [...pick].sort((a, b) => a - b);
writeFileSync("tmp/ru_sample300.txt", idx.join("\n") + "\n");
console.log("выборка:", idx.length, "из", pool.length, "переведённых строк");
