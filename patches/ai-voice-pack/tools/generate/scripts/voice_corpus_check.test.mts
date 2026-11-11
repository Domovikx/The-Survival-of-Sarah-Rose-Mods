/**
 * voice_corpus_check.test.mts — чистые функции верификатора корпуса.
 * node --test patches/ai-voice-pack/tools/generate/scripts/voice_corpus_check.test.mts
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { parseOpusMeta } from "./voice_corpus_check.mts";

/** Синтетическая Ogg-страница с OpusHead (rate 24000). */
function oggOpus(rate: number): Buffer {
  // OpusHead: magic(8) + ver(1) + ch(1) + pre-skip(2) + input rate(4 LE)
  const head = Buffer.from("OggS\x00\x02" + "\x00".repeat(20) + "OpusHead\x01\x02\x00\x00", "latin1");
  const tail = Buffer.alloc(4);
  tail.writeUInt32LE(rate, 0);
  return Buffer.concat([head, tail]);
}

test("parseOpusMeta: валидный Ogg Opus отдаёт rate", () => {
  assert.deepEqual(parseOpusMeta(oggOpus(24000)), { rate: 24000 });
  assert.deepEqual(parseOpusMeta(oggOpus(48000)), { rate: 48000 });
});

test("parseOpusMeta: мусор и не-Ogg — null", () => {
  assert.equal(parseOpusMeta(Buffer.from("RIFFxxxxWAVE")), null);
  assert.equal(parseOpusMeta(Buffer.from("OggS but no opus head here")), null);
  assert.equal(parseOpusMeta(Buffer.alloc(0)), null);
});
