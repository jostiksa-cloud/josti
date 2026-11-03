const s = await Bun.file("mobile/prototype/prototype.js").text();
const markers = ["const icons=", "const I=", "function I(", "icons={"];
for (const m of markers) {
  const i = s.indexOf(m);
  console.log(m, i);
  if (i >= 0) console.log(s.slice(i, i + 1800), "\n---\n");
}
const svgUses = [...s.matchAll(/I\('([a-z-]+)'\)/g)].map((m) => m[1]);
console.log("icon names", [...new Set(svgUses)].sort());
