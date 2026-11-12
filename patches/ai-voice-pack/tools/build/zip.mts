/**
 * zip.mts — минимальный ZIP-райтер и ZIP-ридер на чистом node:stdlib.
 *
 * Порт механики `zipfile` из build_pack.py (миграция python → TS, приказ
 * владельца 2026-10-23: новый код — только .mts, без npm-зависимостей):
 * сжатие — node:zlib (deflateRawSync), CRC32 — своя таблица ниже.
 *
 * Формат: обычный ZIP + **ZIP64** (APPNOTE 4.4.3–4.5.3) — когда записей
 * ≥65 535 или размеры/смещения ≥4 ГБ (полный корпус RU = 67 267 файлов
 * упирается в классический лимит, поэтому zip64 сделан заранее, 2026-11-12).
 * Записи без комментариев, имена в UTF-8. Ридер — минимальный парсинг
 * центрального каталога (+ zip64-записи): нужен тестам раскладки и сверке
 * паритета «python-сборка vs ts-сборка» (список записей + несжатые байты;
 * таймстампы zip не сверяются).
 */

import { closeSync, openSync, readFileSync, statSync, writeSync } from "node:fs";
import { deflateRawSync, inflateRawSync } from "node:zlib";

// --- CRC32 (своя таблица, stdlib zlib не отдаёт crc отдельно) ---

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

/** CRC32 как в zip: полином 0xEDB88320, инвертированный вход/выход. */
export function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = (CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8)) >>> 0;
  return (c ^ 0xffffffff) >>> 0;
}

// --- ZIP64: маркеры переполнения и extra-поле 0x0001 (APPNOTE 4.5.3) ---

/** 32-битное поле, вырожденное в «значение в zip64-extra». */
const Z64_MARK = 0xffffffff;
/** 16-битный счётчик записей с той же семантикой. */
const Z64_COUNT_MARK = 0xffff;
/** Порог: значение НЕ влезает в 32 бита (0xffffffff само = маркер). */
export function overflows32(v: number): boolean {
  return v >= Z64_MARK;
}

/**
 * zip64-extra для ЗАПИСИ: поля строго в порядке APPNOTE 4.5.3.1, и только те,
 * чьи 32-битные поля выставлены в 0xffffffff. Правило записи (как у python
 * zipfile): если переполнен ЛЮБОЙ из размеров — оба размера уходят в extra,
 * оба 32-битных поля = маркер; смещение — только при своём переполнении.
 */
export function buildZip64Extra(us: number, cs: number, offset: number | null): Buffer {
  const sizes = overflows32(us) || overflows32(cs);
  const off = offset !== null && overflows32(offset);
  if (!sizes && !off) return Buffer.alloc(0);
  const parts: Buffer[] = [];
  if (sizes) {
    const b = Buffer.alloc(16);
    b.writeBigUInt64LE(BigInt(us), 0);
    b.writeBigUInt64LE(BigInt(cs), 8);
    parts.push(b);
  }
  if (off) {
    const b = Buffer.alloc(8);
    b.writeBigUInt64LE(BigInt(offset as number), 0);
    parts.push(b);
  }
  const data = Buffer.concat(parts);
  const head = Buffer.alloc(4);
  head.writeUInt16LE(0x0001, 0);
  head.writeUInt16LE(data.length, 2);
  return Buffer.concat([head, data]);
}

// --- DOS-таймстамп (как в zipfile: локальное время, секунды /2) ---

function dosDateTime(ms: number): { time: number; date: number } {
  const d = new Date(ms);
  const year = Math.max(1980, d.getFullYear());
  return {
    time: ((d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1)) & 0xffff,
    date: (((year - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate()) & 0xffff,
  };
}

// --- Райтер ---

/** Запись архива: либо готовые байты, либо файл-источник (читается при записи). */
export interface ZipEntry {
  name: string;
  store: boolean;
  mtime?: number;
  /** несжатые байты (для маленьких строк) */
  data?: Buffer;
  /** файл-источник: читается при записи (не держим дерево в RAM) */
  path?: string;
}

export interface ZipWriteResult {
  nfiles: number;
  /** несжатое суммарно (как file_size в infolist zipfile) */
  nbytes: number;
}

export interface ZipWriteOptions {
  /** уровень deflate (py: compresslevel=9 в main, дефолт — в voice) */
  level?: number;
}

function writeAll(fd: number, buf: Buffer): void {
  let off = 0;
  while (off < buf.length) off += writeSync(fd, buf, off, buf.length - off);
}

/** u32-поле с маркером, если значение не влезает. */
function u32mark(v: number): number {
  return overflows32(v) ? Z64_MARK : v;
}

/**
 * Записать архив: записи в ЗАДАННОМ порядке (порядок в zip = порядок вызова,
 * как у последовательных zf.write() в питоне). ZIP64 включается автоматически
 * по переполнению записей/размеров/смещений.
 */
export function writeZip(target: string, entries: Iterable<ZipEntry>, opts: ZipWriteOptions = {}): ZipWriteResult {
  const deflateOpts = opts.level === undefined ? undefined : { level: opts.level };
  const fd = openSync(target, "w");
  try {
    const central: Buffer[] = [];
    let offset = 0;
    let nfiles = 0;
    let nbytes = 0;
    for (const e of entries) {
      const data = e.path !== undefined ? readFileSync(e.path) : e.data;
      if (data === undefined) throw new Error(`запись ${e.name}: нет ни data, ни path`);
      const mtimeMs = e.mtime ?? (e.path !== undefined ? statSync(e.path).mtimeMs : Date.now());
      const { time, date } = dosDateTime(mtimeMs);
      const nameBytes = Buffer.from(e.name, "utf-8");
      const crc = crc32(data);
      const compressed = e.store ? data : deflateRawSync(data, deflateOpts);
      const method = e.store ? 0 : 8;
      const flags = nameBytes.equals(Buffer.from(e.name, "ascii")) ? 0 : 0x0800;

      // zip64: размеры — по любому из размеров (оба в extra), смещение — своё.
      const sizes64 = overflows32(data.length) || overflows32(compressed.length);
      const localExtra = buildZip64Extra(data.length, compressed.length, null);
      const cdExtra = buildZip64Extra(data.length, compressed.length, offset);
      const version = localExtra.length ? 45 : 20;

      const local = Buffer.alloc(30);
      local.writeUInt32LE(0x04034b50, 0);
      local.writeUInt16LE(version, 4); // version needed
      local.writeUInt16LE(flags, 6);
      local.writeUInt16LE(method, 8);
      local.writeUInt16LE(time, 10);
      local.writeUInt16LE(date, 12);
      local.writeUInt32LE(crc, 14);
      local.writeUInt32LE(sizes64 ? Z64_MARK : compressed.length, 18);
      local.writeUInt32LE(sizes64 ? Z64_MARK : data.length, 22);
      local.writeUInt16LE(nameBytes.length, 26);
      local.writeUInt16LE(localExtra.length, 28);
      writeAll(fd, local);
      writeAll(fd, nameBytes);
      if (localExtra.length) writeAll(fd, localExtra);
      writeAll(fd, compressed);

      const cd = Buffer.alloc(46);
      cd.writeUInt32LE(0x02014b50, 0);
      cd.writeUInt16LE(20, 4); // version made by (DOS, 2.0)
      cd.writeUInt16LE(version, 6); // version needed
      cd.writeUInt16LE(flags, 8);
      cd.writeUInt16LE(method, 10);
      cd.writeUInt16LE(time, 12);
      cd.writeUInt16LE(date, 14);
      cd.writeUInt32LE(crc, 16);
      cd.writeUInt32LE(sizes64 ? Z64_MARK : compressed.length, 20);
      cd.writeUInt32LE(sizes64 ? Z64_MARK : data.length, 24);
      cd.writeUInt16LE(nameBytes.length, 28);
      cd.writeUInt16LE(cdExtra.length, 30);
      cd.writeUInt16LE(0, 32); // comment length
      cd.writeUInt16LE(0, 34); // disk number start
      cd.writeUInt16LE(0, 36); // internal attrs
      cd.writeUInt32LE(0, 38); // external attrs
      cd.writeUInt32LE(u32mark(offset), 42);
      central.push(cd, nameBytes);
      if (cdExtra.length) central.push(cdExtra);

      offset += local.length + nameBytes.length + localExtra.length + compressed.length;
      nfiles++;
      nbytes += data.length;
    }

    const cdSize = central.reduce((n, b) => n + b.length, 0);
    const cdOffset = offset;

    for (const b of central) writeAll(fd, b);

    // ZIP64-конец: при ≥65 535 записей или переполнении смещения/размера
    // каталога (у python — тот же критерий; count ≥ — а не >: литеральный
    // 0xffff в EOCD читается как маркер). Порядок в файле:
    // [записи][каталог][ZIP64 EOCD][локатор][EOCD].
    const need64 = nfiles >= Z64_COUNT_MARK || overflows32(cdSize) || overflows32(cdOffset);
    if (need64) {
      const z64 = Buffer.alloc(56);
      z64.writeUInt32LE(0x06064b50, 0);
      z64.writeBigUInt64LE(44n, 4); // размер остатка записи
      z64.writeUInt16LE(45, 12); // version made by
      z64.writeUInt16LE(45, 14); // version needed
      z64.writeUInt32LE(0, 16); // диск с записью
      z64.writeUInt32LE(0, 20); // диск с каталогом
      z64.writeBigUInt64LE(BigInt(nfiles), 24);
      z64.writeBigUInt64LE(BigInt(nfiles), 32);
      z64.writeBigUInt64LE(BigInt(cdSize), 40);
      z64.writeBigUInt64LE(BigInt(cdOffset), 48);
      writeAll(fd, z64);

      const loc = Buffer.alloc(20);
      loc.writeUInt32LE(0x07064b50, 0);
      loc.writeUInt32LE(0, 4); // диск с zip64-концом
      loc.writeBigUInt64LE(BigInt(cdOffset + cdSize), 8); // смещение zip64-конца
      loc.writeUInt32LE(1, 16); // всего дисков
      writeAll(fd, loc);
    }

    const eocd = Buffer.alloc(22);
    eocd.writeUInt32LE(0x06054b50, 0);
    eocd.writeUInt16LE(0, 4); // номер диска
    eocd.writeUInt16LE(0, 6); // диск с каталогом
    // min-клампы (как python): реальные значения, пока влезают, иначе маркеры.
    eocd.writeUInt16LE(Math.min(nfiles, Z64_COUNT_MARK), 8);
    eocd.writeUInt16LE(Math.min(nfiles, Z64_COUNT_MARK), 10);
    eocd.writeUInt32LE(Math.min(cdSize, Z64_MARK), 12);
    eocd.writeUInt32LE(Math.min(cdOffset, Z64_MARK), 16);
    eocd.writeUInt16LE(0, 20); // длина комментария
    writeAll(fd, eocd);
    return { nfiles, nbytes };
  } finally {
    closeSync(fd);
  }
}

// --- Ридер (центральный каталог + распаковка записей) ---

export interface ZipEntryInfo {
  name: string;
  /** 0 = stored, 8 = deflate */
  method: number;
  crc32: number;
  compressedSize: number;
  uncompressedSize: number;
}

export interface ZipRead {
  /** имена записей в порядке архива */
  names: string[];
  entries: ZipEntryInfo[];
  /** несжатые байты записи (проверяет CRC32) */
  read(name: string): Buffer;
}

/** Разобрать extra-поле центральной записи: zip64 0x0001 -> 64-битные значения. */
function parseZip64Extra(
  buf: Buffer,
  pos: number,
  len: number,
  marks: { us: boolean; cs: boolean; off: boolean },
): { us: number; cs: number; off: number } | null {
  let p = pos;
  const end = pos + len;
  while (p + 4 <= end) {
    const tag = buf.readUInt16LE(p);
    const size = buf.readUInt16LE(p + 2);
    p += 4;
    if (tag !== 0x0001) {
      p += size;
      continue;
    }
    let q = p;
    const out = { us: 0, cs: 0, off: 0 };
    if (marks.us) {
      out.us = Number(buf.readBigUInt64LE(q));
      q += 8;
    }
    if (marks.cs) {
      out.cs = Number(buf.readBigUInt64LE(q));
      q += 8;
    }
    if (marks.off) {
      out.off = Number(buf.readBigUInt64LE(q));
      q += 8;
    }
    return out;
  }
  return null;
}

/** Разобрать zip (включая zip64) по центральному каталогу. */
export function readZip(file: string): ZipRead {
  const buf = readFileSync(file);
  // EOCD (22 байта) в хвосте; комментария у нас нет, но сканируем хвост.
  const min = Math.max(0, buf.length - 22 - 65535);
  let eocd = -1;
  for (let i = buf.length - 22; i >= min; i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error(`${file}: EOCD не найден — это не zip?`);

  let total = buf.readUInt16LE(eocd + 10);
  let cdSize = buf.readUInt32LE(eocd + 12);
  let cdOff = buf.readUInt32LE(eocd + 16);

  // Маркеры переполнения -> ZIP64 EOCD (локатор лежит прямо перед EOCD).
  if (total === Z64_COUNT_MARK || cdSize === Z64_MARK || cdOff === Z64_MARK) {
    const loc = eocd - 20;
    if (loc < 0 || buf.readUInt32LE(loc) !== 0x07064b50) {
      throw new Error(`${file}: маркеры zip64, но локатора ZIP64 EOCD нет`);
    }
    const z64 = Number(buf.readBigUInt64LE(loc + 8));
    if (buf.readUInt32LE(z64) !== 0x06064b50) throw new Error(`${file}: битый ZIP64 EOCD`);
    total = Number(buf.readBigUInt64LE(z64 + 32));
    cdSize = Number(buf.readBigUInt64LE(z64 + 40));
    cdOff = Number(buf.readBigUInt64LE(z64 + 48));
  }

  const entries: (ZipEntryInfo & { localOffset: number })[] = [];
  let pos = cdOff;
  for (let n = 0; n < total; n++) {
    if (buf.readUInt32LE(pos) !== 0x02014b50) throw new Error(`${file}: битая центральная запись #${n}`);
    const nameLen = buf.readUInt16LE(pos + 28);
    const extraLen = buf.readUInt16LE(pos + 30);
    const commentLen = buf.readUInt16LE(pos + 32);
    const usMark = buf.readUInt32LE(pos + 24) === Z64_MARK;
    const csMark = buf.readUInt32LE(pos + 20) === Z64_MARK;
    const offMark = buf.readUInt32LE(pos + 42) === Z64_MARK;
    const z64 = parseZip64Extra(buf, pos + 46 + nameLen, extraLen, {
      us: usMark,
      cs: csMark,
      off: offMark,
    });
    if ((usMark || csMark || offMark) && !z64) {
      throw new Error(`${file}: запись ${n}: маркеры zip64 без extra 0x0001`);
    }
    entries.push({
      name: buf.toString("utf-8", pos + 46, pos + 46 + nameLen),
      method: buf.readUInt16LE(pos + 10),
      crc32: buf.readUInt32LE(pos + 16),
      compressedSize: csMark ? (z64 as { cs: number }).cs : buf.readUInt32LE(pos + 20),
      uncompressedSize: usMark ? (z64 as { us: number }).us : buf.readUInt32LE(pos + 24),
      localOffset: offMark ? (z64 as { off: number }).off : buf.readUInt32LE(pos + 42),
    });
    pos += 46 + nameLen + extraLen + commentLen;
  }

  return {
    names: entries.map((e) => e.name),
    entries: entries.map(({ localOffset: _localOffset, ...info }) => info),
    read(name: string): Buffer {
      const e = entries.find((x) => x.name === name);
      if (!e) throw new Error(`${file}: нет записи ${name}`);
      if (buf.readUInt32LE(e.localOffset) !== 0x04034b50) throw new Error(`${file}: битый локальный заголовок ${name}`);
      const nameLen = buf.readUInt16LE(e.localOffset + 26);
      const extraLen = buf.readUInt16LE(e.localOffset + 28);
      const start = e.localOffset + 30 + nameLen + extraLen;
      const raw = buf.subarray(start, start + e.compressedSize);
      const data = e.method === 0 ? Buffer.from(raw) : e.method === 8 ? inflateRawSync(raw) : null;
      if (data === null) throw new Error(`${file}: неизвестный метод сжатия ${e.method} (${name})`);
      if (data.length !== e.uncompressedSize) throw new Error(`${file}: размер записи ${name} не сходится`);
      if (crc32(data) !== e.crc32) throw new Error(`${file}: CRC32 записи ${name} не сходится`);
      return data;
    },
  };
}
