import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

const proto =
  "C:/Users/admin/Downloads/JOSTI_UIUX_Offline_Prototype/JOSTI_UIUX/index.html";
const html = await Bun.file(proto).text();
const styleMatch = html.match(/<style>([\s\S]*?)<\/style>/i);
if (!styleMatch) throw new Error("No style block in prototype");
const css = styleMatch[1];
const outDir = join(process.cwd(), "packages", "ui", "src");
await mkdir(outDir, { recursive: true });
await writeFile(join(outDir, "prototype-raw.css"), css, "utf8");
console.log("extracted", css.length, "chars to packages/ui/src/prototype-raw.css");

// Also dump page function names / menus for inventory
const menus = html.match(/menus=\{[^}]+\}/);
const pages = [...html.matchAll(/function (\w+Page|\w+)\(/g)].map((m) => m[1]);
await writeFile(
  join(outDir, "prototype-inventory.json"),
  JSON.stringify(
    {
      menus: menus?.[0] ?? null,
      functions: [...new Set(pages)].slice(0, 80),
      cssBytes: css.length,
    },
    null,
    2,
  ),
  "utf8",
);
