/**
 * check — состояние публикации на Nexus (без браузера).
 *
 * Проверяет:
 *   1) одобрена ли игра: есть ли «The Survival of Sarah Rose» в games.json;
 *   2) подхвачен ли extension каталогом Vortex (`/v3/vortex/extensions`);
 *   3) открываются ли публичные страницы (mод/игра/расширение) — HTTP-коды.
 *
 * Запуск: node .opencode/skills/nexus-publish/check.mts
 * Для деталей по файлам (версии/groupId) нужен cookie-сеанс — см. MAP.md (CDP).
 */
import { readFileSync } from "node:fs";

const KEY_PATH = "C:/Users/Domo/.config/opencode/secrets/nexus-apikey.txt";
const GAME_NAME = "The Survival of Sarah Rose";
const PAGES = {
  "мод (публичная)": "https://www.nexusmods.com/mods/1?game_id=11043",
  "игра (домен)": "https://www.nexusmods.com/thesurvivalofsarahrose",
  "extension (Modding Tools)": "https://www.nexusmods.com/site/mods/2600",
};

async function gamesCatalog(): Promise<void> {
  const res = await fetch("https://data.nexusmods.com/file/nexus-data/games.json");
  const raw = (await res.json()) as unknown;
  const list = (Array.isArray(raw) ? raw : ((raw as { games?: unknown[] }).games ?? [])) as {
    name?: string;
    id?: number;
    domain_name?: string;
  }[];
  const hit = list.find((g) => (g.name ?? "").toLowerCase() === GAME_NAME.toLowerCase());
  console.log(
    `1) игра в каталоге Nexus (${list.length} игр): ${hit ? `ДА — id ${hit.id}, домен ${hit.domain_name}` : "НЕТ — ждём апрува"}`,
  );
}

async function vortexCatalog(): Promise<void> {
  let key = "";
  try {
    key = readFileSync(KEY_PATH, "utf-8").trim();
  } catch {
    console.log("2) каталог Vortex: нет API-ключа, пропуск");
    return;
  }
  const res = await fetch("https://api.nexusmods.com/v3/vortex/extensions", {
    headers: { apikey: key, accept: "application/json" },
  });
  if (!res.ok) {
    console.log(`2) каталог Vortex: HTTP ${res.status}`);
    return;
  }
  const blob = JSON.stringify(await res.json());
  const found = blob.toLowerCase().includes("sarah");
  console.log(`2) наше расширение в каталоге Vortex: ${found ? "ДА" : "пока НЕТ (подхват ≤2 ч после публикации)"}`);
}

async function pages(): Promise<void> {
  for (const [label, url] of Object.entries(PAGES)) {
    const res = await fetch(url, { redirect: "manual" });
    const note =
      res.status === 404
        ? " (404 — ещё не опубликовано)"
        : res.status === 403
          ? " (403 = Cloudflare, проверить в браузере)"
          : "";
    console.log(`3) ${label}: HTTP ${res.status}${note}`);
  }
}

await gamesCatalog();
await vortexCatalog();
await pages();
