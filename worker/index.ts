/**
 * Musicalis Worker: serves the static site (assets) and the generated score
 * files from R2 under /p/<slug>/<key>/<file>. Keys are content hashes, so the
 * files are immutable and cached for a year.
 */
interface Env {
  ASSETS: Fetcher;
  FILES: R2Bucket;
}

const LANGUAGES = ["fr", "en", "it", "es"];
const AVAILABLE = ["fr"];
const TYPES: Record<string, string> = {
  mei: "application/mei+xml; charset=utf-8",
  musicxml: "application/vnd.recordare.musicxml+xml",
  mid: "audio/midi",
  json: "application/json; charset=utf-8",
  pdf: "application/pdf",
};

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // Root: the visitor's language when available, French otherwise.
    if (url.pathname === "/") {
      const wanted = (request.headers.get("accept-language") ?? "")
        .split(",")
        .map((l) => l.trim().slice(0, 2).toLowerCase())
        .find((l) => LANGUAGES.includes(l) && AVAILABLE.includes(l));
      return Response.redirect(`${url.origin}/${wanted ?? "fr"}/`, 302);
    }

    if (url.pathname.startsWith("/p/")) {
      if (request.method !== "GET" && request.method !== "HEAD") return new Response("Méthode non autorisée", { status: 405 });
      const key = decodeURIComponent(url.pathname.slice(1));
      if (!/^p\/[a-z0-9-]+\/[0-9a-f]{16}\/[\w.-]+$/.test(key)) return new Response("Introuvable", { status: 404 });
      const object = await env.FILES.get(key);
      if (object === null) return new Response("Introuvable", { status: 404 });
      const extension = key.split(".").pop() ?? "";
      const headers = new Headers({
        "content-type": TYPES[extension] ?? "application/octet-stream",
        "cache-control": "public, max-age=31536000, immutable",
        etag: object.httpEtag,
      });
      if (["mid", "musicxml", "pdf"].includes(extension)) {
        const slug = key.split("/")[1];
        headers.set("content-disposition", `attachment; filename="${slug}.${extension}"`);
      }
      return new Response(request.method === "HEAD" ? null : object.body, { headers });
    }

    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;
