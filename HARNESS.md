# Two-agent harness

Claude Code writes code. OpenCode audits it, verifies it, pushes it, and holds
the credentials.

## Why split it

Two reasons, and the second is the one that matters.

**Blast radius.** Pushing, deploying and reading credentials are irreversible or
shared-state actions. An agent that only edits files cannot do them by
accident, because it cannot do them at all.

**Independence.** An agent that writes code and then approves its own work has no
verification step — it just re-reads its own reasoning and agrees with itself.
Splitting the roles means the code is checked by something that did not write
it. The `scripts/verify.sh` run that approves a change is not the run that
produced it.

## The split

| | Claude Code | OpenCode |
|---|---|---|
| Read / edit / write files | yes | yes |
| Run lint, typecheck, tests locally | yes | yes |
| `git add`, `git commit` (local) | yes | yes |
| `git push` | **no** | yes |
| `vercel`, `eas`, `gh workflow`, `supabase db push` | **no** | yes |
| Read `.env`, `.git/credentials` | **no** | yes |
| Authoritative verification (`scripts/verify.sh`) | no | yes |

## What enforces it

Three layers, because any one of them alone leaks.

**1. Permission rules** — `.claude/settings.json`
Deny rules for push, deploy and credential commands. Cheap, and a bare-name deny
removes the tool from Claude's context entirely. They also refuse
`bypassPermissions` so the rules can't be switched off wholesale.

**2. PreToolUse hook** — `scripts/claude-guard.mjs`
This is the layer that actually holds. The Claude Code docs are explicit that a
Bash deny rule *"is not a security boundary around the program"*: `Bash(git push *)`
stops `git push` but not `git -C . push`, `/usr/bin/git push`, `sh -c 'git push'`
or `git 'push'`. The hook reads the command Claude actually wrote, tokenises it,
and denies on the resolved argv — so all four are caught, along with command
substitution (`echo $(git push)`), wrappers (`timeout`/`nohup`/`env`), and
quoted subcommands.

It denies `.env` and `.git/credentials` reads on the file tools too.

Verify it yourself — it ships with 43 cases covering exactly these bypasses:

```sh
node scripts/claude-guard.mjs --self-test
```

**3. Git pre-push** — `.githooks/pre-push`
Refuses an unmarked push, then runs `scripts/verify.sh`. Install once:

```sh
git config core.hooksPath .githooks
```

`KFD_PUSH=1 git push` when OpenCode pushes. `KFD_SKIP_VERIFY=1` when the gate is
failing for something unrelated to what you're pushing.

## What this is not

Be clear about the limits, because a harness that looks like a security boundary
and isn't is worse than none.

- **`KFD_PUSH=1` is not authentication.** Anyone with a shell on this machine can
  set it. The hook makes the normal path safe and the unusual path deliberate
  and visible. It does not stop a determined actor.
- **The guard is a filter, not a sandbox.** It parses command text. It is not an
  OS-level boundary, and a sufficiently creative bypass would get past it.
- **`.claude/settings.json` is advisory in one direction.** A user can override
  project settings from `~/.claude/settings.json`. Managed settings cannot be
  overridden at all — if you want a real organisational boundary, that is the
  mechanism, not this repo.

**The actual boundary is remote**: CI plus branch protection on `main`, and deploy
secrets that live only in GitHub Actions and never on disk. Right now those
secrets are `VERCEL_TOKEN`, `SUPABASE_ACCESS_TOKEN`, `SUPABASE_DB_PASSWORD`,
`ADMIN_USER`, `ADMIN_PASSWORD` — none of which are in this repo. Locally you only
have `EXPO_PUBLIC_*` and `NEXT_PUBLIC_*`, which are public by design (they ship
inside the client bundle).

Turn on branch protection requiring `CI OK` and this setup stops being advisory.

## The gate

`scripts/verify.sh` mirrors `.github/workflows/ci.yml` so a green local run
predicts a green CI run.

```sh
scripts/verify.sh all      # everything
scripts/verify.sh admin
scripts/verify.sh mobile
```

Every check runs even when an earlier one fails, so one pass tells you everything
that is broken rather than just the first thing.

CI runs the same blocking checks, plus the guard self-test as its own job. The
admin audit is deliberately not wrapped in `|| true`: a high or critical
advisory in a production dependency fails CI exactly as it fails the local
gate. That matters because a pull request is checked by CI, not by the local
hook.

Two checks are **advisory**: the mobile `npm audit` and `expo-doctor`. Expo pins
packages with advisories that have no upstream fix, and `npm audit fix --force`
would move the app off SDK 57. They report and never block, so a known-unfixable
upstream issue can't wedge every future push. Admin's audit *is* blocking, which
is why the Next.js critical advisory didn't survive.

The **Expo SDK alignment** check is blocking, in the local gate and in CI
alike. The app is pinned to SDK 57, and `expo install --check` compares the
installed tree against the versions SDK 57 bundles — it fails the moment an
`expo-*` package has walked onto another SDK. Dependabot's `~57.0.x` ranges
cannot cause that; a hand-edited version range can. It runs with `CI=1` so it
stays non-interactive: without that the CLI offers to "Fix dependencies?" and
rewrites the lockfile from inside the gate.

The root `package.json` pins `expo` to the same SDK 57 line for a related
reason. `npx expo` from the repository root has no local copy to resolve, so it
downloads whatever the registry serves as `latest` — currently SDK 58 — and an
SDK 58 CLI will happily rewrite an SDK 57 project. The root pin makes `npx
expo` resolve to SDK 57 from any directory in the repo.

## The MCP servers

`.opencode/opencode.json` starts five project MCP servers: `graphify`,
`playwright`, `context7`, `supabase` and `vercel`. The global
`~/.config/opencode/opencode.jsonc` adds `memory`. `graphify` and `memory` are
local binaries. `playwright` and `context7` are npm packages, and they are
launched through `scripts/mcp-server.sh` rather than through
`npx -y <package>@latest`, because `npx` makes every session start pay for an
npm resolution, a download and a cold install before the server answers the
handshake. OpenCode gives that handshake a fixed number of seconds, so on a
cold cache the client gave up first and the servers came up as
`failed: Request timed out` — the tools were never broken, they were late.

`supabase` and `vercel` are remote Streamable HTTP servers authenticated with
OAuth, so no token lives in the config. Supabase is scoped to project
`ijeqwbrrgfsmymsektih` and pinned to `read_only=true` with the `database`,
`docs` and `debugging` feature groups: it can inspect schema, run read queries
and read logs, but it cannot mutate the database. Schema changes still go
through migrations and `supabase db push`. Vercel grants the same access as
your Vercel user account. Sign in with `/mcps`, or run
`opencode mcp auth supabase` / `opencode mcp auth vercel`; until then
`opencode mcp list` reports `needs authentication`. Never paste a token into
this file.

The script runs the local copy when there is one and falls back to `npx`
with a pinned version when there is not. Measured on this machine:

| Server | Local copy | `npx` fallback |
| --- | --- | --- |
| `playwright` | 204 ms | 2.1 s |
| `context7` | 356 ms | 6.3 s |

On a cold npm cache the fallback is far slower than that, which is what the
timeout was.

To install the local copies (they live in `.opencode/node_modules`, which is
machine-local by design — see `.opencode/.gitignore`):

```sh
cd .opencode && npm install --save-exact --save-dev \
  @playwright/mcp@0.0.83 @upstash/context7-mcp@4.4.4
cd .opencode && npx playwright install chromium
```

The browser matters: without one, the Playwright server connects and then
fails every navigation.

Check the result with:

```sh
opencode mcp list
```

## Working with Claude Code

Claude commits locally and stops. You verify and push:

```sh
scripts/verify.sh all
KFD_PUSH=1 git push
```

If the gate catches something, fix it or decide deliberately to skip — don't
silently work around it.