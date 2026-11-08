import { readFile, writeFile } from "node:fs/promises";

const names = ["index.html", "styles.css", "app.js", "favicon.svg"];
const assets = {};
for (const name of names) {
  assets[name] = await readFile(new URL(`../public/${name}`, import.meta.url), "utf8");
}

const output = `// Generado por scripts/embed-assets.js. No editar a mano.
export const assets = ${JSON.stringify(assets)};
`;

await writeFile(new URL("../engine/assets.js", import.meta.url), output);
