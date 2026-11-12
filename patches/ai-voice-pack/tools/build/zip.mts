/**
 * zip.mts — минимальный ZIP-райтер и ZIP-ридер на чистом node:stdlib.
 *
 * Порт механики `zipfile` из build_pack.py (миграция python → TS, приказ
 * владельца 2026-10-23: новый код — только .mts, без npm-зависимостей):
 * сжатие — node:zlib (deflateRawSync), CRC32 — своя таблица ниже.
 *
 * Райтер пишет обычный (не zip64) архив: записи <4 ГБ, без комментариев,
 * имена в UTF-8. Ридер — минимальный парсинг центрального каталога:
 * нужен тестам раскладки и сверке паритета «python-сборка vs ts-сборка»
 * (список записей + несжатые байты; таймстампы zip не сверяются).
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

/**
 * Записать архив: записи в ЗАДАННОМ порядке (порядок в zip = порядок вызова,
 * как у последовательных zf.write() в питоне).
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

      const local = Buffer.alloc(30);
      local.writeUInt32LE(0x04034b50, 0);
      local.writeUInt16LE(20, 4); // version needed
      local.writeUInt16LE(flags, 6);
      local.writeUInt16LE(method, 8);
      local.writeUInt16LE(time, 10);
      local.writeUInt16LE(date, 12);
      local.writeUInt32LE(crc, 14);
      local.writeUInt32LE(compressed.length, 18);
      local.writeUInt32LE(data.length, 22);
      local.writeUInt16LE(nameBytes.length, 26);
      local.writeUInt16LE(0, 28); // extra length
      writeAll(fd, local);
      writeAll(fd, nameBytes);
      writeAll(fd, compressed);

      const cd = Buffer.alloc(46);
      cd.writeUInt32LE(0x02014b50, 0);
      cd.writeUInt16LE(20, 4); // version made by (DOS, 2.0)
      cd.writeUInt16LE(20, 6); // version needed
      cd.writeUInt16LE(flags, 8);
      cd.writeUInt16LE(method, 10);
      cd.writeUInt16LE(time, 12);
      cd.writeUInt16LE(date, 14);
      cd.writeUInt32LE(crc, 16);
      cd.writeUInt32LE(compressed.length, 20);
      cd.writeUInt32LE(data.length, 24);
      cd.writeUInt16LE(nameBytes.length, 28);
      cd.writeUInt16LE(0, 30); // extra length
      cd.writeUInt16LE(0, 32); // comment length
      cd.writeUInt16LE(0, 34); // disk number start
      cd.writeUInt16LE(0, 36); // internal attrs
      cd.writeUInt32LE(0, 38); // external attrs
      cd.writeUInt32LE(offset, 42);
      central.push(cd, nameBytes);

      offset += local.length + nameBytes.length + compressed.length;
      nfiles++;
      nbytes += data.length;
    }

    const cdSize = central.reduce((n, b) => n + b.length, 0);
    const eocd = Buffer.alloc(22);
    eocd.writeUInt32LE(0x06054b50, 0);
    eocd.writeUInt16LE(0, 4); // номер диска
    eocd.writeUInt16LE(0, 6); // диск с каталогом
    eocd.writeUInt16LE(nfiles, 8);
    eocd.writeUInt16LE(nfiles, 10);
    eocd.writeUInt32LE(cdSize, 12);
    eocd.writeUInt32LE(offset, 16); // смещение каталога
    eocd.writeUInt16LE(0, 20); // длина комментария
    for (const b of central) writeAll(fd, b);
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

/** Разобрать zip по центральному каталогу (минимально, без zip64). */
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
  const total = buf.readUInt16LE(eocd + 10);
  const cdOff = buf.readUInt32LE(eocd + 16);

  const entries: (ZipEntryInfo & { localOffset: number })[] = [];
  let pos = cdOff;
  for (let n = 0; n < total; n++) {
    if (buf.readUInt32LE(pos) !== 0x02014b50) throw new Error(`${file}: битая центральная запись #${n}`);
    const nameLen = buf.readUInt16LE(pos + 28);
    const extraLen = buf.readUInt16LE(pos + 30);
    const commentLen = buf.readUInt16LE(pos + 32);
    entries.push({
      name: buf.toString("utf-8", pos + 46, pos + 46 + nameLen),
      method: buf.readUInt16LE(pos + 10),
      crc32: buf.readUInt32LE(pos + 16),
      compressedSize: buf.readUInt32LE(pos + 20),
      uncompressedSize: buf.readUInt32LE(pos + 24),
      localOffset: buf.readUInt32LE(pos + 42),
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
