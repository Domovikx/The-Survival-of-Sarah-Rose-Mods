/**
 * e2e-прогон реального шима cosyworker.py на CUDA: ping -> gen (демо-фраза) -> quit.
 * Запуск: C:/tools/cosyvoice3/.venv — НЕ нужен, спавнит python сам.
 *   node patches/ai-voice-pack/tools/generate/scripts/voicekit/worker_e2e.mts
 */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { VoiceWorker } from "./worker.mts";

const PY = "C:/tools/cosyvoice3/.venv/Scripts/python.exe";
const SHIM = fileURLToPath(new URL("../cosyworker.py", import.meta.url));
const REF =
  "C:/Users/Domo/workspace/The-Survival-of-Sarah-Rose-Mods/patches/ai-voice-pack/casts/voices/Sarah/Sarah.wav";

const tmp = mkdtempSync(join(tmpdir(), "worker-e2e-"));
const out = join(tmp, "Demo", "e2e__Sarah.wav");

const w = new VoiceWorker({
  python: PY,
  script: SHIM,
  args: ["--device", "cuda"],
  onLog: (l) => console.error("[shim]", l),
});

const t0 = Date.now();
const ping = await w.ping();
console.log("ping:", ping, `(+${((Date.now() - t0) / 1000).toFixed(1)}s — загрузка модели)`);
if (!ping.ok) process.exit(1);

const gen = await w.generate({
  text: "Ну что ж, мистер Грей, — я готова начать. Только вы снимите с себя всё сразу, а то я уже устала ждать.",
  ref: REF,
  emotion: "In a soft, playful murmur",
  seed: 42,
  out,
});
console.log("gen:", gen, `(+${((Date.now() - t0) / 1000).toFixed(1)}s всего)`);

const code = await w.quit();
console.log("quit code:", code);
rmSync(tmp, { recursive: true, force: true });
process.exit(gen.ok && code === 0 ? 0 : 1);
