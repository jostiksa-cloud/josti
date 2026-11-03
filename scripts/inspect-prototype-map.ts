const html = await Bun.file(
  "C:/Users/admin/Downloads/JOSTI_UIUX_Offline_Prototype/JOSTI_UIUX/index.html",
).text();
const jsStart = html.indexOf("<script>");
const js = html.slice(jsStart + 8, html.lastIndexOf("</script>"));
const cssStart = html.indexOf("<style>");
const css = html.slice(cssStart + 7, html.indexOf("</style>"));

function snippet(label: string, needle: string, len = 1200) {
  const i = js.indexOf(needle);
  console.log(`\n=== ${label} @${i} ===`);
  if (i >= 0) console.log(js.slice(i, i + len));
}

for (const n of [
  "function mapPage",
  "function mapWidget",
  "function trucks",
  "map-wrap",
  "schematic",
  "leaflet",
  "svgMap",
  "viewBox",
]) {
  snippet(n, n, 900);
}

const mapCss = [...css.matchAll(/\.map[\w-]*\{[^}]+\}/g)].map((m) => m[0]);
console.log("\n=== map CSS ===");
console.log(mapCss.join("\n"));
console.log("\n=== svg count ===", (html.match(/<svg/gi) || []).length);
