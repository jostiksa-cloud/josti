const s = await Bun.file("mobile/prototype/prototype.js").text();
const start = s.indexOf("const icons={");
const brace = s.indexOf("{", start);
let depth = 0;
let end = brace;
for (; end < s.length; end++) {
  if (s[end] === "{") depth++;
  else if (s[end] === "}") {
    depth--;
    if (depth === 0) {
      end++;
      break;
    }
  }
}
const objText = s.slice(brace, end);
// Convert JS object literal with single quotes to JSON-ish via Function
const icons = Function(`"use strict"; return (${objText});`)() as Record<string, string>;
await Bun.write("mobile/src/components/icons-paths.json", JSON.stringify(icons, null, 2));
console.log(Object.keys(icons));
