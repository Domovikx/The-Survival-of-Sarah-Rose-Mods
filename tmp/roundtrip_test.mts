/**
 * tmp/roundtrip_test.mts — безопасность записи: parsePo+renderPo должен
 * давать байт-в-байт тот же файл (иначе боевой переводчик не может через
 * renderPo переписывать po-файлы). CRLF нормализуется перед анализом.
 */
import { readFileSync } from "node:fs";
import { parsePo, renderPo } from "../.opencode/skills/renpy-po/po_core.mts";

for (const lang of ["es", "ru", "de", "fr", "it", "ja", "ko", "pl", "pt", "zh"]) {
  const p = `patches/ai-voice-pack/po/${lang}.po`;
  const text = readFileSync(p, "utf-8").replace(/\r\n/g, "\n");
  const lines = text.split("\n");
  const headerEnd = lines.findIndex((l, i) => i > 0 && l === "");
  const header = lines.slice(0, headerEnd);
  const entries = parsePo(text).filter((e) => e.msgid);
  const out = renderPo(entries, header);
  if (text === out) {
    console.log(`${lang}: round-trip ИДЕНТИЧЕН (${entries.length} записей)`);
    continue;
  }
  const al = text.split("\n"), bl = out.split("\n");
  let first = -1;
  for (let i = 0; i < Math.max(al.length, bl.length); i++)
    if (al[i] !== bl[i]) { first = i; break; }
  console.log(`${lang}: РАСХОЖДЕНИЕ со строки ${first + 1} (строк ${al.length} vs ${bl.length})`);
  for (let i = Math.max(0, first - 2); i < first + 3; i++)
    console.log(`  ${i + 1} было:${JSON.stringify(al[i])}\n     стало:${JSON.stringify(bl[i])}`);
}
