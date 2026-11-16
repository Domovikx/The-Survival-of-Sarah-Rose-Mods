/**
 * po_live_guard.mts — не дать коммиту потерять переводы.
 *
 * Что случилось 2026-11-16: прогон перевода писал `po/pt.po` каждые 2 секунды,
 * параллельно шёл `git commit`. Хук (husky → lint-staged) перед задачами делает
 * `git stash` всех НЕиндексированных изменений. Задача упала, коммит прервался,
 * а восстановление оставило «lint-staged automatic backup» в стеше и вернуло
 * `pt.po` к HEAD — 59 свежих переводов «исчезли» (нашлись в `stash@{0}`).
 *
 * Правило: пока прогон перевода жив, `po/*.po` не коммитим. Остановить очередь
 * (или дождаться паузы), либо осознанно обойти гейт: TSSR_COMMIT_WHILE_TRANSLATING=1.
 *
 * Запуск (его зовёт .husky/pre-commit):
 *   node scripts/po_live_guard.mts
 */
import { spawnSync } from "node:child_process";

/** Сколько процессов перевода сейчас живо (node … translate_run/salvage/queue). */
export function translatorsRunning(): number {
  try {
    const r = spawnSync(
      "powershell",
      [
        "-NoProfile",
        "-Command",
        "(Get-CimInstance Win32_Process -Filter \"Name='node.exe'\" | Where-Object { $_.CommandLine -match 'translate_run|translate_salvage|translate_queue' }).Count",
      ],
      { encoding: "utf-8", timeout: 15_000, windowsHide: true },
    );
    const n = Number.parseInt(String(r.stdout).trim(), 10);
    return Number.isFinite(n) ? n : 0;
  } catch {
    return 0; // нет PowerShell — не мешаем коммиту
  }
}

/** Индексированные po-файлы. */
export function stagedPo(): string[] {
  const r = spawnSync("git", ["diff", "--cached", "--name-only"], { encoding: "utf-8" });
  return String(r.stdout ?? "")
    .split(/\r?\n/)
    .filter((f) => /^patches\/ai-voice-pack\/po\/[a-z]{2}\.po$/.test(f));
}

/**
 * Блокировать ли коммит. Чистая функция — вся политика здесь, её и тестируем.
 * Блокируем только если одновременно: идёт прогон И в индексе есть po.
 */
export const shouldBlock = (running: number, po: string[], force = false): boolean =>
  !force && running > 0 && po.length > 0;

const main = (): number => {
  const po = stagedPo();
  if (!po.length) return 0; // po не коммитим — прогон не мешает
  const running = translatorsRunning();
  if (!shouldBlock(running, po, process.env.TSSR_COMMIT_WHILE_TRANSLATING === "1")) return 0;
  console.error(
    [
      "",
      "✖ КОММИТ PO ОСТАНОВЛЕН: идёт прогон перевода, а в индексе есть po-файлы.",
      `  живых процессов перевода: ${running}; в индексе: ${po.join(", ")}`,
      "",
      "  Почему: хук (lint-staged) делает git stash неиндексированных изменений.",
      "  Если задача хука упадёт, коммит прервётся, а свежие правки po останутся",
      "  в стеше, и файл откатится к HEAD (было 2026-11-16: 59 строк pt).",
      "",
      "  Что делать: остановить очередь (translate_ctl stop / закрыть окно прогона),",
      "  либо коммитить осознанно: TSSR_COMMIT_WHILE_TRANSLATING=1 git commit ...",
      "",
      "  Восстановление потерянного: git stash list → git checkout 'stash@{0}' -- patches/ai-voice-pack/po/<lang>.po",
      "",
    ].join("\n"),
  );
  return 1;
};

if (process.argv[1] && import.meta.url === `file://${process.argv[1].replace(/\\/g, "/")}`) process.exit(main());
