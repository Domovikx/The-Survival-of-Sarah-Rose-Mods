/**
 * serve_cors.mts — статик-сервер dist/ с CORS-заголовком для браузерного
 * аплоада: fetch('http://127.0.0.1:PORT/<zip>') на https-странице Nexus
 * (loopback = trustworthy origin) отдаёт файл как Blob, и он заливается
 * через input[type=file] без трансфера через CDP (лимит 50MB обойдён).
 * Запуск: node tmp/serve_cors.mts 8777   (каталог — dist/ репы)
 */
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";

const ROOT = join(process.cwd(), "dist");
const PORT = Number(process.argv[2] || 8777);
const MIME: Record<string, string> = {
  ".zip": "application/zip",
  ".7z": "application/x-7z-compressed",
  ".json": "application/json",
};

createServer(async (req, res) => {
  // Private Network Access: https-страница (nexusmods.com) -> loopback требует
  // preflight с согласием; иначе Chrome режет fetch («Failed to fetch»).
  const cors = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Private-Network": "true",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "*",
  };
  if (req.method === "OPTIONS") {
    res.writeHead(204, cors).end();
    return;
  }
  try {
    const name = normalize(decodeURIComponent((req.url || "/").slice(1)));
    if (!name || name.includes("..")) {
      res.writeHead(400, cors).end("bad name");
      return;
    }
    const data = await readFile(join(ROOT, name));
    res.writeHead(200, {
      ...cors,
      "Content-Type": MIME[extname(name).toLowerCase()] || "application/octet-stream",
      "Content-Length": data.length,
    });
    res.end(data);
  } catch {
    res.writeHead(404, cors).end("not found");
  }
}).listen(PORT, "127.0.0.1", () => console.log(`serve_cors: http://127.0.0.1:${PORT}/ (root: dist/)`));
