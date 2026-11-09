#!/usr/bin/env node
/** Local preview for tests: serves dist/ exactly as GitHub Pages does (404.html for missing paths). */
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const dist = path.join(root, "dist");
const port = Number(process.env.PORT ?? 4411);
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".mei": "application/xml", ".json": "application/json", ".mid": "audio/midi", ".pdf": "application/pdf", ".musicxml": "application/xml", ".svg": "image/svg+xml", ".png": "image/png", ".woff2": "font/woff2", ".woff": "font/woff" };

createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", "http://localhost");
  let file = path.join(dist, decodeURIComponent(url.pathname));
  if (!file.startsWith(dist)) { res.statusCode = 400; res.end(); return; }
  if (file.endsWith(path.sep) || file.endsWith("/")) file += "index.html";
  try {
    const body = await readFile(file);
    res.writeHead(200, { "content-type": TYPES[path.extname(file)] ?? "application/octet-stream" });
    res.end(body);
  } catch {
    res.writeHead(404, { "content-type": "text/html; charset=utf-8" });
    res.end(await readFile(path.join(dist, "404.html")).catch(() => "404"));
  }
}).listen(port, () => console.log(`http://localhost:${port}`));
