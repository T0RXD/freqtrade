import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, resolve, sep } from "node:path";
import { getDesk } from "./engine/desk.js";

const port = Number(process.env.PORT) || 4173;
const publicDir = resolve(import.meta.dirname, "public");
const types = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
};

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url ?? "/", "http://127.0.0.1");
    if (url.pathname === "/api/desk") {
      const desk = await getDesk();
      response.writeHead(200, {
        "content-type": "application/json; charset=utf-8",
        "cache-control": "no-store",
      });
      response.end(JSON.stringify(desk));
      return;
    }

    const requested = url.pathname === "/" ? "/index.html" : url.pathname;
    const target = resolve(publicDir, `.${requested}`);
    if (!target.startsWith(`${publicDir}${sep}`)) {
      response.writeHead(400, { "content-type": "text/plain; charset=utf-8" });
      response.end("ruta inválida");
      return;
    }
    const body = await readFile(target);
    response.writeHead(200, { "content-type": types[extname(target)] ?? "application/octet-stream" });
    response.end(body);
  } catch (error) {
    const missing = error && typeof error === "object" && "code" in error && error.code === "ENOENT";
    response.writeHead(missing ? 404 : 502, { "content-type": "application/json; charset=utf-8" });
    response.end(
      JSON.stringify({
        error: missing ? "no encontrado" : "No se pudieron leer las velas públicas de Binance.",
      }),
    );
  }
});

server.listen(port, "127.0.0.1", () => {
  console.log(`panel http://127.0.0.1:${port}`);
});
