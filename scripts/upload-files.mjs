#!/usr/bin/env node
/**
 * Uploads the generated score files (build/files/p/**) to the R2 bucket. Keys are
 * content hashes: an object that already exists is never sent again.
 *   CLOUDFLARE_API_TOKEN / CLOUDFLARE_ACCOUNT_ID in the environment.
 */
import { execFileSync } from "node:child_process";
import { readdir } from "node:fs/promises";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const files = path.join(root, "build/files");
const wrangler = path.join(root, "node_modules/.bin/wrangler");
const BUCKET = "musicalis-files";

async function walk(dir) {
  const out = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    out.push(...(e.isDirectory() ? await walk(p) : [p]));
  }
  return out;
}

const exists = (key) => {
  try {
    execFileSync(wrangler, ["r2", "object", "get", `${BUCKET}/${key}`, "--remote", "--pipe"], { stdio: ["ignore", "ignore", "ignore"] });
    return true;
  } catch {
    return false;
  }
};

let sent = 0;
for (const file of await walk(path.join(files, "p"))) {
  const key = path.relative(files, file).split(path.sep).join("/");
  if (exists(key)) continue;
  execFileSync(wrangler, ["r2", "object", "put", `${BUCKET}/${key}`, "--file", file, "--remote"], { stdio: ["ignore", "ignore", "inherit"] });
  sent += 1;
}
console.log(`R2 : ${sent} fichier(s) envoyé(s).`);
