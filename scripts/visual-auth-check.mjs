import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

const out = join(process.cwd(), "docs", "visual-checks");
mkdirSync(out, { recursive: true });
const chrome =
  process.env.CHROME_PATH ||
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";

const browser = await chromium.launch({
  executablePath: chrome,
  headless: true,
  args: ["--disable-dev-shm-usage"],
});

async function shot(page, name, width) {
  await page.setViewportSize({ width, height: width < 800 ? 844 : 900 });
  await page.waitForTimeout(800);
  await page.screenshot({ path: join(out, `${name}_${width}.png`), fullPage: false });
  console.log("wrote", name, width);
}

try {
  const admin = await browser.newPage();
  admin.setDefaultTimeout(15000);
  await admin.goto("http://127.0.0.1:5174/login", { waitUntil: "domcontentloaded" });
  await admin.fill('input[name="email"]', "admin@josti.test");
  await admin.fill('input[name="password"]', "AdminPass123");
  await admin.click('button[type="submit"]');
  await admin.waitForURL("**/", { timeout: 15000 }).catch(() => {});
  await admin.waitForTimeout(1500);
  for (const w of [375, 1440]) {
    await admin.setViewportSize({ width: w, height: w < 800 ? 844 : 900 });
    await admin.goto("http://127.0.0.1:5174/", { waitUntil: "domcontentloaded" });
    await shot(admin, "admin_overview", w);
    await admin.goto("http://127.0.0.1:5174/users", { waitUntil: "domcontentloaded" });
    await shot(admin, "admin_users", w);
    await admin.goto("http://127.0.0.1:5174/finance", { waitUntil: "domcontentloaded" });
    await shot(admin, "admin_finance", w);
  }

  const web = await browser.newPage();
  web.setDefaultTimeout(15000);
  await web.goto("http://127.0.0.1:5173/login", { waitUntil: "domcontentloaded" });
  await web.locator(".role-card").first().click().catch(() => {});
  await web.waitForTimeout(300);
  await web.locator('input[type="email"], input[name="email"]').first().fill("merchant@josti.test");
  await web.locator('input[type="password"], input[name="password"]').first().fill("Password123");
  await web.click('button[type="submit"]');
  await web.waitForTimeout(2000);
  for (const w of [375, 1440]) {
    await web.goto("http://127.0.0.1:5173/", { waitUntil: "domcontentloaded" });
    await shot(web, "web_dashboard", w);
  }
  console.log("done");
} catch (error) {
  console.error("visual-auth failed", error);
  process.exitCode = 1;
} finally {
  await browser.close().catch(() => {});
}
