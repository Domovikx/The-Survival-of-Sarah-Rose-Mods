/**
 * E2E инсталлятора без окна: запускает СОБРАННЫЙ exe в режиме `--selftest`
 * и проверяет реальный цикл на диске:
 *
 *   1. находит игру (Steam App ID 2166470);
 *   2. качает `main.7z` (core) и `voice-en.7z` в тестовую папку;
 *   3. распаковывает оба (7z своим кодеком, без внешнего 7-Zip);
 *   4. инвентарь видит ядро и EN с файлами;
 *   5. удаляет EN (`remove_lang`) — язык исчезает из инвентаря;
 *   6. делает uninstall — папка мода и `environment.txt` удалены;
 *   7. ставит всё заново — мод и `environment.txt` на месте (полный цикл).
 *
 * Запуск: `npm run e2e` (нужен собранный release-exe: `npm run tauri build`).
 * Сеть обязательна: скачивается ~35 МБ из последнего релиза.
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const exe = join(root, "src-tauri", "target", "release", "installer.exe");
const work = join(root, "tmp", "e2e");

if (!existsSync(exe)) {
  console.error(`E2E: нет собранного exe: ${exe}\nСначала: npm run tauri build`);
  process.exit(1);
}

rmSync(work, { recursive: true, force: true });
mkdirSync(work, { recursive: true });

console.log(`E2E: ${exe} --selftest ${work}`);
const run = spawnSync(exe, ["--selftest", work], { encoding: "utf-8", timeout: 15 * 60_000 });
const out = `${run.stdout ?? ""}${run.stderr ?? ""}`;
process.stdout.write(out);

const expect = (condition: boolean, message: string): void => {
  if (!condition) {
    console.error(`E2E FAIL: ${message}`);
    process.exit(1);
  }
};

expect(run.status === 0, `exit code ${run.status} (ожидался 0)`);
expect(/selftest: game =/i.test(out), "игра не найдена (нужна Steam-версия)");
expect(/download: \d+ байт/.test(out), "core не скачался (нет строки download: … байт)");
expect(/extracted \d+ files/i.test(out), "архив не распаковался");
expect(/scan core=true/i.test(out), "инвентарь не видит ядро");
expect(/langs=\[\("en", \d+\)\]/.test(out), "инвентарь не видит EN после установки");
expect(/removed en \(\d+ files\)/i.test(out), "язык EN не удалился");
expect(/env_removed=true/.test(out), "uninstall не убрал environment.txt");
expect(
  /reinstall core=true en_files=\d+ env=true/.test(out),
  "повторная установка не восстановила мод и environment.txt",
);
expect(/selftest: OK/i.test(out), "selftest не дошёл до OK");

// Снаружи проверяем ФИНАЛ цикла (мод ставится заново после удаления):
// папка мода и environment.txt на месте, а скачанные архивы не копятся.
const modDir = join(work, "game", "mods", "tssr-ai-voice-pack");
expect(existsSync(modDir), `после повторной установки нет папки мода: ${modDir}`);
expect(existsSync(join(work, "game", "environment.txt")), "после повторной установки нет environment.txt");
const archives = readdirSync(work).filter((name) => name.endsWith(".7z"));
expect(archives.length === 0, `скачанные архивы не удалены: ${archives.join(", ")}`);

console.log("E2E OK: установка → удаление языка → uninstall → повторная установка (архивы убираются).");
