#!/usr/bin/env node
/** Local preview for tests: the built site (dist/) plus the generated score files (build/files/) under /p/. */
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const port = Number(process.env.PORT ?? 4411);
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".mei": "application/xml", ".json": "application/json", ".mid": "audio/midi", ".pdf": "application/pdf", ".musicxml": "application/xml", ".svg": "image/svg+xml", ".png": "image/png", ".woff2": "font/woff2", ".woff": "font/woff" };

createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", "http://localhost");
  if (url.pathname === "/") { res.writeHead(302, { location: "/fr/" }); res.end(); return; }
  let file = url.pathname.startsWith("/p/") ? path.join(root, "build/files", url.pathname) : path.join(root, "dist", url.pathname);
  if (!file.startsWith(root)) { res.statusCode = 400; res.end(); return; }
  if (file.endsWith("/")) file += "index.html";
  try {
    const body = await readFile(file);
    res.writeHead(200, { "content-type": TYPES[path.extname(file)] ?? "application/octet-stream" });
    res.end(body);
  } catch {
    res.writeHead(404, { "content-type": "text/html; charset=utf-8" });
    res.end(await readFile(path.join(root, "dist/404.html")).catch(() => "404"));
  }
}).listen(port, () => console.log(`http://localhost:${port}`));
