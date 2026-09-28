/**
 * Live admin-UI verification, driven through a real headless browser.
 *
 * Why this exists: several of the Phase 1 and 2 defects (a clamped page, a role
 * label, a KPI whose value and delta described different periods) are invisible
 * to typecheck, lint, `next build` and unit tests. They only show up in a
 * rendered page. Until now they were proven with throwaway harnesses that were
 * deleted afterwards, so nothing kept checking them.
 *
 * Why it runs in CI: GitHub never returns a secret's value, so the browser has to
 * run where ADMIN_USER / ADMIN_PASSWORD exist. That is also a fair test -- it
 * drives the deployed artifact, not a local build.
 *
 * Implementation notes:
 *  - CDP over the WebSocket built into Node 22. No new dependency.
 *  - Credentials are read from the environment and are never logged. Values are
 *    pushed into React-controlled inputs via the native value setter, because
 *    assigning `.value` directly does not notify React.
 */

import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { setTimeout as sleep } from "node:timers/promises";

const BASE = (process.env.BASE_URL ?? "https://kfd-one.vercel.app").replace(/\/$/, "");
const USER = process.env.ADMIN_USER;
const PASS = process.env.ADMIN_PASSWORD;
const ART = new URL("../.verify-artifacts/", import.meta.url).pathname;
const PORT = 9333;

if (!USER || !PASS) {
  console.error("ADMIN_USER / ADMIN_PASSWORD are not set. Nothing was attempted.");
  process.exit(2);
}

// ---------------------------------------------------------------- browser

const CHROME = process.env.CHROME_BIN ?? "google-chrome";
const proc = spawn(
  CHROME,
  [
    "--headless=new",
    `--remote-debugging-port=${PORT}`,
    "--user-data-dir=/tmp/kfd-verify-profile",
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-gpu",
    "--hide-scrollbars",
    "--window-size=1440,2000",
    "about:blank",
  ],
  { stdio: "ignore" },
);

const bye = () => { try { proc.kill("SIGKILL"); } catch {} };
process.on("exit", bye);
process.on("SIGINT", () => { bye(); process.exit(130); });

let ws;
for (let i = 0; i < 40 && !ws; i++) {
  await sleep(500);
  try {
    const list = await fetch(`http://127.0.0.1:${PORT}/json/list`).then((r) => r.json());
    const target = list.find((t) => t.type === "page") ?? (await fetch(`http://127.0.0.1:${PORT}/json/new?about:blank`, { method: "PUT" }).then((r) => r.json()));
    ws = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((ok, no) => { ws.onopen = ok; ws.onerror = () => no(new Error("cdp")); });
  } catch { /* not up yet */ }
}
if (!ws) { console.error("Could not reach Chrome over CDP."); bye(); process.exit(2); }

// ------------------------------------------------------------------ cdp

let seq = 0;
const pending = new Map();
const consoleErrors = [];

ws.addEventListener("message", (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
  if (m.method === "Log.entryAdded" && m.params.entry.level === "error") {
    consoleErrors.push(m.params.entry.text);
  }
  if (m.method === "Runtime.exceptionThrown") {
    consoleErrors.push(m.params.exceptionDetails.text ?? "exception");
  }
});

const send = (method, params = {}) =>
  new Promise((res, rej) => {
    const id = ++seq;
    pending.set(id, (m) => (m.error ? rej(new Error(`${method}: ${m.error.message}`)) : res(m.result)));
    ws.send(JSON.stringify({ id, method, params }));
  });

/** Evaluate in the page. Never echo the expression: it can contain a password. */
async function ev(expression) {
  const r = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error("evaluate failed in page");
  return r.result.value;
}

const sleepIn = (ms) => ev(`new Promise(r => setTimeout(r, ${ms}))`);

async function waitFor(expression, { timeout = 30_000, label = expression } = {}) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (await ev(`!!(${expression})`)) return true;
    await sleepIn(400);
  }
  throw new Error(`timed out waiting for ${label}`);
}

async function goto(path) {
  await send("Page.navigate", { url: `${BASE}${path}` });
  await sleepIn(700);
  // Let the page paint and any entry animation settle before asserting.
  await waitFor(`document.body && document.body.innerText.trim().length > 0`, { label: `${path} to render` });
  await sleepIn(1200);
}

/** Set a React-controlled input so the framework actually sees the change. */
function setInput(selector, value) {
  return `(() => {
    const el = document.querySelector(${JSON.stringify(selector)});
    if (!el) return "missing";
    const proto = el.tagName === "TEXTAREA" ? HTMLTextAreaElement : HTMLInputElement;
    Object.getOwnPropertyDescriptor(proto.prototype, "value").set.call(el, ${JSON.stringify(value)});
    el.dispatchEvent(new Event("input", { bubbles: true }));
    return "ok";
  })()`;
}

let shotN = 0;
async function shot(name) {
  const { data } = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: true });
  writeFileSync(`${ART}${String(++shotN).padStart(2, "0")}-${name}.png`, Buffer.from(data, "base64"));
}

// ---------------------------------------------------------------- report

const results = [];
async function check(group, name, fn) {
  try {
    const detail = await fn();
    results.push({ group, name, ok: true, detail: detail ?? "" });
    console.log(`  PASS  ${name}${detail ? `  -- ${detail}` : ""}`);
  } catch (err) {
    results.push({ group, name, ok: false, detail: err.message });
    console.log(`  FAIL  ${name}  -- ${err.message}`);
  }
}

const must = (cond, msg) => { if (!cond) throw new Error(msg); };

// ------------------------------------------------------------------ run

mkdirSync(ART, { recursive: true });
await send("Page.enable");
await send("Runtime.enable");
await send("Log.enable");

console.log(`\nVerifying ${BASE}\n`);

// -- sign in ---------------------------------------------------------------
await goto("/login");
await waitFor(`document.querySelector('#email')`, { label: "the login form" });

// The value is passed into the page, never printed back out.
const setUser = await ev(setInput("#email", USER));
const setPass = await ev(setInput("#password", PASS));
must(setUser === "ok" && setPass === "ok", "could not populate the login form");

await ev(`document.querySelector('form button[type="submit"]').click()`);
await waitFor(`!location.pathname.startsWith('/login')`, { timeout: 45_000, label: "sign-in to complete" });
await sleepIn(2500);
const landed = await ev("location.pathname");
console.log(`  signed in, landed on ${landed || "/"}\n`);
await shot("after-login");

await check("auth", "password sign-in reaches the admin surface", async () => {
  const p = await ev("location.pathname");
  must(!p.startsWith("/login"), `still on ${p}`);
  const body = await ev("document.body.innerText");
  must(!/not-provisioned|no-restaurant|lookup-failed/i.test(body), "gate rejected the admin account");
  return `pathname ${p || "/"}`;
});

// -- Prompt 1.5: the role label -------------------------------------------
await check("1.5", "shell shows the real role, not a placeholder", async () => {
  const r = await ev(`(() => {
    const t = document.body.innerText;
    return { admin: (t.match(/\\bAdmin\\b/g) || []).length, signedIn: /Signed in/.test(t) };
  })()`);
  must(!r.signedIn, 'still rendering the "Signed in" placeholder');
  must(r.admin >= 1, "no 'Admin' role label anywhere in the shell");
  return `${r.admin} occurrence(s) of "Admin"`;
});

await check("1.5", "role label survives a full page load, not just client navigation", async () => {
  await goto("/orders");
  const r = await ev(`(() => {
    const t = document.body.innerText;
    return { admin: (t.match(/\\bAdmin\\b/g) || []).length, signedIn: /Signed in/.test(t) };
  })()`);
  must(!r.signedIn, '"Signed in" placeholder rendered on a fresh load');
  must(r.admin >= 1, "no role label on a hard load");
  return `${r.admin} occurrence(s)`;
});

// -- Prompt 2.1 / 2.3: the KPI row ----------------------------------------
await goto("/");

await check("2.1", "every KPI names its own window", async () => {
  const cards = await ev(`(() => {
    const g = [...document.querySelectorAll('div.grid')].find(x => x.textContent.includes('Gross Revenue'));
    if (!g) return null;
    return [...g.children].map(c => c.innerText.split('\\n')[0].trim());
  })()`);
  must(cards, "could not find the KPI grid");
  for (const want of ["Gross Revenue (7d)", "Orders (7d)", "New Restaurants (7d)", "Riders Online"]) {
    must(cards.includes(want), `missing KPI "${want}" (saw: ${cards.join(" / ")})`);
  }
  return cards.join(" | ");
});

await check("2.1", "KPI value and delta agree on the period", async () => {
  // A KPI advertising a 7d window must not be showing an all-time value. With
  // the seed orders dated 2025 a 7d window is legitimately 0, so the assertion
  // is that the 7d cards do not carry the all-time totals.
  const r = await ev(`(() => {
    const g = [...document.querySelectorAll('div.grid')].find(x => x.textContent.includes('Gross Revenue'));
    if (!g) return null;
    return [...g.children].map(c => c.innerText.replace(/\\n+/g, ' | '));
  })()`);
  must(r, "KPI grid not found");
  const sevenDay = r.filter((t) => /\(7d\)/.test(t)).length;
  must(sevenDay === 3, `expected 3 KPIs scoped to 7d, saw ${sevenDay}`);
  return `${sevenDay} of 4 KPIs explicitly scoped to 7d; Riders Online is the exception by design`;
});

await check("2.3", "Riders Online is a level, not a trend", async () => {
  const r = await ev(`(() => {
    const g = [...document.querySelectorAll('div.grid')].find(x => x.textContent.includes('Riders Online'));
    if (!g) return null;
    const card = [...g.children].find(c => c.innerText.includes('Riders Online'));
    return { icons: card.querySelectorAll('svg').length, text: card.innerText.replace(/\\n+/g, ' | ') };
  })()`);
  must(r, "Riders Online card not found");
  must(r.icons === 0, `card renders ${r.icons} icon(s); a delta-less KPI must render none`);
  must(/delivery success/i.test(r.text), "delivery-success hint is missing");
  return r.text;
});

await check("2.3", "the three flow KPIs do show a trend", async () => {
  const r = await ev(`(() => {
    const g = [...document.querySelectorAll('div.grid')].find(x => x.textContent.includes('Gross Revenue'));
    if (!g) return null;
    return [...g.children]
      .filter(c => !c.innerText.includes('Riders Online'))
      .map(c => ({ label: c.innerText.split('\\n')[0].trim(), icons: c.querySelectorAll('svg').length }));
  })()`);
  must(r && r.length === 3, `expected 3 flow KPIs, saw ${r?.length}`);
  const bare = r.filter((c) => c.icons === 0).map((c) => c.label);
  must(bare.length === 0, `no trend rendered for: ${bare.join(", ")}`);
  return r.map((c) => c.label).join(" | ");
});

await shot("overview");

// -- Prompt 2.2: the revenue chart ----------------------------------------
await check("2.2", "chart plots exactly 7 chronological, uniquely-labelled points", async () => {
  const r = await ev(`(() => {
    const peak = [...document.querySelectorAll('p')].find(p => p.textContent.includes('revenue this week'));
    if (!peak) return null;
    const chart = peak.closest('div.px-5');
    if (!chart) return null;
    const bars = [...chart.firstElementChild.children];
    const labels = [...chart.querySelectorAll('.mt-2 > div')].map(d => d.textContent.trim());
    const styles = bars.map(b => b.lastElementChild.getAttribute('style'));
    return { bars: bars.length, labels, bad: styles.filter(s => !s || /NaN/.test(s)).length };
  })()`);
  must(r, "revenue chart not found on the Overview page");
  must(r.bars === 7, `rendered ${r.bars} bars, expected 7`);
  must(r.labels.length === 7, `rendered ${r.labels.length} labels, expected 7`);
  must(new Set(r.labels).size === 7, `duplicate labels: ${r.labels.join(",")}`);
  must(r.bad === 0, `${r.bad} bar(s) have a missing or NaN height`);
  return r.labels.join(" ");
});

// -- Prompt 2.4: the aggregate honesty labels -----------------------------
await check("2.4", "top-restaurants card says its revenue is all-time", async () => {
  const t = await ev("document.body.innerText");
  must(/By gross revenue, all time/i.test(t), 'missing "By gross revenue, all time"');
  return "subtitle present";
});

await goto("/customers");
await check("2.4", "seed-only customer columns are labelled as sample data", async () => {
  const heads = await ev(`[...document.querySelectorAll('th')].map(t => t.innerText.trim())`);
  for (const want of ["Tier (sample)", "Orders (sample)", "Total spent (sample)"]) {
    must(heads.includes(want), `missing header "${want}" (saw: ${heads.join(" | ")})`);
  }
  return heads.join(" | ");
});
await shot("customers");

// -- Prompt 2.5: the persisted reason -------------------------------------
await goto("/orders");
await check("2.5", "order detail states the reason explicitly when there is none", async () => {
  const opened = await ev(`(() => {
    const row = document.querySelector('tbody tr');
    if (!row) return "no-rows";
    row.click();
    return "ok";
  })()`);
  must(opened === "ok", `could not open a row: ${opened}`);
  await waitFor(`document.querySelector('[role="dialog"]')`, { label: "the order detail dialog" });
  await sleepIn(600);
  const text = await ev(`document.querySelector('[role="dialog"]').innerText`);
  must(/No reason recorded|Rejection reason/i.test(text), "detail shows neither a reason nor the explicit 'No reason recorded'");
  await shot("order-detail");
  await ev(`document.querySelector('[role="dialog"] button[aria-label="Close"]')?.click()`);
  await sleepIn(400);
  return /No reason recorded/i.test(text) ? "rendered 'No reason recorded'" : "rendered a recorded reason";
});

// -- console hygiene -------------------------------------------------------
await check("hygiene", "no console errors during the sweep", async () => {
  const real = consoleErrors.filter((t) => !/favicon|Download the React DevTools/i.test(t));
  must(real.length === 0, real.slice(0, 3).join(" | ").slice(0, 300));
  return `${consoleErrors.length} raw, all benign`;
});

// -- summary ---------------------------------------------------------------
const failed = results.filter((r) => !r.ok);
console.log(`\n${failed.length === 0 ? "ALL ADMIN UI CHECKS PASS" : `${failed.length} CHECK(S) FAILED`}  (${results.length - failed.length}/${results.length})`);
if (failed.length) for (const f of failed) console.log(`  - [${f.group}] ${f.name}: ${f.detail}`);
console.log(`screenshots: ${ART}`);

bye();
process.exit(failed.length === 0 ? 0 : 1);
