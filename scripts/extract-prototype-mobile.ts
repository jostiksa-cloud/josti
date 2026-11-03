import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const html = await Bun.file(
  "C:/Users/admin/Downloads/JOSTI_UIUX_Offline_Prototype/JOSTI_UIUX/index.html",
).text();
const styleStart = html.indexOf("<style>");
const styleEnd = html.indexOf("</style>");
const scriptStart = html.indexOf("<script>");
const scriptEnd = html.lastIndexOf("</script>");
const style = html.slice(styleStart + 7, styleEnd);
const script = html.slice(scriptStart + 8, scriptEnd);

const out = join(process.cwd(), "mobile", "prototype");
mkdirSync(out, { recursive: true });
writeFileSync(join(out, "prototype.css"), style);
writeFileSync(join(out, "prototype.js"), script);

const inventory = {
  cssBytes: style.length,
  jsBytes: script.length,
  mediaQueries: [...style.matchAll(/@media[^{]+/g)].map((m) => m[0].trim()),
  cssClasses: [
    ...new Set(
      [...style.matchAll(/\.([a-zA-Z][\w-]*)/g)].map((m) => m[1]).filter(Boolean),
    ),
  ].sort(),
  functions: [
    ...new Set(
      [...script.matchAll(/function\s+([a-zA-Z_][\w]*)/g)].map((m) => m[1]),
    ),
  ],
  modalSnippet: (() => {
    const i = script.indexOf("function modal");
    return i >= 0 ? script.slice(i, i + 1200) : "";
  })(),
  toastSnippet: (() => {
    const i = script.indexOf("function toast");
    return i >= 0 ? script.slice(i, i + 600) : "";
  })(),
  pageHeadSnippet: (() => {
    const i = script.indexOf("function pageHead");
    return i >= 0 ? script.slice(i, i + 800) : "";
  })(),
  menus: script.match(/menus\s*=\s*\{[\s\S]*?\n\}/)?.[0] ?? "",
  svgCount: (html.match(/<svg/gi) ?? []).length,
};
writeFileSync(join(out, "inventory.json"), JSON.stringify(inventory, null, 2));
console.log(
  JSON.stringify(
    {
      cssBytes: inventory.cssBytes,
      jsBytes: inventory.jsBytes,
      media: inventory.mediaQueries,
      fnCount: inventory.functions.length,
      classCount: inventory.cssClasses.length,
      svgCount: inventory.svgCount,
      hasModal: inventory.modalSnippet.length > 0,
      menus: inventory.menus.slice(0, 400),
    },
    null,
    2,
  ),
);
