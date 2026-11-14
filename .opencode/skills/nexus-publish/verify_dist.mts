/**
 * verify_dist — проверка собранных архивов перед публикацией.
 *
 * Что делает для каждого `dist/*.7z`:
 *   1) полный тест архива (`7z t`, CRC);
 *   2) читает версию из `fomod/info.xml` (должна быть одна на все архивы);
 *   3) проверяет, что внутри нет `.exe/.cmd/.ps1` (Nexus карантинит такие архивы);
 *   4) печатает размер, число файлов и sha256 (первые 16 символов).
 *
 * Запуск: node .opencode/skills/nexus-publish/verify_dist.mts
 */
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { readArchive } from "../../../patches/ai-voice-pack/tools/build/archive.mts";

const SEVEN = "C:/Program Files/7-Zip/7z.exe";
const files = readdirSync("dist")
  .filter((f) => f.endsWith(".7z"))
  .sort();
const versions = new Set<string>();
let bad = 0;

for (const f of files) {
  const p = join("dist", f);
  const test = spawnSync(SEVEN, ["t", p], { encoding: "utf-8" });
  const testOk = test.status === 0 && /Everything is Ok/u.test(test.stdout);
  const archive = readArchive(p);
  const names = archive.names;
  const executables = names.filter((n) => /\.(exe|cmd|ps1)$/iu.test(n));
  const info = names.includes("fomod/info.xml") ? archive.read("fomod/info.xml").toString("utf-8") : "";
  const version = /<Version MachineVersion="([^"]+)">/u.exec(info)?.[1] ?? "—";
  versions.add(version);
  const sha = createHash("sha256").update(readFileSync(p)).digest("hex").slice(0, 16);
  const mb = statSync(p).size / (1 << 20);
  if (!testOk || executables.length > 0 || !info) bad++;
  console.log(
    `${f.padEnd(36)} ${testOk ? "7z-OK " : "7z-FAIL"} | ver ${version} | файлов ${String(names.length).padStart(4)} | ${mb.toFixed(1)} MiB | sha ${sha} | exe ${executables.length}`,
  );
}

console.log(`\nверсии в пакетах: ${[...versions].join(", ")} | проблемных: ${bad}`);
if (versions.size > 1) console.log("⚠️ версии различаются между архивами — пересобрать пакет");
if (bad > 0) process.exitCode = 1;
