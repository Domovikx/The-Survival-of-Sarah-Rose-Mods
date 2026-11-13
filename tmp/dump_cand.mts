import { readFileSync } from "node:fs";
import { parsePo } from "../.opencode/skills/renpy-po/po_core.mts";

const TERMS = ["половые органы","половой орган","половых органов","влагалищ","вагин","пенис","фаллос","эякуляц","семяизверж","копуляц","половой акт","половом акте","мастурбац","клитор","анус","промежност","лобок","эрекц","оральн","анальн","вагинальн","генитал","мошонк","яичник","матк"];
const e = parsePo(readFileSync("patches/ai-voice-pack/po/ru.po","utf-8")).filter(x=>x.msgid);
const hit = e.filter(x => { const l = x.msgstr.toLowerCase(); return TERMS.some(t=>l.includes(t)); });
console.log("всего", e.length, "| кандидатов", hit.length);
// распределение по термину
const cnt = new Map<string, number>();
for (const x of hit) for (const t of TERMS) if (x.msgstr.toLowerCase().includes(t)) cnt.set(t, (cnt.get(t)??0)+1);
console.log([...cnt].sort((a,b)=>b[1]-a[1]).map(([t,n])=>`${t}:${n}`).join("  "));
const idx = process.argv[2] ? Number(process.argv[2]) : 0;
for (const x of hit.slice(idx, idx+14)) console.log(`---\nEN: ${x.msgid}\nRU: ${x.msgstr}`);
