/** Кросс-чек: имена из po (speaker-name) vs карта пола casts/gender.mts. */
import { readFileSync } from "node:fs";
import { parsePo } from "../.opencode/skills/renpy-po/po_core.mts";
import { SPEAKER_GENDER } from "../patches/ai-voice-pack/casts/gender.mts";

const entries = parsePo(readFileSync("patches/ai-voice-pack/po/ru.po", "utf-8").replace(/\r\n/g, "\n"));
const names = [...new Set(entries.filter((e) => e.msgctxt === "speaker-name" && e.msgid).map((e) => e.msgid))];
const mapKeys = Object.keys(SPEAKER_GENDER);
const inPoNotMap = names.filter((n) => !(n in SPEAKER_GENDER));
const inMapNotPo = mapKeys.filter((k) => !names.includes(k));
console.log(`имён в po (speaker-name): ${names.length}`);
console.log(`ключей в gender.mts:      ${mapKeys.length}`);
console.log(`есть в po, НЕТ в карте пола (${inPoNotMap.length}): ${inPoNotMap.join(", ") || "—"}`);
console.log(`есть в карте, НЕТ как speaker-name в po (${inMapNotPo.length}): ${inMapNotPo.slice(0, 30).join(", ")}${inMapNotPo.length > 30 ? " ..." : ""}`);
