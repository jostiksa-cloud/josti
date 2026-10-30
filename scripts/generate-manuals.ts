import { spawn } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const root = path.resolve(import.meta.dir, "..");
const manuals = path.join(root, "docs", "manuals");
const buildDir = path.join(manuals, "build");
const edge =
  process.env.EDGE_PATH ?? "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";

const tajawalRegular = readFileSync(path.join(manuals, "fonts", "Tajawal-Regular.ttf")).toString(
  "base64",
);
const tajawalBold = readFileSync(path.join(manuals, "fonts", "Tajawal-Bold.ttf")).toString(
  "base64",
);
const jakartaRegular = readFileSync(
  path.join(root, "web", "public", "brand", "plus-jakarta-sans-latin-400-normal.woff2"),
).toString("base64");
const jakartaBold = readFileSync(
  path.join(root, "web", "public", "brand", "plus-jakarta-sans-latin-700-normal.woff2"),
).toString("base64");
const logo = readFileSync(
  path.join(root, "web", "public", "brand", "JOSTI_Symbol_Color.svg"),
  "utf8",
)
  .replace(/<\?xml[^>]*>/, "")
  .replace(/<title>[\s\S]*?<\/desc>/, "");

type Block =
  | { kind: "h2" | "h3"; text: string; id: string }
  | { kind: "p"; html: string }
  | { kind: "ul" | "ol"; items: string[] }
  | { kind: "pre"; text: string }
  | { kind: "table"; headers: string[]; rows: string[][] };

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function inline(value: string): string {
  return escapeHtml(value)
    .replaceAll(/`([^`]+)`/g, '<code dir="ltr">$1</code>')
    .replaceAll(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
}

function slug(text: string, index: number): string {
  const ascii = text
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, "-")
    .replaceAll(/^-|-$/g, "");
  return ascii.length > 0 ? `${ascii}-${index}` : `section-${index}`;
}

function parseMarkdown(source: string): { title: string; subtitle: string; blocks: Block[] } {
  const lines = source.replaceAll("\r\n", "\n").split("\n");
  const blocks: Block[] = [];
  let title = "JOSTI";
  let subtitle = "";
  let index = 0;
  let i = 0;

  while (i < lines.length) {
    const line = lines[i] ?? "";
    if (line.startsWith("# ")) {
      title = line.slice(2).trim();
      i += 1;
      continue;
    }
    if (subtitle.length === 0 && line.trim().length > 0 && !line.startsWith("#")) {
      subtitle = line.trim();
      i += 1;
      continue;
    }
    if (line.trim().length === 0) {
      i += 1;
      continue;
    }
    if (line.startsWith("## ")) {
      index += 1;
      blocks.push({ kind: "h2", text: line.slice(3).trim(), id: slug(line.slice(3), index) });
      i += 1;
      continue;
    }
    if (line.startsWith("### ")) {
      index += 1;
      blocks.push({ kind: "h3", text: line.slice(4).trim(), id: slug(line.slice(4), index) });
      i += 1;
      continue;
    }
    if (line.startsWith("```")) {
      const code: string[] = [];
      i += 1;
      while (i < lines.length && !(lines[i] ?? "").startsWith("```")) {
        code.push(lines[i] ?? "");
        i += 1;
      }
      i += 1;
      blocks.push({ kind: "pre", text: code.join("\n") });
      continue;
    }
    if (line.startsWith("|")) {
      const rows: string[][] = [];
      while (i < lines.length && (lines[i] ?? "").startsWith("|")) {
        const cells = (lines[i] ?? "")
          .split("|")
          .slice(1, -1)
          .map((cell) => cell.trim());
        if (!cells.every((cell) => /^:?-+:?$/.test(cell))) rows.push(cells);
        i += 1;
      }
      const headers = rows.shift() ?? [];
      blocks.push({ kind: "table", headers, rows });
      continue;
    }
    if (line.startsWith("- ")) {
      const items: string[] = [];
      while (i < lines.length && (lines[i] ?? "").startsWith("- ")) {
        items.push((lines[i] ?? "").slice(2).trim());
        i += 1;
      }
      blocks.push({ kind: "ul", items });
      continue;
    }
    if (/^\d+\. /.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\d+\. /.test(lines[i] ?? "")) {
        items.push((lines[i] ?? "").replace(/^\d+\. /, "").trim());
        i += 1;
      }
      blocks.push({ kind: "ol", items });
      continue;
    }
    const paragraph: string[] = [line.trim()];
    i += 1;
    while (
      i < lines.length &&
      (lines[i] ?? "").trim().length > 0 &&
      !(lines[i] ?? "").startsWith("#") &&
      !(lines[i] ?? "").startsWith("|") &&
      !(lines[i] ?? "").startsWith("- ") &&
      !(lines[i] ?? "").startsWith("```") &&
      !/^\d+\. /.test(lines[i] ?? "")
    ) {
      paragraph.push((lines[i] ?? "").trim());
      i += 1;
    }
    blocks.push({ kind: "p", html: inline(paragraph.join(" ")) });
  }

  return { title, subtitle, blocks };
}

function renderBlocks(blocks: Block[]): string {
  return blocks
    .map((block) => {
      if (block.kind === "h2" || block.kind === "h3") {
        const tag = block.kind === "h2" ? "h2" : "h3";
        return `<${tag} id="${block.id}">${inline(block.text)}</${tag}>`;
      }
      if (block.kind === "p") return `<p>${block.html}</p>`;
      if (block.kind === "ul" || block.kind === "ol") {
        const tag = block.kind;
        return `<${tag}>${block.items.map((item) => `<li>${inline(item)}</li>`).join("")}</${tag}>`;
      }
      if (block.kind === "pre") {
        return `<pre dir="ltr">${escapeHtml(block.text)}</pre>`;
      }
      if (block.kind !== "table") return "";
      const head = block.headers.map((cell) => `<th>${inline(cell)}</th>`).join("");
      const body = block.rows
        .map((row) => `<tr>${row.map((cell) => `<td>${inline(cell)}</td>`).join("")}</tr>`)
        .join("");
      return `<table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
    })
    .join("\n");
}

function renderHtml(language: "en" | "ar", source: string): string {
  const parsed = parseMarkdown(source);
  const dir = language === "ar" ? "rtl" : "ltr";
  const tocLabel = language === "ar" ? "المحتويات" : "Contents";
  const coverKicker = language === "ar" ? "دليل التشغيل" : "Operations Guide";
  const coverOrg =
    language === "ar"
      ? "شركة النقل الذكي · تنفيذ VEGA"
      : "Intelligent Transport Corporation · VEGA";
  const toc = parsed.blocks
    .filter(
      (block): block is Extract<Block, { kind: "h2" | "h3" }> =>
        block.kind === "h2" || block.kind === "h3",
    )
    .filter((block) => block.kind === "h2")
    .map((block) => `<li><a href="#${block.id}">${inline(block.text)}</a></li>`)
    .join("");

  return `<!doctype html>
<html lang="${language}" dir="${dir}">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(parsed.title)}</title>
  <style>
    @font-face {
      font-family: "Tajawal";
      src: url("data:font/ttf;base64,${tajawalRegular}") format("truetype");
      font-weight: 400;
      font-display: block;
    }
    @font-face {
      font-family: "Tajawal";
      src: url("data:font/ttf;base64,${tajawalBold}") format("truetype");
      font-weight: 700;
      font-display: block;
    }
    @font-face {
      font-family: "Plus Jakarta Sans";
      src: url("data:font/woff2;base64,${jakartaRegular}") format("woff2");
      font-weight: 400;
      font-display: block;
    }
    @font-face {
      font-family: "Plus Jakarta Sans";
      src: url("data:font/woff2;base64,${jakartaBold}") format("woff2");
      font-weight: 700;
      font-display: block;
    }
    @page {
      size: A4;
      margin: 18mm 16mm 20mm 16mm;
      @bottom-center {
        content: counter(page);
        font-family: "Plus Jakarta Sans", "Tajawal", sans-serif;
        font-size: 10pt;
        color: #2E1748;
      }
      @bottom-right {
        content: "JOSTI 1.0.0";
        font-family: "Plus Jakarta Sans", "Tajawal", sans-serif;
        font-size: 9pt;
        color: #5c5470;
      }
    }
    @page :first {
      margin: 0;
      @bottom-center { content: none; }
      @bottom-right { content: none; }
    }
    * { box-sizing: border-box; }
    html, body {
      margin: 0;
      padding: 0;
      color: #1c1430;
      font-family: ${language === "ar" ? '"Tajawal", "Plus Jakarta Sans", sans-serif' : '"Plus Jakarta Sans", "Tajawal", sans-serif'};
      font-size: 11.5pt;
      line-height: 1.55;
    }
    .cover {
      width: 210mm;
      height: 297mm;
      background: #2E1748;
      color: #ffffff;
      padding: 28mm 18mm 22mm;
      page-break-after: always;
      display: flex;
      flex-direction: column;
    }
    .cover svg { width: 42mm; height: auto; }
    .kicker {
      margin-top: 18mm;
      color: #32D5E7;
      font-weight: 700;
      letter-spacing: ${language === "ar" ? "0" : "0.08em"};
      text-transform: ${language === "ar" ? "none" : "uppercase"};
      font-size: 12pt;
    }
    h1 {
      margin: 6mm 0 4mm;
      font-size: 32pt;
      line-height: 1.25;
      font-weight: 700;
    }
    .subtitle { font-size: 12pt; color: #F3F5FA; max-width: 150mm; }
    .org { margin-top: auto; color: #32D5E7; font-weight: 700; }
    main { }
    h2 {
      color: #2E1748;
      font-size: 16pt;
      margin: 8mm 0 3mm;
      border-bottom: 2px solid #32D5E7;
      padding-bottom: 1.5mm;
      page-break-after: avoid;
    }
    h3 { color: #2E1748; font-size: 13pt; margin: 5mm 0 2mm; page-break-after: avoid; }
    p { margin: 0 0 3mm; }
    ul, ol { margin: 0 0 4mm; padding-inline-start: 6mm; }
    li { margin: 0 0 1.4mm; }
    a { color: #2E1748; text-decoration: none; }
    table { width: 100%; border-collapse: collapse; margin: 2mm 0 5mm; page-break-inside: avoid; }
    th, td { border: 1px solid #d5d8e2; padding: 2mm 2.5mm; vertical-align: top; text-align: start; }
    th { background: #2E1748; color: #ffffff; font-weight: 700; }
    tr:nth-child(even) td { background: #F3F5FA; }
    pre, code {
      font-family: Consolas, "Courier New", monospace;
      font-size: 9pt;
    }
    code { background: #F3F5FA; padding: 0 1mm; unicode-bidi: isolate; }
    .toc ul { list-style: none; padding-inline-start: 0; }
    pre {
      background: #F3F5FA;
      border-inline-start: 3px solid #32D5E7;
      padding: 3mm;
      white-space: pre-wrap;
      word-break: break-word;
      margin: 2mm 0 4mm;
    }
    .toc { margin-bottom: 8mm; }
    .toc a { border-bottom: 1px solid #32D5E7; }
  </style>
</head>
<body>
  <section class="cover">
    ${logo}
    <div class="kicker">${coverKicker}</div>
    <h1>${inline(parsed.title.replace(/^#\s*/, ""))}</h1>
    <p class="subtitle">${inline(parsed.subtitle)}</p>
    <p class="org">${coverOrg}</p>
  </section>
  <main>
    <h2 id="contents">${tocLabel}</h2>
    <nav class="toc"><ul>${toc}</ul></nav>
    ${renderBlocks(parsed.blocks)}
  </main>
</body>
</html>`;
}

function printPdf(htmlPath: string, pdfPath: string): Promise<void> {
  const profile = path.join(buildDir, `edge-${path.basename(pdfPath, ".pdf")}`);
  rmSync(profile, { recursive: true, force: true });
  mkdirSync(profile, { recursive: true });
  const args = [
    "--headless=new",
    "--disable-gpu",
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-extensions",
    "--no-pdf-header-footer",
    `--user-data-dir=${profile}`,
    `--print-to-pdf=${pdfPath}`,
    pathToFileURL(htmlPath).href,
  ];
  return new Promise((resolve, reject) => {
    const child = spawn(edge, args, { stdio: "ignore", windowsHide: true });
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`Edge timed out while writing ${pdfPath}`));
    }, 60000);
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on("exit", (code) => {
      clearTimeout(timer);
      if (code === 0) resolve();
      else reject(new Error(`Edge exited ${code} for ${pdfPath}`));
    });
  });
}

mkdirSync(buildDir, { recursive: true });
const jobs = [
  {
    language: "en" as const,
    markdown: path.join(manuals, "JOSTI_Operations_Guide_EN.md"),
    html: path.join(buildDir, "en.html"),
    pdf: path.join(manuals, "JOSTI_Operations_Guide_EN.pdf"),
  },
  {
    language: "ar" as const,
    markdown: path.join(manuals, "JOSTI_Operations_Guide_AR.md"),
    html: path.join(buildDir, "ar.html"),
    pdf: path.join(manuals, "JOSTI_Operations_Guide_AR.pdf"),
  },
];

for (const job of jobs) {
  const html = renderHtml(job.language, readFileSync(job.markdown, "utf8"));
  writeFileSync(job.html, html);
  await printPdf(job.html, job.pdf);
  const size = readFileSync(job.pdf).length;
  if (size < 20000) throw new Error(`${job.pdf} is unexpectedly small (${size} bytes)`);
  console.log(`${job.pdf} ${size}`);
}
