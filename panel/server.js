import { createServer } from "node:http";
import { pathToFileURL } from "node:url";
import { getDesk } from "./engine/desk.js";
import { assets } from "./engine/assets.js";

const port = Number(process.env.PORT) || 4173;
const types = {
  "/": "text/html; charset=utf-8",
  "/index.html": "text/html; charset=utf-8",
  "/styles.css": "text/css; charset=utf-8",
  "/app.js": "text/javascript; charset=utf-8",
  "/favicon.svg": "image/svg+xml",
  "/favicon.ico": "image/svg+xml",
};

const pages = {
  "/": assets["index.html"],
  "/index.html": assets["index.html"],
  "/styles.css": assets["styles.css"],
  "/app.js": assets["app.js"],
  "/favicon.svg": assets["favicon.svg"],
  "/favicon.ico": assets["favicon.svg"],
};

function routePath(pathname) {
  const path = decodeURIComponent(pathname).replace(/\/+$/, "") || "/";
  if (pages[path]) return path;
  for (const known of Object.keys(pages)) {
    if (known !== "/" && path.endsWith(known)) return known;
  }
  return path;
}

export async function handle(request) {
  const url = new URL(request.url);
  const path = routePath(url.pathname);
  if (path === "/api/desk") {
    try {
      const desk = await getDesk();
      return Response.json(desk, { headers: { "cache-control": "no-store" } });
    } catch (error) {
      console.error("No se pudieron leer las velas", error);
      return Response.json(
        { error: "No se pudieron leer las velas públicas de Binance." },
        { status: 502 },
      );
    }
  }

  const body = pages[path];
  if (body == null) {
    return Response.json({ error: "no encontrado" }, { status: 404 });
  }
  return new Response(body, {
    headers: { "content-type": types[path], "cache-control": "no-cache" },
  });
}

const isDirectRun =
  process.argv[1] != null && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirectRun) {
  const server = createServer(async (request, response) => {
    const incoming = new Request(new URL(request.url ?? "/", `http://127.0.0.1:${port}`), {
      method: request.method,
    });
    const result = await handle(incoming);
    const headers = {};
    result.headers.forEach((value, key) => {
      headers[key] = value;
    });
    response.writeHead(result.status, headers);
    response.end(Buffer.from(await result.arrayBuffer()));
  });
  server.listen(port, "0.0.0.0", () => {
    console.log(`panel http://127.0.0.1:${port}`);
  });
}

export function GET(request) {
  return handle(request);
}
