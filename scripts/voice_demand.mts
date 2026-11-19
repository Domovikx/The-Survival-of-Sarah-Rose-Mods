/**
 * voice_demand.mts — сколько раз скачали озвучку по языкам, СУММАРНО по всем
 * релизам. GitHub UI счётчиков не показывает, но API отдаёт download_count
 * по каждому ассету; при выпуске нового релиза счётчики стартуют с нуля,
 * поэтому суммируем по имени ассета, а не по конкретному тегу.
 *
 * Запуск: node scripts/voice_demand.mts [--json tmp/voice_demand.json]
 * Без токена: 60 запросов/час на IP (нам хватает — 1-2 запроса).
 */
import { writeFileSync } from "node:fs";

const REPO = "Domovikx/The-Survival-of-Sarah-Rose-Mods";
const jsonAt = process.argv.indexOf("--json");
const OUT = jsonAt >= 0 ? process.argv[jsonAt + 1] : "tmp/voice_demand.json";

type Asset = { name: string; download_count: number };
type Release = { tag_name: string; published_at: string; assets: Asset[] };

const releases: Release[] = [];
for (let page = 1; page <= 10; page++) {
  const r = await fetch(`https://api.github.com/repos/${REPO}/releases?per_page=100&page=${page}`, {
    headers: { "accept": "application/vnd.github+json", "user-agent": "tssr-voice-demand" },
  });
  if (!r.ok) {
    console.error(`GitHub API ${r.status}: ${await r.text()}`);
    process.exit(1);
  }
  const batch = (await r.json()) as Release[];
  releases.push(...batch);
  if (batch.length < 100) break;
}

const voice = new Map<string, number>();
let core = 0;
for (const rel of releases) {
  for (const a of rel.assets) {
    if (a.name === "TSSR-AI-Voice-Pack-main.7z") {
      core += a.download_count;
      continue;
    }
    const m = /^TSSR-AI-Voice-Pack-voice-([a-z]{2})\.7z$/.exec(a.name);
    if (!m) continue;
    voice.set(m[1]!, (voice.get(m[1]!) ?? 0) + a.download_count);
  }
}

const rows = [...voice.entries()].sort((a, b) => b[1] - a[1]);
const total = rows.reduce((s, [, n]) => s + n, 0);

console.log(`релизов: ${releases.length} | скачиваний main: ${core} | voice-паков всего: ${total}`);
for (const [lang, n] of rows) console.log(`  ${lang}: ${n}`);

writeFileSync(
  OUT,
  `${JSON.stringify({ at: new Date().toISOString(), releases: releases.length, core, total, voice: Object.fromEntries(rows) }, null, 2)}\n`,
  "utf-8",
);
console.log(`отчёт: ${OUT}`);
