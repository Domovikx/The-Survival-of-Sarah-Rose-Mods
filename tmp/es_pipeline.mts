/**
 * tmp/es_pipeline.mts — конвейер массового перевода es.po сабагентами.
 *
 * Сабагент-переводчик (локальная модель) пишет переводы частями в
 * tmp/es_done/parts/NNNN_K.po — БЕЗ доверия к его структуре: сборка
 * идёт по словарю (msgctxt+msgid) -> msgstr и детерминированно
 * встраивается в оригинальный слайс. Любой беспорядок/перенарезка
 * блоков моделью безвредны; отсутствующие переводы — отчёт.
 *
 *   split   — es.po -> tmp/es_slices/NNNN.po (~150 записей, порядок/EOL)
 *   status  — готовность слайсов
 *   build   — parts -> tmp/es_done/NNNN.po (словарная сборка + проверки)
 *   merge   — es.po := concat(done-слайсы вместо оригиналов) + сверка msgid
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const PO = "patches/ai-voice-pack/po/es.po";
const SLICES = "tmp/es_slices";
const DONE = "tmp/es_done";
const PARTS = join(DONE, "parts");
const PER_SLICE = 150; // записей (блоков) на слайс

interface Entry {
  msgctxt: string | null; // распарсенное значение (без кавычек)
  msgid: string; // распарсенное значение (объединённые продолжения)
  msgstr: string; // распарсенное значение
}

interface Manifest {
  eol: string;
  total: number;
  slices: { file: string; entries: number; first: string }[];
}

// ------------------------------------------------------------- парсеры ---

function blocksOf(text: string): string[] {
  return text
    .replace(/\r\n/g, "\n")
    .replace(/\n+$/, "")
    .split(/\n\n+/);
}

function unescapePo(s: string): string {
  return s.replace(/\\n/g, "\n").replace(/\\"/g, '"').replace(/\\\\/g, "\\");
}

/** Значения поля: первая строка + продолжения в кавычках, с разэскейпом. */
function fieldValue(block: string, field: string): string | null {
  const lines = block.split("\n");
  const start = lines.findIndex((l) => l.startsWith(`${field} `));
  if (start < 0) return null;
  const parts: string[] = [];
  for (let i = start; i < lines.length; i++) {
    if (i === start) parts.push(lines[i].slice(field.length + 1));
    else if (lines[i].startsWith('"')) parts.push(lines[i]);
    else break;
  }
  const joined = parts.join("").trim();
  const m = [...joined.matchAll(/"((?:[^"\\]|\\.)*)"/g)]
    .map((x) => x[1])
    .join("");
  return unescapePo(m);
}

function parseEntry(block: string): Entry {
  return {
    msgctxt: fieldValue(block, "msgctxt"),
    msgid: fieldValue(block, "msgid") ?? "",
    msgstr: fieldValue(block, "msgstr") ?? "",
  };
}

function isEmptyMsgstr(block: string): boolean {
  return fieldValue(block, "msgstr") === "";
}

/**
 * Звукоподражание/междометие («Aaah...», «Ah...», «Mmm») — по-испански
 * пишется так же: одно слово без пробелов, с гласной, либо тройная гласная,
 * либо с многоточием в конце. Настоящие непереведённые фразы содержат
 * пробелы и не оканчиваются на «...» одним словом.
 */
function isOnomatopoeia(s: string): boolean {
  if (s.length > 15 || /\s/.test(s.trim())) return false;
  const t = s.toLowerCase();
  if (/([aeiou])\1\1/.test(t)) return true;
  return /[aeiou]/.test(t) && /[.!?…]$/.test(t);
}

/**
 * Ключ перевода: (msgctxt, msgid) — как в gettext.
 * Нормализация только для СОПОСТАВЛЕНИЯ: модель часто «чинит» типографские
 * апострофы/кавычки (U+2019→') — в вывод msgid берётся из оригинала слайса,
 * так что терпимость к ключу ничего не ломает.
 */
function normKey(s: string): string {
  return s
    .replace(/[‘’‚′]/g, "'")
    .replace(/[“”„]/g, '"')
    .replace(/\u00a0/g, " ");
}
function keyOf(e: Entry): string {
  return `${normKey(e.msgctxt ?? "")} ${normKey(e.msgid)}`;
}

/** Модель ломает кавычку: `msgstr ""Текст` вместо `msgstr "Текст"`. */
function repairPartText(t: string): string {
  return t.replace(/^msgstr ""(?!$)(?=[^"\r\n])/gm, 'msgstr "');
}

// --------------------------------------------------------------- split ---

function split(): void {
  const text = readFileSync(PO, "utf8");
  const eol = text.includes("\r\n") ? "\r\n" : "\n";
  const blocks = blocksOf(text);
  const header = blocks[0];
  const entries = blocks.slice(1);
  mkdirSync(SLICES, { recursive: true });
  mkdirSync(PARTS, { recursive: true });

  const slices: Manifest["slices"] = [];
  let idx = 0;
  for (let i = 0; i < entries.length; i += PER_SLICE) {
    const chunk = entries.slice(i, i + PER_SLICE);
    const name = `${String(++idx).padStart(4, "0")}.po`;
    const body = (idx === 1 ? [header, ...chunk] : chunk).join("\n\n") + "\n";
    writeFileSync(join(SLICES, name), body.split("\n").join(eol), "utf8");
    slices.push({ file: name, entries: chunk.length, first: fieldValue(chunk[0], "msgid")?.slice(0, 60) ?? "" });
  }
  const man: Manifest = { eol, total: entries.length, slices };
  writeFileSync(join(SLICES, "manifest.json"), JSON.stringify(man, null, 2), "utf8");
  console.log(`слайсов: ${slices.length}, записей: ${entries.length}, EOL: ${eol === "\r\n" ? "CRLF" : "LF"}`);
}

// ---------------------------------------------------------------- build ---

/** Собрать части одного слайса -> done-файл детерминированно. */
function buildSlice(id: string): { ok: boolean; translated: number; missing: number; overlaps: number; problems: string[] } {
  const origPath = join(SLICES, `${id}.po`);
  if (!existsSync(origPath)) return { ok: false, translated: 0, missing: 0, overlaps: 0, problems: ["нет слайса-оригинала"] };
  const origBlocks = blocksOf(readFileSync(origPath, "utf8"));

  // Словарь переводов из ВСЕХ частей слайса (модель может нарезать как угодно)
  const dict = new Map<string, string>();
  const problems: string[] = [];
  const partFiles = existsSync(PARTS)
    ? readdirSync(PARTS)
        .filter((f) => f.startsWith(`${id}_`))
        .sort()
    : [];
  if (partFiles.length === 0) return { ok: false, translated: 0, missing: 0, overlaps: 0, problems: ["нет частей"] };
  let overlaps = 0;
  for (const f of partFiles) {
    for (const b of blocksOf(repairPartText(readFileSync(join(PARTS, f), "utf8")))) {
      const e = parseEntry(b);
      if (e.msgid === "" && e.msgctxt === null) continue; // заголовок/мусор
      if (e.msgstr === "") continue;
      const k = keyOf(e);
      const prev = dict.get(k);
      // Перекрытие частей (модель повторяет записи) — не брак: берём первый
      if (prev !== undefined && prev !== e.msgstr) overlaps++;
      else dict.set(k, e.msgstr);
    }
  }

  // Детерминированная вставка в оригинал. Заголовок (msgid "") есть только
  // в слайсе 0001 — определяем по пустому msgid, а не по позиции
  const hasHeader = fieldValue(origBlocks[0], "msgid") === "";
  const out: string[] = hasHeader ? [origBlocks[0]] : [];
  let translated = 0;
  let missing = 0;
  for (let i = hasHeader ? 1 : 0; i < origBlocks.length; i++) {
    const b = origBlocks[i];
    if (!isEmptyMsgstr(b)) {
      out.push(b); // уже готовый перевод — не трогаем
      continue;
    }
    const e = parseEntry(b);
    const es = dict.get(keyOf(e));
    if (es === undefined) {
      missing++;
      out.push(b);
      continue;
    }
    // msgstr == msgid допустимо: звукоподражания, имена-реплики
    // («Alaric» — имя не переводится) и label-спикеры
    const sameOk = isOnomatopoeia(e.msgid) || e.msgctxt === "speaker-name" || /^[A-Z][a-zà-ü'’-]+$/.test(e.msgid);
    if (es === e.msgid && !sameOk) problems.push(`msgstr == msgid: «${e.msgid.slice(0, 60)}»`);
    const esc = es.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n");
    // Перевод подставляется ТОЛЬКО в msgstr; комментарии/контекст/оригинал — из слайса
    const lines = b.split("\n");
    const si = lines.findIndex((l) => l.startsWith("msgstr "));
    out.push(`${lines.slice(0, si).join("\n")}\nmsgstr "${esc}"`);
    translated++;
  }
  writeFileSync(join(DONE, `${id}.po`), `${out.join("\n\n")}\n`, "utf8");
  return { ok: missing === 0 && problems.length === 0, translated, missing, overlaps, problems };
}

function buildCmd(prefix?: string): number {
  const man = JSON.parse(readFileSync(join(SLICES, "manifest.json"), "utf8")) as Manifest;
  const ids = man.slices
    .map((s) => s.file.replace(/\.po$/, ""))
    .filter((id) => !prefix || id.startsWith(prefix));
  let built = 0;
  let bad = 0;
  for (const id of ids) {
    const hasParts = existsSync(PARTS) && readdirSync(PARTS).some((f) => f.startsWith(`${id}_`));
    if (!hasParts) continue; // слайс ещё не озвучен сабагентом
    const r = buildSlice(id);
    built++;
    if (r.ok) console.log(`${id}: OK (переведено ${r.translated}${r.overlaps > 0 ? `, перекрытий частей: ${r.overlaps}` : ""})`);
    else {
      bad++;
      console.log(`${id}: BAD (переведено ${r.translated}, не хватает ${r.missing})`);
      for (const p of r.problems.slice(0, 10)) console.log(`    ${p}`);
    }
  }
  console.log(`собрано слайсов: ${built}, битых: ${bad}`);
  return bad === 0 ? 0 : 1;
}

// -------------------------------------------------------------- missing ---

/**
 * Выгрузить непереведённые записи слайса в tmp/es_missing/NNNN.po
 * (формат слайса, пустые msgstr) — для точечного повтора сабагентом.
 * Собранные словари частей при этом сохраняются: повтор только ДОПИСЫВАЕТ.
 */
function missingCmd(id?: string): void {
  if (!id) {
    console.log("usage: es_pipeline.mts missing NNNN");
    return;
  }
  const origPath = join(SLICES, `${id}.po`);
  if (!existsSync(origPath)) {
    console.log(`нет слайса ${id}`);
    return;
  }
  const origBlocks = blocksOf(readFileSync(origPath, "utf8"));
  // Какие ключи уже есть в частях
  const dict = new Set<string>();
  if (existsSync(PARTS)) {
    for (const f of readdirSync(PARTS).filter((x) => x.startsWith(`${id}_`))) {
      for (const b of blocksOf(repairPartText(readFileSync(join(PARTS, f), "utf8")))) {
        const e = parseEntry(b);
        if (e.msgstr !== "") dict.add(keyOf(e));
      }
    }
  }
  const missing: string[] = [];
  for (let i = 1; i < origBlocks.length; i++) {
    const b = origBlocks[i];
    if (!isEmptyMsgstr(b)) continue;
    if (dict.has(keyOf(parseEntry(b)))) continue;
    missing.push(b);
  }
  mkdirSync("tmp/es_missing", { recursive: true });
  writeFileSync(join("tmp/es_missing", `${id}.po`), `${missing.join("\n\n")}\n`, "utf8");
  console.log(`missing ${id}: ${missing.length} записей -> tmp/es_missing/${id}.po`);
}

// -------------------------------------------------------------- status ---

function statusCmd(): void {
  const man = JSON.parse(readFileSync(join(SLICES, "manifest.json"), "utf8")) as Manifest;
  const doneFiles = new Set(readdirSync(DONE).filter((f) => f.endsWith(".po")));
  let doneSlices = 0;
  let doneEntries = 0;
  const bad: string[] = [];
  for (const s of man.slices) {
    if (!doneFiles.has(s.file)) continue;
    doneSlices++;
    doneEntries += s.entries;
    const id = s.file.replace(/\.po$/, "");
    const hasParts = existsSync(PARTS) && readdirSync(PARTS).some((f) => f.startsWith(`${id}_`));
    if (!hasParts) {
      // Слайс без частей = скопированный готовый: проверяем на пустые msgstr
      const blocks = blocksOf(readFileSync(join(DONE, s.file), "utf8"));
      const start = fieldValue(blocks[0], "msgid") === "" ? 1 : 0;
      const empties = blocks.slice(start).filter(isEmptyMsgstr).length;
      if (empties > 0) bad.push(s.file);
      continue;
    }
    const r = buildSlice(id);
    if (!r.ok) bad.push(s.file);
  }
  console.log(`слайсов готово: ${doneSlices}/${man.slices.length}`);
  console.log(`записей в done-слайсах: ${doneEntries}/${man.total}`);
  if (bad.length > 0) console.log(`битые (пересобрать): ${bad.slice(0, 20).join(", ")}${bad.length > 20 ? ` …+${bad.length - 20}` : ""}`);
}

// --------------------------------------------------------------- merge ---

function mergeCmd(): void {
  const man = JSON.parse(readFileSync(join(SLICES, "manifest.json"), "utf8")) as Manifest;
  const origBlocks = blocksOf(readFileSync(PO, "utf8"));
  let out = "";
  let usedDone = 0;
  for (const s of man.slices) {
    const id = s.file.replace(/\.po$/, "");
    const donePath = join(DONE, s.file);
    const hasParts = existsSync(PARTS) && readdirSync(PARTS).some((f) => f.startsWith(`${id}_`));
    let usable = existsSync(donePath);
    if (usable && hasParts) usable = buildSlice(id).ok;
    if (usable && !hasParts) {
      const blocks = blocksOf(readFileSync(donePath, "utf8"));
      const start = fieldValue(blocks[0], "msgid") === "" ? 1 : 0;
      usable = blocks.slice(start).every((b) => !isEmptyMsgstr(b));
    }
    let text: string;
    if (usable) {
      text = readFileSync(donePath, "utf8");
      usedDone++;
    } else {
      text = readFileSync(join(SLICES, s.file), "utf8");
    }
    out += text.endsWith("\n") ? text : `${text}\n`;
  }
  const mergedBlocks = blocksOf(out);
  if (mergedBlocks.length !== origBlocks.length) {
    console.error(`СТОП: блоков ${mergedBlocks.length}, ожидалось ${origBlocks.length} — merge отменён`);
    return;
  }
  for (let i = 0; i < origBlocks.length; i++) {
    if (fieldValue(origBlocks[i], "msgid") !== fieldValue(mergedBlocks[i], "msgid")) {
      console.error(`СТОП: msgid блока ${i + 1} не совпадает с оригиналом — merge отменён`);
      return;
    }
  }
  const stillEmpty = mergedBlocks.slice(1).filter(isEmptyMsgstr).length;
  const final = man.eol === "\r\n" ? out.split("\n").join("\r\n") : out;
  writeFileSync(PO, final, "utf8");
  console.log(`merged: done-слайсов ${usedDone}/${man.slices.length}, записей ${mergedBlocks.length - 1}, пустых msgstr: ${stillEmpty}`);
}

// ---------------------------------------------------------------- main ---

const [cmd, arg] = process.argv.slice(2);
switch (cmd) {
  case "split":
    split();
    break;
  case "build":
    process.exitCode = buildCmd(arg);
    break;
  case "missing":
    missingCmd(arg);
    break;
  case "status":
    statusCmd();
    break;
  case "merge":
    mergeCmd();
    break;
  default:
    console.log("usage: es_pipeline.mts split|build [NNNN]|missing NNNN|status|merge");
    process.exitCode = 1;
}
