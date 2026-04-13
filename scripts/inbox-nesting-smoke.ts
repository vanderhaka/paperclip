// Playwright smoke test for the inbox ancestor-nesting feature.
// Opens the dev server with a real session cookie, navigates to the inbox,
// takes screenshots, and prints what it sees so I can iterate without pingponging
// screenshots with the human.

import { chromium } from "@playwright/test";
import path from "node:path";

const BASE_URL = "http://127.0.0.1:3100";
const SESSION_COOKIE =
  "RXQ7d9duG6RxK8QmESDoyUexI4BYOmHd.65NhVwyRe26aJf2NthEv0VZtIoCfQvZZYC5tC32cTmQ=";
const OUT_DIR = path.resolve(process.cwd(), "/tmp/paperclip-smoke");

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
  });
  await context.addCookies([
    {
      name: "better-auth.session_token",
      value: SESSION_COOKIE,
      domain: "127.0.0.1",
      path: "/",
      httpOnly: true,
      sameSite: "Lax",
    },
  ]);
  const page = await context.newPage();

  // Capture every network request to /issues so we can see what URL the UI sends.
  const issuesRequests: string[] = [];
  page.on("request", (req) => {
    const url = req.url();
    if (url.includes("/api/companies/") && url.includes("/issues?")) {
      issuesRequests.push(url);
    }
  });

  console.log("→ navigating to inbox...");
  await page.goto(`${BASE_URL}/JAR/inbox/mine`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);

  // Nuke localStorage cache keys related to the inbox so no stale client state.
  await page.evaluate(() => {
    for (const key of Object.keys(localStorage)) {
      if (key.startsWith("paperclip:inbox:")) localStorage.removeItem(key);
    }
  });
  console.log("→ cleared inbox localStorage");

  await page.reload({ waitUntil: "networkidle" });
  await page.waitForTimeout(2000);

  // Print network requests against the issues endpoint.
  console.log("\n/issues network calls:");
  for (const url of issuesRequests.slice(-6)) {
    const qs = url.split("?")[1] ?? "";
    console.log(`  ${qs}`);
  }

  // Print the DOM structure with indentation + bg color so nesting depth is
  // directly observable without eyeballing the screenshot.
  const rows = await page.$$eval("[data-inbox-item]", (els) =>
    els.map((el) => {
      const link = el.querySelector("[data-inbox-issue-link]") as HTMLElement | null;
      const header = el.querySelector("[data-inbox-issue-header]") as HTMLElement | null;
      const row = (link ?? header) as HTMLElement | null;
      // The indent spacer we render is the first <span> with inline style width.
      const spacer = row?.querySelector("span[aria-hidden='true']") as HTMLElement | null;
      const widthPx = spacer?.getBoundingClientRect().width ?? 0;
      const chevron = row?.querySelector(".lucide-chevron-right") as HTMLElement | null;
      const bg = row ? getComputedStyle(row).backgroundColor : "";
      const titleEl = row?.querySelector("span.line-clamp-2, span.sm\\:line-clamp-none") as HTMLElement | null;
      const text = (titleEl?.textContent ?? row?.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 80);
      return {
        kind: header ? "HEADER" : link ? "LINK  " : "OTHER ",
        indentPx: Math.round(widthPx),
        hasChevron: !!chevron,
        bg,
        text,
      };
    }),
  );
  console.log(`\nrendered rows: ${rows.length}`);
  for (const r of rows) {
    const indent = r.indentPx > 0 ? `indent=${r.indentPx}px` : "              ";
    const chev = r.hasChevron ? "▸" : " ";
    console.log(`  ${chev} [${r.kind}] ${indent} bg=${r.bg.padEnd(22)} ${r.text}`);
  }

  await page.screenshot({ path: `${OUT_DIR}/inbox.png`, fullPage: true });
  console.log(`\n→ screenshot saved to ${OUT_DIR}/inbox.png`);

  await browser.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
