/**
 * demo/gen.mts — ОДНА фраза через реальный TS-путь озвучки (протокол v2).
 *
 * Ровно та же цепочка, что в боевой генерации (voice_batch.mts → VoiceWorker):
 *   шим cosyworker.py (CUDA) → PCM float32 → trim (voicekit/trim.mts)
 *   → writeWav16 + loudnorm -16 LUFS (voicekit/audio.mts) → libopus 24k mono
 * Единственная разница с боем: keep_wav=true — wav НЕ выбрасывается, а
 * остаётся рядом с opus (в бою opus пишется из pipe напрямую, wav не пишется).
 *
 * Кладёт в demo/ две вещи для ручной проверки формата:
 *   carolyn_en.wav  — wav, который делается перед opus (нормализованный, -16 LUFS)
 *   carolyn_en.opus — сам opus, скодированный ИМЕННО из этого wav
 *
 * Запуск: node demo/gen.mts
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { VoiceWorker } from "../patches/ai-voice-pack/tools/generate/scripts/voicekit/worker.mts";

const DEMO_DIR = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(DEMO_DIR, "..");
const SCRIPTS = join(ROOT, "patches", "ai-voice-pack", "tools", "generate", "scripts");
const PYTHON = "C:/tools/cosyvoice3/.venv/Scripts/python.exe";
const SHIM = join(SCRIPTS, "cosyworker.py");
const POT = join(ROOT, "patches", "ai-voice-pack", "po", "template.pot");
const REF = join(ROOT, "patches", "ai-voice-pack", "casts", "voices", "Carolyn", "Carolyn.wav");
// Реплика из жалобы: en/BlackMonolith/9650...__Carolyn.opus
const UID = "965008809955fb24bad05d00315049d9";
const OUT_WAV = join(DEMO_DIR, "carolyn_en.wav"); // opus ляжет рядом: carolyn_en.opus

/** POT: uid -> {text, emotion}; md5(msgid) обязан совпасть с uid (ключ озвучки). */
function potEntry(uid: string): { text: string; emotion: string | null } {
  const lines = readFileSync(POT, "utf8").split(/\r?\n/);
  const i = lines.findIndex((l) => l.includes(`uid: ${uid}`));
  if (i < 0) throw new Error(`uid ${uid} не найден в template.pot`);
  let emotion: string | null = null;
  for (let k = i - 1; k >= 0 && k >= i - 8; k--) {
    const m = /^#\.\s*emotion:\s*(.+)$/.exec(lines[k]);
    if (m) {
      emotion = m[1].trim();
      break;
    }
  }
  const parts: string[] = [];
  let inMsgid = false;
  for (let k = i; k < i + 15 && k < lines.length; k++) {
    if (!inMsgid) {
      if (lines[k].startsWith("msgid ")) {
        inMsgid = true;
        parts.push(lines[k].slice(6));
      }
      continue;
    }
    if (lines[k].startsWith('"')) {
      parts.push(lines[k]);
      continue;
    }
    break;
  }
  const text = parts
    .join("")
    .replace(/^"/, "")
    .replace(/"$/, "")
    .replace(/\\n/g, "\n")
    .replace(/\\"/g, '"')
    .replace(/\\\\/g, "\\");
  const md5 = createHash("md5").update(text, "utf8").digest("hex");
  if (md5 !== uid) throw new Error(`md5(msgid)=${md5} != uid ${uid} — текст и uid разошлись`);
  return { text, emotion };
}

const { text, emotion } = potEntry(UID);
console.log(`фраза : ${text}`);
console.log(`эмоция: ${emotion ?? "(нет)"}`);
if (!existsSync(REF)) throw new Error(`нет рефа голоса: ${REF}`);

const w = new VoiceWorker({
  python: PYTHON,
  script: SHIM,
  args: ["--device", "cuda"],
  onLog: (l) => console.log(l),
});
try {
  const ping = await w.ping();
  console.log(`шим: device=${ping.device} model_loaded=${ping.model_loaded}`);
  const res = await w.generate({ text, ref: REF, emotion, seed: 42, out: OUT_WAV, keep_wav: true });
  if (!res.ok) throw new Error(`генерация не удалась: ${res.error}`);
  console.log(`ГОТОВО (${res.dur}s):`);
  console.log(`  wav  ${OUT_WAV}`);
  console.log(`  opus ${OUT_WAV.replace(/\.wav$/, ".opus")}`);
} finally {
  await w.quit();
}
