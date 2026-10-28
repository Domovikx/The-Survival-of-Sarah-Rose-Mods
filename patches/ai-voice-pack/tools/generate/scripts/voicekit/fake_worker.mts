/**
 * fake_worker.mts — фейковый инференс-шим для тестов voicekit/worker.mts.
 *
 * Говорит протоколом v2 (как cosyworker.py), но без модели:
 *   ping -> ok,
 *   gen -> ok: 1.5с синуса 24000 Гц как сырой PCM base64 (файл уже пишет
 *     сам worker.mts через trim+ffmpeg — как в проде; синус без паттерна
 *     «пауза+всплеск», trim его не трогает),
 *   gen c text содержащим "FAIL" -> ok:false (тест fail-ветки),
 *   gen с text содержащим "WARMUP" -> ПЕРВЫЙ запрос ok:false с
 *     TextEncodeInput в ошибке, второй ok (тест ретрая worker.mts),
 *   gen с text содержащим "OPTS" -> ok ТОЛЬКО если req.opts донёс
 *     cfg_value=1.5 и inference_timesteps=30 (тест прокидки genOpts -> opts),
 *   gen с text содержащим "CRASH" -> процесс падает (тест обрыва).
 * stdout = только протокол, stderr = логи.
 */
import { createInterface } from "node:readline";

const SR = 24000;
const DUR_S = 1.5;
let warmupDone = false;

/** 1.5с синуса 440 Гц, амплитуда 0.1 — LE float32, один раз на процесс. */
const PCM_B64 = (() => {
  const n = Math.round(SR * DUR_S);
  const buf = Buffer.allocUnsafe(n * 4);
  for (let i = 0; i < n; i++) buf.writeFloatLE(0.1 * Math.sin((2 * Math.PI * 440 * i) / SR), i * 4);
  return buf.toString("base64");
})();

const rl = createInterface({ input: process.stdin });
rl.on("line", (line) => {
  let req;
  try {
    req = JSON.parse(line);
  } catch {
    process.stdout.write(JSON.stringify({ ok: false, error: "не-JSON" }) + "\n");
    return;
  }
  if (req.cmd === "quit") {
    process.stdout.write(JSON.stringify({ ok: true, id: req.id ?? null }) + "\n");
    process.exit(0);
  }
  if (req.cmd === "ping") {
    process.stdout.write(JSON.stringify({ id: req.id, ok: true, device: "fake-gpu", model_loaded: true }) + "\n");
    return;
  }
  if (req.cmd === "gen") {
    const text = String(req.text);
    if (text.includes("CRASH")) {
      console.error("fake: CRASH, падаю");
      process.exit(3);
    }
    if (text.includes("FAIL")) {
      process.stdout.write(JSON.stringify({ id: req.id, ok: false, error: "fake fail" }) + "\n");
      return;
    }
    if (text.includes("WARMUP") && !warmupDone) {
      // Имитация холодного фронтенда wetext: первая строка падает, повтор проходит
      warmupDone = true;
      process.stdout.write(
        JSON.stringify({ id: req.id, ok: false, error: "TypeError: TextEncodeInput: front not warmed up (fake)" }) +
          "\n",
      );
      return;
    }
    if (text.includes("OPTS")) {
      // Тест прокидки genOpts -> opts (стенд voxcpm_bench.mts): просили
      // переопределения — шим обязан их получить, иначе fail-ветка.
      const opts = req.opts;
      if (!opts || opts.cfg_value !== 1.5 || opts.inference_timesteps !== 30) {
        process.stdout.write(
          JSON.stringify({ id: req.id, ok: false, error: `opts не дошли до шима: ${JSON.stringify(opts ?? null)}` }) +
            "\n",
        );
        return;
      }
    }
    process.stdout.write(JSON.stringify({ id: req.id, ok: true, pcm_b64: PCM_B64, sr: SR, raw_dur: DUR_S }) + "\n");
    return;
  }
  process.stdout.write(JSON.stringify({ id: req.id, ok: false, error: "неизвестная команда" }) + "\n");
});
// молчаливое завершение при закрытии stdin (оркестратор умер)
rl.on("close", () => process.exit(0));
