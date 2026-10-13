#!/usr/bin/env node
//
// PreToolUse guard for Claude Code. The permission rules in
// `.claude/settings.json` stop `git push` but NOT `git -C . push`,
// `/usr/bin/git push`, `sh -c 'git push'` or `git 'push'` — the Claude Code
// docs say those rules "are not a security boundary around the program".
// This hook inspects the command Claude actually wrote and denies it.
//
// The division of labour this enforces:
//   Claude Code  reads, edits, runs checks, commits locally
//   OpenCode     audits, verifies, pushes, deploys, holds credentials
//
// Protocol: reads the PreToolUse event JSON on stdin, writes a
// hookSpecificOutput decision on stdout. Exits non-zero only on internal
// error, and an internal error denies (fail closed) rather than allowing.
//
//   node scripts/claude-guard.mjs            # act as a PreToolUse hook
//   node scripts/claude-guard.mjs --self-test  # verify the guard itself

import { readFileSync } from "node:fs";

/**
 * Pull out command substitutions — `$(...)` and backticks — so a denied
 * command cannot be smuggled through one: `echo $(git push)` must fail even
 * though `echo` is itself innocent.
 */
function extractSubstitutions(command) {
  const found = [];

  // `$( ... )`, tracking nesting and quotes so an inner `)` does not end it.
  for (let i = 0; i < command.length; i++) {
    if (command[i] !== "$" || command[i + 1] !== "(") continue;
    let depth = 1; // the opening `(` is already consumed
    let quote = null;
    const inner = [];
    for (let j = i + 2; j < command.length; j++) {
      const c = command[j];
      if (quote) {
        if (c === quote) quote = null;
        else inner.push(c);
        continue;
      }
      if (c === '"' || c === "'") { quote = c; continue; }
      if (c === "(") depth++;
      else if (c === ")") {
        depth--;
        if (depth === 0) break;
      }
      inner.push(c);
    }
    found.push(inner.join(""));
    i += 1;
  }

  // Backticks: the next unescaped backtick closes them.
  for (let i = 0; i < command.length; i++) {
    if (command[i] !== "`") continue;
    const close = command.indexOf("`", i + 1);
    if (close === -1) break;
    found.push(command.slice(i + 1, close));
    i = close;
  }

  return found;
}

/**
 * Split a shell command into argv, honouring quotes. Good enough to defeat
 * the documented bypasses; it is not a shell.
 */
function tokenize(command) {
  const tokens = [];
  let current = "";
  let quote = null;
  let escaped = false;

  for (const char of command) {
    if (escaped) {
      current += char;
      escaped = false;
      continue;
    }
    if (char === "\\" && quote !== "'") {
      escaped = true;
      continue;
    }
    if (quote) {
      if (char === quote) quote = null;
      else current += char;
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }
    if (/\s/.test(char)) {
      if (current) tokens.push(current);
      current = "";
      continue;
    }
    current += char;
  }
  if (current) tokens.push(current);
  return tokens;
}

/** Expand `git`-style global options so the real subcommand is reachable. */
function stripGitGlobals(argv) {
  const out = [];
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    // Options that consume the next token as their value.
    if (["-C", "-c", "--git-dir", "--work-tree", "--namespace", "--exec-path"].includes(arg)) {
      i++;
      continue;
    }
    // Options written with an inline `=value`.
    if (/^--(git-dir|work-tree|namespace|exec-path)=/.test(arg)) continue;
    // Options that never take a value.
    if (["--bare", "--no-pager", "-P", "--paginate", "--literal-pathspecs",
         "--glob-pathspecs", "--noglob-pathspecs", "--icase-pathspecs",
         "--no-replace-objects"].includes(arg)) {
      continue;
    }
    out.push(arg);
  }
  return out;
}

const baseName = (p) => p.split("/").pop();

/** Find the index of the first occurrence of `program`, ignoring wrappers. */
function findProgram(argv, program) {
  for (let i = 0; i < argv.length; i++) {
    if (baseName(argv[i]) === program) return i;
  }
  return -1;
}

function checkGit(argv) {
  const idx = findProgram(argv, "git");
  if (idx === -1) return null;
  const rest = stripGitGlobals(argv.slice(idx + 1));
  const sub = rest[0];

  if (sub === "push") {
    return "Pushing is OpenCode's job. Ask OpenCode to push.";
  }
  if (sub === "remote" && ["set-url", "remove", "rename"].includes(rest[1])) {
    return "Changing git remotes is reserved for OpenCode.";
  }
  if (sub === "config" && rest[1] === "--global" && ["user.name", "user.email", "credential.helper"].includes(rest[2])) {
    return "Changing global git identity or credential helpers is reserved for OpenCode.";
  }
  if (sub === "filter-branch") {
    return "git filter-branch rewrites published history. Reserved for OpenCode.";
  }
  return null;
}

function checkProgram(argv) {
  const idx = findProgram(argv, "vercel");
  if (idx !== -1) return "Deploying is OpenCode's job. Ask OpenCode to deploy.";

  for (const name of ["netlify", "wrangler", "render", "eas", "flyctl", "heroku", "railway", "doctl"]) {
    if (findProgram(argv, name) !== -1) {
      return `${name} is a credentialed deploy tool. Reserved for OpenCode.`;
    }
  }

  const gh = findProgram(argv, "gh");
  if (gh !== -1) {
    const sub = argv[gh + 1];
    // Reading is fine; anything that can mutate or read a secret is not.
    if (sub === "secret" || sub === "variable") {
      return "gh secret/variable manages credentials. Reserved for OpenCode.";
    }
    if (sub === "workflow" || sub === "run" || sub === "release") {
      return "Triggering workflows or releases is reserved for OpenCode.";
    }
    if (sub === "auth" && !["status", "--version"].includes(argv[gh + 2])) {
      return "Changing gh authentication is reserved for OpenCode.";
    }
    if (sub === "api") {
      return "gh api can mutate remote state. Reserved for OpenCode.";
    }
    if (sub === undefined || !["status", "--version", "version", "help", "browse", "pr", "issue", "repo"].includes(sub)) {
      return "gh is a credentialed tool. Reserved for OpenCode.";
    }
  }

  const supabase = findProgram(argv, "supabase");
  if (supabase !== -1) {
    const sub = argv[supabase + 1];
    if (!["status", "help", "--version"].includes(sub)) {
      return "supabase CLI talks to a remote project. Reserved for OpenCode.";
    }
  }
  return null;
}

/** Decide whether one command may run. Returns a reason string, or null. */
export function evaluate(command) {
  if (typeof command !== "string" || command.trim() === "") return null;

  // Anything run inside a substitution runs just as really as the outer
  // command, so it gets checked first and on equal footing.
  for (const inner of extractSubstitutions(command)) {
    const nested = evaluate(inner);
    if (nested) return nested;
  }

  // A string executed by a shell can hide anything, so resolve it by
  // re-checking its contents rather than trusting the outer program.
  const inner = command.match(/(?:sh|bash|zsh|dash|ksh)\s+-c\s+(['"])([\s\S]*?)\1/);
  if (inner) {
    const nested = evaluate(inner[2]);
    if (nested) return nested;
  }

  const argv = tokenize(command);
  if (argv.length === 0) return null;

  const git = checkGit(argv);
  if (git) return git;

  const program = checkProgram(argv);
  if (program) return program;

  return null;
}

/** Read the hook event from stdin and answer with a decision. */
function main() {
  let raw = "";
  try {
    raw = readFileSync(0, "utf8");
  } catch {
    raw = "";
  }

  let event = {};
  try {
    event = raw.trim() ? JSON.parse(raw) : {};
  } catch {
    // Unparseable event: fail closed.
    process.stdout.write(JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "deny",
        permissionDecisionReason: "claude-guard: could not parse the tool event. Failing closed.",
      },
    }));
    return;
  }

  const tool = event.tool_name || "";
  let reason = null;

  if (tool === "Bash") {
    reason = evaluate(event.tool_input?.command || "");
  } else if (["Read", "Edit", "Write", "NotebookEdit"].includes(tool)) {
    const path = event.tool_input?.file_path || event.tool_input?.notebook_path || "";
    if (/(^|\/)\.env(\.|$)/.test(path)) {
      reason = "Reading .env files is reserved for OpenCode. Use the matching .env.example for the key names.";
    }
    if (/(^|\/)\.git\/(config|credentials)/.test(path)) {
      reason = "Git credentials and config are reserved for OpenCode.";
    }
  }

  process.stdout.write(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: reason ? "deny" : "allow",
      permissionDecisionReason: reason || "claude-guard: no rule matched.",
    },
  }));
}

// ---- self-test -------------------------------------------------------------

function selfTest() {
  const cases = [
    // Must be denied: the documented bypasses of a plain deny rule.
    ["git push", true],
    ["git push origin main", true],
    ["git push --force", true],
    ["git -C . push origin main", true],
    ["git -c user.email=a@b push", true],
    ["/usr/bin/git push", true],
    ["/usr/local/bin/git push origin main --force", true],
    ["git 'push' origin main", true],
    ['git "push" origin main', true],
    ["sh -c 'git push'", true],
    ['bash -c "git push --force"', true],
    ["git push && echo done", true],
    ["timeout 30 git push", true],
    ["env FOO=bar git push", true],
    ["nohup git push", true],
    // Must be denied: deploy and credential surfaces.
    ["vercel --prod", true],
    ["npx vercel deploy", true],
    ["gh secret set SUPABASE_DB_PASSWORD", true],
    ["gh workflow run deploy-admin.yml", true],
    ["gh auth login", true],
    ["supabase db push", true],
    ["eas publish --auto", true],
    // Must be allowed: Claude's actual job.
    ["git status", false],
    ["git diff", false],
    ["git log --oneline -5", false],
    ["git add -A", false],
    ["git commit -m 'fix: thing'", false],
    ["npm run lint", false],
    ["npm run typecheck", false],
    ["npm test", false],
    ["npm run build", false],
    ["npx expo-doctor", false],
    ["graphify query 'how does auth work'", false],
    ["ls -la", false],
    ["rg foo src/", false],
    ["cat package.json", false],
    ["node scripts/claude-guard.mjs --self-test", false],
    // Substitutions run for real, so the outer command's innocence is no help.
    ["echo $(git push)", true],
    ["echo `git push`", true],
    ["echo $(sh -c 'git push')", true],
    ["git commit -m \"$(git push)\"", true],
    // `push` as a *value* rather than a subcommand stays allowed: the guard
    // reads git's argv, not the text, so this is not over-blocking.
    ["git log --grep push", false],
    ["git commit -m 'fix: push retry'", false],
  ];

  let failed = 0;
  for (const [command, shouldDeny] of cases) {
    const reason = evaluate(command);
    const denied = Boolean(reason);
    if (denied !== shouldDeny) {
      failed++;
      console.error(`FAIL  ${JSON.stringify(command)} -> ${denied ? `denied (${reason})` : "allowed"}, expected ${shouldDeny ? "denied" : "allowed"}`);
    }
  }

  if (failed === 0) {
    console.log(`claude-guard: ${cases.length}/${cases.length} self-tests passed`);
  } else {
    console.error(`claude-guard: ${failed}/${cases.length} self-tests FAILED`);
    process.exit(1);
  }
}

if (process.argv.includes("--self-test")) {
  selfTest();
} else {
  main();
}