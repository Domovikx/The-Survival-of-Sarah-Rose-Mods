/**
 * po_core.mts — PO/POT: парсинг, рендер, экранирование + normalizeText.
 *
 * Порт проверенной логики NeonTranslator (po_file.py + prefill_po.py) на
 * TypeScript: подмножество PO, которое реально пишут переводчики (Poedit /
 * msgmerge / Weblate): msgid / msgctxt / msgstr одно- и многострочные,
 * #:(refs) / #.(extracted comments) / #, (flags) / # (translator), заголовок.
 *
 * Не полноценный gettext — достаточно для детерминированного round-trip
 * наших каталогов (как и оригинал).
 */

import { renameSync, writeFileSync } from "node:fs";

/** Запись PO-файла. */
export interface PoEntry {
  msgid: string;
  msgctxt: string;
  msgstr: string;
  refs: string[];
  comments: string[];
  flags: string[];
  translator: string[];
}

/** Декодирует PO-экранирование (\n \r \t \" \\). */
export function poUnescape(s: string): string {
  let out = "";
  let i = 0;
  while (i < s.length) {
    const c = s[i];
    if (c === "\\" && i + 1 < s.length) {
      const n = s[i + 1];
      out += n === "n" ? "\n" : n === "r" ? "\r" : n === "t" ? "\t" : n;
      i += 2;
    } else {
      out += c;
      i += 1;
    }
  }
  return out;
}

/** Кодирует строку для PO (однострочно, детерминированно). */
export function poEscape(s: string): string {
  return (s ?? "")
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\r/g, "\\r")
    .replace(/\n/g, "\\n")
    .replace(/\t/g, "\\t");
}

const RE_MSG = /^(msgid|msgctxt|msgstr)\s+"(.*)"$/;
const RE_CONT = /^"(.*)"$/;
const RE_REF = /^#: +(.+)$/;
const RE_FLAG = /^#, +(.+)$/;
const RE_CMT = /^#\. +(.+)$/;
const RE_TR = /^# +(.+)$/;

function newEntry(): PoEntry {
  return { msgid: "", msgctxt: "", msgstr: "", refs: [], comments: [], flags: [], translator: [] };
}

/** Парсит PO/POT-текст в список записей. */
export function parsePo(text: string): PoEntry[] {
  const entries: PoEntry[] = [];
  let cur: PoEntry | null = null;
  let field: "msgid" | "msgctxt" | "msgstr" | null = null;

  function flush(): void {
    if (cur && (cur.msgid || cur.msgstr || cur.msgctxt || cur.refs.length)) entries.push(cur);
  }

  for (const rawLine of text.split("\n")) {
    const line = rawLine.trim();
    if (!line) {
      flush();
      cur = null;
      field = null;
      continue;
    }
    let m = RE_MSG.exec(line);
    if (m) {
      if (!cur) cur = newEntry();
      field = m[1] as "msgid" | "msgctxt" | "msgstr";
      cur[field] = poUnescape(m[2]);
      continue;
    }
    m = RE_CONT.exec(line);
    if (m && cur && field) {
      cur[field] += poUnescape(m[1]);
      continue;
    }
    m = RE_REF.exec(line);
    if (m) {
      if (!cur) cur = newEntry();
      // Одна ссылка на строку #: — никогда не сплитим по пробелам:
      // ссылки содержат имена с пробелами.
      cur.refs.push(m[1].trim());
      field = null;
      continue;
    }
    m = RE_FLAG.exec(line);
    if (m) {
      if (!cur) cur = newEntry();
      cur.flags.push(
        ...m[1]
          .split(",")
          .map((x) => x.trim())
          .filter(Boolean),
      );
      field = null;
      continue;
    }
    m = RE_CMT.exec(line);
    if (m) {
      if (!cur) cur = newEntry();
      cur.comments.push(m[1]);
      field = null;
      continue;
    }
    m = RE_TR.exec(line);
    if (m) {
      if (!cur) cur = newEntry();
      cur.translator.push(m[1]);
      field = null;
      continue;
    }
    // Неизвестная строка обрывает продолжение поля, игнорируется иначе.
    field = null;
  }
  flush();
  return entries;
}

/** Рендерит записи + заголовок в PO-текст (одна финальная \n). */
export function renderPo(entries: PoEntry[], headerLines: string[]): string {
  const out: string[] = [...headerLines, ""];
  for (const e of entries) {
    for (const ref of e.refs) out.push(`#: ${ref}`);
    for (const c of e.comments) out.push(`#. ${c}`);
    for (const t of e.translator) out.push(`# ${t}`);
    if (e.flags.filter(Boolean).length) out.push(`#, ${e.flags.filter(Boolean).join(", ")}`);
    if (e.msgctxt) out.push(`msgctxt "${poEscape(e.msgctxt)}"`);
    out.push(`msgid "${poEscape(e.msgid)}"`);
    out.push(`msgstr "${poEscape(e.msgstr)}"`);
    out.push("");
  }
  return out.join("\n").replace(/\n+$/, "") + "\n";
}

/**
 * Агрессивная нормальная форма для матча твинов (prefill-автозаполнение).
 *
 * «004 Yeees yeees Ill be thereee 1» и «Yeees yeees, I'll be thereee!»
 * оба становятся «yes yes ill be there». Маркеры, пунктуация, апострофы и
 * растяжение букв выкидываются; разные слова остаются разными.
 *
 * Матч по нормали защищён правилом «ровно один вариант перевода» — см.
 * prefill_po (порт NeonTranslator).
 */
/** Атомарная запись PO: сначала в `.part`, потом rename поверх цели.
 *
 * ИНЦИДЕНТ 2026-10-26: перезапуск сервера убил процесс переводчика ПОСРЕДИ
 * writeFileSync — `de.po` остался обнулённым (7.5 МБ нулей, 0 msgid).
 * rename на тех же файловой системе атомарен: либо старая версия, либо новая,
 * но никогда «обрезанная/пустая».
 */
export function writePoAtomic(path: string, content: string): void {
  const tmp = `${path}.part`;
  writeFileSync(tmp, content, "utf-8");
  renameSync(tmp, path);
}

export function normalizeText(s: string): string {
  let t = (s ?? "")
    .toLowerCase()
    .replace(/'/g, "")
    .replace(/\u2019/g, "");
  t = t.replace(/[^a-zа-яё ]/g, " ");
  t = t.replace(/(.)\1{2,}/g, "$1");
  return t.replace(/\s+/g, " ").trim();
}
