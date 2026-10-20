#!/usr/bin/env node
/**
 * Deterministic audit evidence for the neo build-and-ship agent.
 *
 *   node scripts/neo-audit.mjs            # full: verify + audits + diff + secret scan
 *   node scripts/neo-audit.mjs --quick    # fast: diff + secret scan only
 *   node scripts/neo-audit.mjs --json     # machine-readable stdout
 *
 * The script does not enforce permissions. It gathers evidence, writes
 * .opencode/neo/audit-<timestamp>.{json,md}, and exits 1 when the tree is not
 * safe to ship (verify failed, or a secret is present in the diff).
 */
import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";

const args = new Set(process.argv.slice(2));
const quick = args.has("--quick");
const jsonOnly = args.has("--json");
const root = revParse();

function revParse() {
  const r = spawnSync("git", ["rev-parse", "--show-toplevel"], { encoding: "utf8" });
  if (r.status !== 0) {
    console.error("neo-audit: not inside a git repository");
    process.exit(2);
  }
  return r.stdout.trim();
}

function run(command, argv, options = {}) {
  const started = Date.now();
  const r = spawnSync(command, argv, {
    cwd: options.cwd ?? root,
    encoding: "utf8",
    timeout: options.timeout ?? 30 * 60 * 1000,
    maxBuffer: 64 * 1024 * 1024,
    env: process.env,
  });
  return {
    command: [command, ...argv].join(" "),
    cwd: relative(root, options.cwd ?? root) || ".",
    status: r.status,
    signal: r.signal ?? null,
    durationMs: Date.now() - started,
    stdout: r.stdout ?? "",
    stderr: r.stderr ?? "",
    error: r.error ? String(r.error) : null,
  };
}

const tail = (value, limit = 12000) =>
  value.length <= limit ? value : `… (${value.length - limit} chars omitted)\n${value.slice(-limit)}`;

const git = (argv) => run("git", argv);

const status = git(["status", "--short"]);
const diffStat = git(["diff", "--stat"]);
const cachedDiffStat = git(["diff", "--cached", "--stat"]);
const diffNames = git(["diff", "--name-only"]);
const cachedNames = git(["diff", "--cached", "--name-only"]);
const untrackedNames = git(["ls-files", "--others", "--exclude-standard"]);
const diffCheck = git(["diff", "--check"]);
const diffBody = git(["diff", "--unified=0"]);
const cachedDiffBody = git(["diff", "--cached", "--unified=0"]);

const stagedPaths = lines(cachedNames.stdout);
const unstagedPaths = lines(diffNames.stdout);
const untrackedPaths = lines(untrackedNames.stdout);
const changedPaths = [...new Set([...stagedPaths, ...unstagedPaths, ...untrackedPaths])];

function lines(value) {
  return value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

function isSecretPath(path) {
  const base = path.split("/").pop() ?? path;
  if (base === ".env.example" || base.endsWith(".env.example")) return false;
  return (
    base === ".env" ||
    base.startsWith(".env.") ||
    /\.(pem|key|p12|mobileprovision)$/i.test(base) ||
    /^(id_rsa|credentials)$/i.test(base)
  );
}

const pathSecrets = changedPaths.filter(isSecretPath);

const contentChecks = [
  { name: "private key", pattern: /-----BEGIN (?:RSA |EC |OPENSSH |PGP )?PRIVATE KEY-----/ },
  { name: "github token", pattern: /\bgh[pousr]_[A-Za-z0-9]{30,}\b/ },
  { name: "openai-style key", pattern: /\bsk-[A-Za-z0-9]{20,}\b/ },
  { name: "aws access key", pattern: /\bAKIA[0-9A-Z]{16}\b/ },
  { name: "supabase service role", pattern: /\bSUPABASE_SERVICE_ROLE_KEY\s*=/ },
];

const untrackedText = untrackedPaths
  .filter((path) => /\.(?:ts|tsx|js|jsx|mjs|cjs|json|md|yml|yaml|sh|sql|toml|env|txt)$/i.test(path))
  .map((path) => {
    try {
      const full = join(root, path);
      if (statSync(full).size > 512 * 1024) return "";
      return `\n--- ${path} ---\n${readFileSync(full, "utf8")}`;
    } catch {
      return "";
    }
  })
  .join("");

const diffText = `${cachedDiffBody.stdout}\n${diffBody.stdout}${untrackedText}`;
const contentSecrets = contentChecks
  .filter((check) => check.pattern.test(diffText))
  .map((check) => check.name);

const suspiciousLiterals = [
  /\b(?:api[_-]?key|secret|password|token)\s*[:=]\s*['"][^'"]{16,}['"]/i,
];
const literalWarnings = suspiciousLiterals.some((pattern) => pattern.test(diffText))
  ? ["diff contains a long string assigned to an api-key/secret/password/token-looking name; inspect it"]
  : [];

const verify = quick
  ? { command: "scripts/verify.sh all", skipped: true, status: 0, durationMs: 0, output: "skipped (--quick)" }
  : run("bash", ["scripts/verify.sh", "all"], { timeout: 45 * 60 * 1000 });

const adminAudit = quick
  ? { command: "npm audit --omit=dev --audit-level=high", skipped: true, status: 0, output: "skipped (--quick)" }
  : run("npm", ["audit", "--omit=dev", "--audit-level=high"], { cwd: join(root, "admin"), timeout: 5 * 60 * 1000 });

const mobileAudit = quick
  ? { command: "npm audit --omit=dev", skipped: true, status: 0, output: "skipped (--quick)" }
  : run("npm", ["audit", "--omit=dev"], { cwd: join(root, "mobile"), timeout: 5 * 60 * 1000 });

const blockers = [];
const warnings = [...literalWarnings];

if (!quick && verify.status !== 0) blockers.push(`scripts/verify.sh all exited ${verify.status}`);
if (pathSecrets.length) blockers.push(`secret-looking path in the diff: ${pathSecrets.join(", ")}`);
if (contentSecrets.length) blockers.push(`secret-looking content in the diff: ${contentSecrets.join(", ")}`);
if (!quick && adminAudit.status !== 0) warnings.push(`admin npm audit exited ${adminAudit.status}; read the output`);
if (!quick && mobileAudit.status !== 0) warnings.push(`mobile npm audit exited ${mobileAudit.status} (advisory by repo policy)`);
if (diffCheck.status !== 0 || diffCheck.stdout.trim() || diffCheck.stderr.trim()) {
  warnings.push("git diff --check reported whitespace/conflict-marker output");
}

const verdict = blockers.length ? "BLOCKED" : "PASS";
const createdAt = new Date().toISOString();
const stamp = createdAt.replace(/[:.]/g, "-");
const outDir = join(root, ".opencode", "neo");
mkdirSync(outDir, { recursive: true });

const report = {
  version: 1,
  createdAt,
  root,
  quick,
  verdict,
  blockers,
  warnings,
  git: {
    status: status.stdout.trim(),
    diffStat: diffStat.stdout.trim(),
    cachedDiffStat: cachedDiffStat.stdout.trim(),
    stagedPaths,
    unstagedPaths,
    untrackedPaths,
    diffCheck: `${diffCheck.stdout}${diffCheck.stderr}`.trim(),
  },
  verify: {
    skipped: Boolean(verify.skipped),
    status: verify.status,
    durationMs: verify.durationMs,
    outputTail: verify.skipped ? "" : tail(verify.stdout + verify.stderr),
  },
  audits: {
    admin: {
      skipped: Boolean(adminAudit.skipped),
      status: adminAudit.status,
      durationMs: adminAudit.durationMs,
      outputTail: adminAudit.skipped ? "" : tail(adminAudit.stdout + adminAudit.stderr, 6000),
    },
    mobile: {
      skipped: Boolean(mobileAudit.skipped),
      status: mobileAudit.status,
      durationMs: mobileAudit.durationMs,
      outputTail: mobileAudit.skipped ? "" : tail(mobileAudit.stdout + mobileAudit.stderr, 6000),
    },
  },
  secrets: {
    paths: pathSecrets,
    content: contentSecrets,
  },
};

const md = `# Neo audit — ${createdAt}

- **Verdict:** ${verdict}
- **Mode:** ${quick ? "quick (verify skipped)" : "full"}
- **Repository:** \`${root}\`

## Git

\`\`\`
${report.git.status || "(clean)"}
\`\`\`

Staged:
${stagedPaths.length ? stagedPaths.map((p) => `- \`${p}\``).join("\n") : "- (none)"}

Unstaged:
${unstagedPaths.length ? unstagedPaths.map((p) => `- \`${p}\``).join("\n") : "- (none)"}

Untracked:
${untrackedPaths.length ? untrackedPaths.map((p) => `- \`${p}\``).join("\n") : "- (none)"}

\`\`\`
${report.git.diffStat || "(no unstaged diff)"}
\`\`\`

## Verification

${quick ? "Skipped (quick mode)." : `Exit: ${verify.status}\n\n\`\`\`\n${tail(verify.stdout + verify.stderr, 20000) || "(no output)"}\n\`\`\``}

## Dependency audits

Admin: ${quick ? "skipped" : `exit ${adminAudit.status}`}

${quick ? "" : `\`\`\`\n${tail(adminAudit.stdout + adminAudit.stderr, 8000) || "(no output)"}\n\`\`\``}

Mobile (advisory): ${quick ? "skipped" : `exit ${mobileAudit.status}`}

${quick ? "" : `\`\`\`\n${tail(mobileAudit.stdout + mobileAudit.stderr, 8000) || "(no output)"}\n\`\`\``}

## Secret scan

- Paths: ${pathSecrets.length ? pathSecrets.join(", ") : "clean"}
- Content: ${contentSecrets.length ? contentSecrets.join(", ") : "clean"}

## Blockers

${blockers.length ? blockers.map((b) => `- ${b}`).join("\n") : "- (none)"}

## Warnings

${warnings.length ? warnings.map((w) => `- ${w}`).join("\n") : "- (none)"}
`;

const jsonPath = join(outDir, `audit-${stamp}.json`);
const mdPath = join(outDir, `audit-${stamp}.md`);
writeFileSync(jsonPath, JSON.stringify(report, null, 2) + "\n");
writeFileSync(mdPath, md);
writeFileSync(join(outDir, "latest.json"), JSON.stringify(report, null, 2) + "\n");
writeFileSync(join(outDir, "latest.md"), md);

if (jsonOnly) {
  console.log(JSON.stringify(report, null, 2));
} else {
  console.log(`Neo audit: ${verdict} (${quick ? "quick" : "full"})`);
  console.log(`Artifact: ${relative(root, mdPath)}`);
  console.log(`Verify: ${quick ? "skipped" : verify.status === 0 ? "PASS" : `FAIL (exit ${verify.status})`}`);
  console.log(`Admin audit: ${quick ? "skipped" : `exit ${adminAudit.status}`}`);
  console.log(`Mobile audit: ${quick ? "skipped" : `exit ${mobileAudit.status} (advisory)`}`);
  console.log(`Secrets: ${pathSecrets.length + contentSecrets.length === 0 ? "clean" : "FOUND"}`);
  if (blockers.length) console.log(`Blockers:\n${blockers.map((b) => `  - ${b}`).join("\n")}`);
  if (warnings.length) console.log(`Warnings:\n${warnings.map((w) => `  - ${w}`).join("\n")}`);
}

process.exit(verdict === "PASS" ? 0 : 1);
