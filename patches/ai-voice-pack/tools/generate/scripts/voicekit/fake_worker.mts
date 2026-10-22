/**
 * fake_worker.mts — фейковый инференс-шим для тестов voicekit/worker.mts.
 *
 * Говорит тем же JSON-lines протоколом, что cosyworker.py, но без модели:
 *   ping -> ok, gen -> ok (имитирует генерацию, пишет пустышку в out),
 *   gen с text содержащим "FAIL" -> ok:false (тест fail-ветки),
 *   gen с text содержащим "CRASH" -> процесс падает (тест обрыва).
 * stdout = только протокол, stderr = логи.
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { createInterface } from "node:readline";

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
    if (String(req.text).includes("CRASH")) {
      console.error("fake: CRASH, падаю");
      process.exit(3);
    }
    if (String(req.text).includes("FAIL")) {
      process.stdout.write(JSON.stringify({ id: req.id, ok: false, error: "fake fail" }) + "\n");
      return;
    }
    mkdirSync(dirname(req.out), { recursive: true });
    writeFileSync(req.out + ".opus", "fake-opus");
    process.stdout.write(JSON.stringify({ id: req.id, ok: true, dur: 1.5, saved: req.out + ".opus" }) + "\n");
    return;
  }
  process.stdout.write(JSON.stringify({ id: req.id, ok: false, error: "неизвестная команда" }) + "\n");
});
// молчаливое завершение при закрытии stdin (оркестратор умер)
rl.on("close", () => process.exit(0));
