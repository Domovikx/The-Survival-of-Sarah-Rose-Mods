/**
 * health_report.mts — сводка журнала мониторинга (tmp/health.csv).
 *
 * Назначение. Журнал пишется с интервалом 15 секунд; по строкам трудно оценить,
 * были ли пики мощности или температуры. Отчёт выводит min/среднее/max по каждому
 * показателю, список остановок стража и последние записи.
 *
 * Применение: анализ после сбоя (видно, росли ли температура и мощность перед
 * отключением) и плановая проверка режима нагрузки.
 *
 * Запуск: node --experimental-strip-types scripts/health_report.mts [--last 10]
 */
import { existsSync, readFileSync } from "node:fs";

const args = process.argv.slice(2);
const lastAt = args.indexOf("--last");
const LAST = lastAt >= 0 ? Number(args[lastAt + 1]) || 10 : 10;
const CSV = "tmp/health.csv";

if (!existsSync(CSV)) {
  console.log("нет tmp/health.csv — страж не запускался");
  process.exit(0);
}

const rows = readFileSync(CSV, "utf-8")
  .split(/\r?\n/)
  .filter((l) => l.trim() && !l.startsWith("ts,"))
  .map((line) => {
    const c = line.split(",");
    if (c[1] === "GUARD") return { ts: c[0]!, guard: line.slice(line.indexOf("STOPPED")) };
    return {
      ts: c[0]!,
      gpuTemp: Number(c[1]),
      gpuPower: Number(c[2]),
      gpuLimit: Number(c[3]),
      gpuUtil: Number(c[4]),
      vram: Number(c[5]),
      cpu: Number(c[6]),
      ramFreePct: Number(c[7]),
      ramFreeGb: Number(c[8]),
      diskGb: Number(c[9]),
      note: c[10] ?? "",
    };
  });

type Sample = Extract<(typeof rows)[number], { gpuTemp: number }>;
const samples = rows.filter((r): r is Sample => "gpuTemp" in r && Number.isFinite(r.gpuTemp));
if (!samples.length) {
  console.log("в health.csv нет числовых замеров");
  process.exit(0);
}

const stat = (get: (s: Sample) => number): string => {
  const v = samples.map(get).filter((x) => Number.isFinite(x));
  if (!v.length) return "n/a";
  const min = Math.min(...v);
  const max = Math.max(...v);
  const avg = v.reduce((a, b) => a + b, 0) / v.length;
  return `мин ${avg === min ? min : min} / сред ${avg.toFixed(1)} / макс ${max}`;
};

console.log(`замеров: ${samples.length} | окно: ${samples[0]!.ts} … ${samples.at(-1)!.ts}`);
console.log(`GPU °C        : ${stat((s) => s.gpuTemp)}`);
console.log(`GPU Вт        : ${stat((s) => s.gpuPower)}  (лимит ${samples[0]!.gpuLimit})`);
console.log(`GPU нагрузка %: ${stat((s) => s.gpuUtil)}`);
console.log(`VRAM МиБ      : ${stat((s) => s.vram)}`);
console.log(`CPU %         : ${stat((s) => s.cpu)}`);
console.log(`RAM свободно %: ${stat((s) => s.ramFreePct)}`);

const guards = rows.filter((r) => "guard" in r);
if (guards.length) {
  console.log(`\nостановки стражем: ${guards.length}`);
  for (const g of guards.slice(-3)) console.log(`  ${g.ts} — ${g.guard}`);
}

console.log(`\nпоследние ${LAST} замеров:`);
for (const s of samples.slice(-LAST)) {
  console.log(
    `  ${s.ts.slice(11, 19)}  GPU ${String(s.gpuTemp).padStart(5)}°C ${String(s.gpuPower).padStart(6)}Вт ${String(s.gpuUtil).padStart(3)}%  RAM ${String(s.ramFreePct).padStart(2)}%  ${s.note}`,
  );
}
