import assert from "node:assert/strict";
import test from "node:test";
import { handle } from "./server.js";

test("la raíz devuelve la página y no el error de archivo", async () => {
  const response = await handle(new Request("http://127.0.0.1/"));
  const body = await response.text();
  assert.equal(response.status, 200);
  assert.match(body, /SampleStrategy/);
  assert.equal(body.includes("no encontrado"), false);
});

test("el estilo y el cliente viajan con el servidor", async () => {
  const style = await handle(new Request("http://127.0.0.1/styles.css"));
  const script = await handle(new Request("http://127.0.0.1/app.js"));
  assert.equal(style.status, 200);
  assert.match(await style.text(), /\.top/);
  assert.equal(script.status, 200);
  assert.match(await script.text(), /\/api\/desk/);
});
