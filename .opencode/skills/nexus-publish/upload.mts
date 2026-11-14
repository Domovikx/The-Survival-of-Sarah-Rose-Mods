/**
 * upload — заливка новой версии пакета на Nexus Mods (API v3).
 *
 * Использование:
 *   node .opencode/skills/nexus-publish/upload.mts --version 1.0.3
 *   node .opencode/skills/nexus-publish/upload.mts --version 1.0.3 --only "Voice RU"
 *   node .opencode/skills/nexus-publish/upload.mts --version 1.0.3 --dry
 *
 * Требует: personal API key в ~/.config/opencode/secrets/nexus-apikey.txt.
 * Группы файлов (groupId) — в groups.json рядом; обновлять через GraphQL (MAP.md).
 * ⚠️ Один прогон на файл: повтор создаёт дубль версии с тем же номером.
 */
import { createHash } from "node:crypto";
import { createReadStream, readFileSync, statSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

type Entry = { name: string; group: number; archive: string; category: string; updateModVersion?: boolean };
type Groups = { mod: { gameId: string; modId: string }; files: Entry[] };

const HERE = dirname(fileURLToPath(import.meta.url));
const GROUPS = JSON.parse(readFileSync(join(HERE, "groups.json"), "utf-8")) as Groups;
const KEY_PATH = "C:/Users/Domo/.config/opencode/secrets/nexus-apikey.txt";
const API = "https://api.nexusmods.com/v3";
const DIST = "dist";

const argv = process.argv.slice(2);
const arg = (name: string): string | undefined => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : undefined;
};
const version = arg("version");
const only = arg("only");
const dry = argv.includes("--dry");
if (!version) {
  console.error("нужен --version X.Y.Z");
  process.exit(1);
}
if (dry) {
  for (const f of GROUPS.files.filter((x) => !only || x.name.includes(only))) {
    console.log(
      `[dry] ${f.name} → group ${f.group} ← ${f.archive} (${Math.round(statSync(join(DIST, f.archive)).size / 1048576)} MiB)`,
    );
  }
  process.exit(0);
}

const KEY = readFileSync(KEY_PATH, "utf-8").trim();
const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: { apikey: KEY, accept: "application/json", ...init.headers },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${path} -> ${res.status} ${text.slice(0, 300)}`);
  return text ? (JSON.parse(text) as T) : ({} as T);
}

async function uploadArchive(path: string): Promise<string> {
  const buf = readFileSync(path);
  const md5hex = createHash("md5").update(buf).digest("hex");
  const filename = basename(path);
  const created = await api<{ data: { id?: string; upload_id?: string; presigned_url: string } }>("/uploads", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ size_bytes: buf.length, filename, md5: md5hex }),
  });
  const uploadId = created.data.id ?? created.data.upload_id;
  if (!uploadId) throw new Error("в ответе /uploads нет upload_id");

  const put = await fetch(created.data.presigned_url, {
    method: "PUT",
    headers: {
      "content-disposition": `attachment; filename="${filename}"`,
      "content-md5": Buffer.from(md5hex, "hex").toString("base64"),
      "content-type": "application/octet-stream",
      "content-length": String(buf.length),
    },
    body: createReadStream(path) as unknown as BodyInit,
    duplex: "half",
  } as RequestInit);
  if (!put.ok) throw new Error(`PUT -> ${put.status} ${(await put.text()).slice(0, 200)}`);

  await api(`/uploads/${uploadId}/finalise`, { method: "POST" });
  for (let i = 0; i < 30; i++) {
    const state = await api<{ data: { state?: string } }>(`/uploads/${uploadId}`);
    if (state.data.state === "available") return uploadId;
    await sleep(2000);
  }
  throw new Error("upload не стал available");
}

for (const entry of GROUPS.files) {
  if (only && !entry.name.includes(only)) continue;
  const path = join(DIST, entry.archive);
  process.stdout.write(`${entry.name}: ${entry.archive} ... `);
  try {
    const uploadId = await uploadArchive(path);
    const created = await api<{ data: { file?: { id: string } } }>(`/mod-files/${entry.group}/versions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        upload_id: uploadId,
        name: entry.name,
        version,
        file_category: entry.category,
        archive_existing_file: true,
        update_mod_version: entry.updateModVersion === true,
      }),
    });
    console.log(`ok (upload ${uploadId.slice(0, 8)}, file ${created.data?.file?.id ?? "?"})`);
  } catch (err) {
    console.log("ОШИБКА:", String(err).slice(0, 200));
    process.exitCode = 1;
  }
}
