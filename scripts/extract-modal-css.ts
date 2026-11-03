const css = await Bun.file("mobile/prototype/prototype.css").text();
function rules(name: string) {
  const needle = `.${name}`;
  const out: string[] = [];
  let i = 0;
  while ((i = css.indexOf(needle, i)) >= 0) {
    const before = css[i - 1];
    if (before && /[\w-]/.test(before)) {
      i += needle.length;
      continue;
    }
    const brace = css.indexOf("{", i);
    if (brace < 0) break;
    let depth = 0;
    let j = brace;
    for (; j < css.length; j++) {
      if (css[j] === "{") depth++;
      else if (css[j] === "}") {
        depth--;
        if (depth === 0) {
          j++;
          break;
        }
      }
    }
    out.push(css.slice(i, j));
    i = j;
  }
  return out;
}
const names = [
  "modal-backdrop",
  "modal",
  "modal-head",
  "modal-body",
  "modal-foot",
  "toast",
  "btn",
  "cyan",
  "ghost",
  "round",
  "stat",
  "hero",
  "chip",
  "page-title",
  "empty",
  "notice",
  "pad",
  "record",
  "pill",
];
const payload: Record<string, string[]> = {};
for (const n of names) payload[n] = rules(n).slice(0, 4);
await Bun.write("mobile/prototype/css-snippets.json", JSON.stringify(payload, null, 2));
console.log(Object.fromEntries(Object.entries(payload).map(([k, v]) => [k, v.length])));
