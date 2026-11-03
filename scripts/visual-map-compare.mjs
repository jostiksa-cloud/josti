/**
 * Capture guest map screenshots: live web app vs offline prototype.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";

const chrome =
  process.env.CHROME_PATH ||
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const outDir = join(process.cwd(), "docs", "visual-checks");
mkdirSync(outDir, { recursive: true });

const prototype = pathToFileURL(
  "c:/Users/admin/Downloads/JOSTI_UIUX_Offline_Prototype/JOSTI_UIUX/index.html",
).href;

const viewports = [
  { name: "375", w: 375, h: 812 },
  { name: "768", w: 768, h: 1024 },
  { name: "1440", w: 1440, h: 900 },
];

const targets = [
  { key: "web_map", url: "http://127.0.0.1:5173/map" },
  { key: "proto_map", url: prototype },
];

const results = [];
for (const target of targets) {
  for (const vp of viewports) {
    const file = join(outDir, `${target.key}_${vp.name}.png`);
    const args = [
      "--headless=new",
      "--disable-gpu",
      "--hide-scrollbars",
      "--allow-file-access-from-files",
      `--window-size=${vp.w},${vp.h}`,
      `--screenshot=${file}`,
      "--virtual-time-budget=5000",
      target.url,
    ];
    const run = spawnSync(chrome, args, { encoding: "utf8", timeout: 45000 });
    results.push({
      file,
      status: run.status,
      stderr: (run.stderr || "").slice(0, 240),
    });
  }
}

writeFileSync(join(outDir, "map-compare.json"), JSON.stringify(results, null, 2));
console.log(JSON.stringify(results, null, 2));
