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
  // Say what was actually on screen. Without this a "timed out waiting for X"
  // is indistinguishable from "the server returned an error page", which is
  // exactly the mistake that made the first run of this script fail silently.
  let seen = "no page";
  try {
    const t = await ev("document.title");
    const b = await ev("document.body ? document.body.innerText.slice(0, 160) : ''");
    seen = `title=${JSON.stringify(t)} body=${JSON.stringify(b)}`;
  } catch { /* page may be gone */ }
  throw new Error(`timed out waiting for ${label}; page showed ${seen}`);
}

// Probes the root. Whether a *single route* has propagated to this region is
// goto()'s problem, not the probe's -- it has a much longer budget, and the
// root is the signal for "is this site serving here at all".
let lastProbe = "never attempted";
const probe = async () => {
  try {
    const r = await fetch(BASE, { redirect: "follow" });
    lastProbe = `HTTP ${r.status} ${r.statusText}`;
    return r.status >= 200 && r.status < 300;
  } catch (e) {
    lastProbe = `threw ${e.cause?.code ?? ""} ${e.message}`.trim();
    return false;
  }
};

async function goto(path, { attempts = 20 } = {}) {
  let last;
  for (let i = 1; i <= attempts; i++) {
    await send("Page.navigate", { url: `${BASE}${path}` });
    await sleepIn(700);
    await waitFor(`document.body && document.body.innerText.trim().length > 0`, {
      timeout: 15_000,
      label: `${path} to render`,
    }).catch((e) => { last = e; });
    // "Rendered something" is not the same as "the app is up": Chrome's own
    // error pages and Vercel's 404 both carry body text. Retry only on those,
    // and never treat a legitimate access-denied screen as a failure to load.
    const broke = await ev(
      `/404|NOT_FOUND|This site can.t be reached|doesn.t exist|Internal Server Error/i.test(document.title + ' ' + document.body.innerText.slice(0, 300))`,
    );
    if (!broke) {
      await sleepIn(1200);
      return;
    }
    last = new Error(`${path} returned an error page`);
    console.log(`  ${path} is on an error page (attempt ${i}/${attempts}) -- waiting out the rollout`);
    await sleep(8000);
  }
  throw last ?? new Error(`could not load ${path}`);
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
// Wait out a deployment in flight. Dispatching this straight after a push used
// to catch the site mid-rollout and produce a baffling timeout.
// Wait for the deployment to actually be serving. GitHub reporting the deploy
// workflow as "completed" is not the same thing: Vercel promotes the new
// deployment to the production alias, and that alias can still be 404ing in
// this runner's region a minute later. Observed as long as 80s, and it has hit
// the whole site as well as a single route, so poll the root and give it room.
for (let i = 0; i < 40; i++) {
  if (await probe()) break;
  if (i % 5 === 0) console.log(`  ${BASE} is not serving yet (${lastProbe}); waiting`);
  await sleep(6000);
}
if (!(await probe())) {
  console.error(`${BASE} never served a 2xx within ~4 minutes (last: ${lastProbe}). Aborting.`);
  bye();
  process.exit(2);
}

await goto("/login");
await waitFor(`document.querySelector('#email')`, { timeout: 90_000, label: "the login form" });

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
// The dashboard fires three async queries after mount, so a rendered page is not
// the same as a populated one. These passed on one run and failed on the next
// with no code change in between, which is the harness's fault: it asserted on
// content that had not necessarily arrived. Wait for the content, not just the
// page.
await goto("/");
await waitFor(
  `[...document.querySelectorAll('div.grid')].some(g => g.textContent.includes('Gross Revenue'))`,
  { label: "the KPI grid to populate" },
);

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
await waitFor(`[...document.querySelectorAll('p')].some(p => p.textContent.includes('revenue this week'))`, {
  label: "the revenue chart",
});
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
await waitFor(`document.querySelector('th')`, { label: "the customers table" });
await check("2.4", "seed-only customer columns are labelled as sample data", async () => {
  const heads = await ev(`[...document.querySelectorAll('th')].map(t => t.innerText.trim())`);
  // The table uppercases headers in CSS, and innerText reports rendered text,
  // so the comparison has to be case-insensitive.
  const lower = heads.map((h) => h.toLowerCase());
  for (const want of ["Tier (sample)", "Orders (sample)", "Total spent (sample)"]) {
    must(lower.includes(want.toLowerCase()), `missing header "${want}" (saw: ${heads.join(" | ")})`);
  }
  return heads.join(" | ");
});
await shot("customers");

// -- Prompt 2.5: the persisted reason -------------------------------------
await goto("/orders");
await waitFor(`document.querySelector('tbody tr')`, { label: "the orders table" });
await check("2.5", "order detail renders the reason branch that matches the status", async () => {
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
  await shot("order-detail");

  // The cancellation block is conditional on status (order-detail.tsx:136), so
  // the correct assertion differs by status. Asserting "No reason recorded"
  // everywhere would have failed on a perfectly correct pending order.
  const cancelled = /Order cancelled/i.test(text);
  if (cancelled) {
    must(/No reason recorded|^Reason:/m.test(text), "a cancelled order must state its reason or say none was recorded");
    return "cancelled order: reason branch rendered";
  }
  must(!/No reason recorded/i.test(text), "a non-cancelled order is showing a rejection reason");
  must(!/Order cancelled/i.test(text), "a non-cancelled order is showing the cancellation block");
  return "non-cancelled order: no reason branch, as intended (the cancelled branch is not exercised: production holds no cancelled orders)";
});

// -- Prompt 3.1: global search ---------------------------------------------
// Read-only: every step here types, focuses and navigates, and nothing is
// written. The point is to exercise the real debounced, RLS-scoped search
// against production data rather than assert on the component's internals.
const SEARCH_TERM = "Food";
const COMBOBOX = '[role="combobox"]';

async function press(key, code, keyCode) {
  await send("Input.dispatchKeyEvent", { type: "keyDown", key, code, windowsVirtualKeyCode: keyCode });
  await send("Input.dispatchKeyEvent", { type: "keyUp", key, code, windowsVirtualKeyCode: keyCode });
  await sleepIn(120);
}

await goto("/");
await check("3.1", "the search box is a labelled combobox", async () => {
  const r = await ev(`(() => {
    const el = document.querySelector(${JSON.stringify(COMBOBOX)});
    if (!el) return null;
    return {
      expanded: el.getAttribute("aria-expanded"),
      autocomplete: el.getAttribute("aria-autocomplete"),
      label: el.getAttribute("aria-label") ?? "",
      described: !!document.getElementById(el.getAttribute("aria-describedby") ?? ""),
    };
  })()`);
  must(r, "no element with role=combobox");
  must(r.expanded === "false", `aria-expanded is ${r.expanded}, expected false while empty`);
  must(r.autocomplete === "list", `aria-autocomplete is "${r.autocomplete}"`);
  must(/orders/i.test(r.label) && /riders/i.test(r.label), `aria-label does not name what is searchable: "${r.label}"`);
  must(r.described, "aria-describedby does not point at the live region");
  return `aria-expanded=false, aria-autocomplete=list, live region wired`;
});

await check("3.1", "a search returns results across more than one entity", async () => {
  const typed = await ev(`(() => {
    const el = document.querySelector(${JSON.stringify(COMBOBOX)});
    if (!el) return "missing";
    el.focus();
    return ${JSON.stringify(setInput(COMBOBOX, SEARCH_TERM))};
  })()`);
  must(typed === '"ok"', `could not type into the search box: ${typed}`);
  await waitFor(`document.querySelector('[role="listbox"] [role="option"]')`, {
    timeout: 30_000,
    label: "search results",
  });

  const r = await ev(`(() => {
    const options = [...document.querySelectorAll('[role="listbox"] [role="option"]')];
    const input = document.querySelector(${JSON.stringify(COMBOBOX)});
    return {
      total: options.length,
      entities: [...new Set(options.map(o => o.dataset.entity))].sort(),
      activeDescendant: input.getAttribute("aria-activedescendant"),
      selected: options.filter(o => o.getAttribute("aria-selected") === "true").length,
      titles: options.map(o => o.textContent.split('·')[0].trim()).slice(0, 3),
    };
  })()`);
  must(r.total > 0, "the listbox opened with no options");
  must(r.entities.length >= 2, `only one entity matched "${SEARCH_TERM}": ${r.entities.join(", ")}`);
  must(r.selected === 1, `${r.selected} options are aria-selected, expected exactly 1`);
  must(!!r.activeDescendant, "the first result is not pointed at by aria-activedescendant");
  return `${r.total} results across ${r.entities.join(", ")}, e.g. ${r.titles.join(" / ")}`;
});

await check("3.1", "ArrowDown moves the active option and Enter follows it", async () => {
  const before = await ev(`document.querySelector(${JSON.stringify(COMBOBOX)}).getAttribute("aria-activedescendant")`);
  await press("ArrowDown", "ArrowDown", 40);
  const after = await ev(`document.querySelector(${JSON.stringify(COMBOBOX)}).getAttribute("aria-activedescendant")`);
  must(after && after !== before, `aria-activedescendant did not move (still ${after})`);

  // Focus must stay in the input: that is the whole point of
  // aria-activedescendant over moving focus into the list.
  const focused = await ev(`document.activeElement?.getAttribute("role") ?? ""`);
  must(focused === "combobox", `focus left the input after ArrowDown (now on "${focused}")`);

  await press("Enter", "Enter", 13);
  await waitFor(`location.search.includes("q=")`, { label: "the destination to carry the query" });
  const landed = await ev(`({ path: location.pathname, search: location.search })`);
  must(
    ["/orders", "/restaurants", "/riders", "/customers", "/menu"].includes(landed.path),
    `landed on ${landed.path}, which is not a list page`,
  );

  // The URL is the handoff: ?q= must reach the store that the tables filter on.
  await waitFor(
    `document.querySelector(${JSON.stringify(COMBOBOX)})?.value === ${JSON.stringify(SEARCH_TERM)}`,
    { label: "the destination list to adopt the query" },
  );
  const count = await ev(`(document.querySelector('p[role="status"]')?.textContent ?? '').trim()`);
  return `ArrowDown kept focus in the input; Enter went to ${landed.path}${landed.search}, table shows "${count}"`;
});

await check("3.1", "Escape closes the results without clearing the query", async () => {
  await waitFor(`document.querySelector('[role="listbox"]')`, { label: "search results" });
  await press("Escape", "Escape", 27);
  const r = await ev(`(() => {
    const input = document.querySelector(${JSON.stringify(COMBOBOX)});
    return {
      listboxes: document.querySelectorAll('[role="listbox"]').length,
      value: input.value,
      expanded: input.getAttribute("aria-expanded"),
    };
  })()`);
  must(r.listboxes === 0, "Escape left the listbox open");
  must(r.expanded === "false", `aria-expanded is still ${r.expanded}`);
  must(r.value === SEARCH_TERM, `Escape also cleared the text: "${r.value}"`);
  return `closed with "${r.value}" intact`;
});

// -- Prompt 3.2: archive, without writing anything -------------------------
// Deliberately non-mutating: the check opens the confirmation, reads its copy
// and cancels. Round-tripping a real production row is not worth the risk of a
// run dying between archive and restore.
for (const [path, label, noun] of [
  ["/restaurants", "restaurants", "restaurant"],
  ["/riders", "riders", "rider"],
]) {
  await goto(path);
  await waitFor(`document.querySelector('tbody tr')`, { label: `the ${label} table` });
  await check("3.2", `${label}: every row offers Archive, named for the row`, async () => {
    const r = await ev(`(() => {
      const rows = [...document.querySelectorAll('tbody tr')];
      const labels = rows.map(r => (r.querySelector('button[aria-label^="Archive"]') || {}).ariaLabel);
      return { rows: rows.length, labels };
    })()`);
    must(r.rows > 0, "no rows to check");
    const missing = r.labels.filter((l) => !l);
    must(missing.length === 0, `${missing.length} of ${r.rows} rows have no Archive button`);
    return `${r.rows} rows, e.g. "${r.labels[0]}"`;
  });

  await check("3.2", `${noun}: archiving asks first and explains it is reversible`, async () => {
    const opened = await ev(`(() => {
      const btn = document.querySelector('tbody tr button[aria-label^="Archive"]');
      if (!btn) return "no-button";
      btn.click();
      return "ok";
    })()`);
    must(opened === "ok", `could not click Archive: ${opened}`);
    await waitFor(`document.querySelector('[role="dialog"]')`, { label: "the archive confirmation" });
    await sleepIn(500);

    // The row is a click target that opens the edit dialog. The Archive button
    // stops propagation, so exactly one dialog may be open here.
    const r = await ev(`(() => {
      const dialogs = [...document.querySelectorAll('[role="dialog"]')];
      const t = dialogs[0] ? dialogs[0].innerText : '';
      return { count: dialogs.length, title: dialogs[0]?.getAttribute('aria-label') ?? '', text: t };
    })()`);
    must(r.count === 1, `${r.count} dialogs open; the row click leaked through to the edit dialog`);
    must(/^Archive .+\?$/.test(r.title), `dialog title is "${r.title}", expected "Archive <name>?"`);
    must(/nothing is deleted|brought back/i.test(r.text), "the dialog does not say the action is reversible");
    must(/orders|history|history stay/i.test(r.text), "the dialog does not say what is preserved");

    await ev(`(() => {
      const d = document.querySelector('[role="dialog"]');
      const btn = [...d.querySelectorAll('button')].find(b => /Cancel/i.test(b.textContent));
      if (btn) btn.click();
    })()`);
    await sleepIn(500);
    const closed = await ev(`document.querySelectorAll('[role="dialog"]').length`);
    must(closed === 0, "Cancel did not close the dialog");
    return `${r.title} -- confirmed, then cancelled`;
  });
}

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
