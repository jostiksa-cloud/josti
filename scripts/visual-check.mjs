/**
 * Headless Chrome visual pass for web + admin at key viewports.
 * Writes PNGs under docs/visual-checks/
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const chrome =
  process.env.CHROME_PATH ||
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const outDir = join(process.cwd(), "docs", "visual-checks");
mkdirSync(outDir, { recursive: true });

const viewports = [
  { name: "375", w: 375, h: 812 },
  { name: "768", w: 768, h: 1024 },
  { name: "1440", w: 1440, h: 900 },
];

const targets = [
  { app: "web", url: "http://127.0.0.1:5173/map" },
  { app: "web", url: "http://127.0.0.1:5173/login" },
  { app: "admin", url: "http://127.0.0.1:5174/login" },
];

const results = [];
for (const target of targets) {
  for (const vp of viewports) {
    const pathSeg = new URL(target.url).pathname.replace(/\W+/g, "_") || "root";
    const file = join(outDir, `${target.app}${pathSeg}_${vp.name}.png`);
    const args = [
      "--headless=new",
      "--disable-gpu",
      "--hide-scrollbars",
      `--window-size=${vp.w},${vp.h}`,
      `--screenshot=${file}`,
      "--virtual-time-budget=4000",
      target.url,
    ];
    const run = spawnSync(chrome, args, { encoding: "utf8", timeout: 30000 });
    results.push({
      file,
      status: run.status,
      stderr: (run.stderr || "").slice(0, 200),
    });
  }
}

writeFileSync(join(outDir, "index.json"), JSON.stringify(results, null, 2));
console.log(JSON.stringify(results, null, 2));
