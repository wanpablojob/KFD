---
name: debugging
description: Use when a bug is reported, when a check suite is green but reality disagrees, or when a fix is proposed without a confirmed cause. Enforces cause-before-fix and class-before-instance thinking. Triggers on "doesn't work", "no data", "broken", "error", "why is this happening", a stack trace, or any postmortem of something that shipped broken.
---

# Debugging

Derived from incidents in this repo where the obvious cause was wrong, or the
obvious fix passed every check and still shipped broken. Treat as procedure, not
suggestion.

## The rule

**No fix without a reproduced, named cause.** A patch applied before the cause
is known is a guess with a green checkmark next to it.

## 1. Reproduce before theorizing

- Make the failure happen on demand before changing anything. If you cannot
  reproduce it, say so and gather evidence instead of patching blind.
- Capture the *actual* error text. Do not paraphrase it from memory or from a
  screenshot description. In this repo the difference between
  `PGRST125 Invalid path` and `42501 permission denied` is the entire
  investigation.
- Distinguish "I reproduced it" from "the user described it." Only the first
  supports a fix.

## 2. Read the failure's class, not just its instance

Before hunting, name the class of defect and ask whether your evidence is even
capable of showing it.

> Worked example, `2e58e12`: a route-move find-and-replace rewrote
> `supabase.from("orders")` into `supabase.from("/dashboard/orders")`. Every
> dashboard read returned `404 PGRST125`. TypeScript, ESLint, and all tests
> passed. Why? `client.ts` typed the client as bare `SupabaseClient` with no
> `Database` generic, so `.from()` accepted any string, and the mangled names
> were used consistently everywhere including in a hand-written union type.
> The class here is *identifier corruption from non-AST text rewriting*, not
> "the dashboard is broken." The instance was 4 table names; the class could hit
> any identifier in any string literal — route paths, RPC names, enum values,
> test fixtures.

So: after fixing, ask what else shares the broken assumption. Grepping for the
one string you fixed is not enough.

## 3. When green checks disagree with reality, suspect the checks

This is the highest-value move in this skill. If typecheck/lint/tests are green
and the user says it's broken, the checks are the bug.

Ask in order:

- **Is the assertion real?** Does the suite actually assert the behavior the
  user depends on, or does it assert something adjacent that happens to pass?
- **Is it blind by construction?** A typed API with no schema (`SupabaseClient`
  without `Database`) accepts any string. A test that mocks the boundary tests
  the mock. A snapshot test pins whatever it first captured.
- **Did the check pass because it agreed with the bug?** In `2e58e12` the
  mangled names were literals used consistently, so nothing could disagree.
- **Does the check run in production?** CI used placeholder Supabase env vars,
  so it could never touch the real schema.

## 4. Test the boundary you are not testing

- Supabase: anon requests use the publishable key and are denied by RLS on many
  tables. A `401`/`42501` from anon means *the key cannot see the row*, not
  *the table is empty or missing*. Authenticated behavior is a different
  system. Confirm which one you are testing before theorizing.
- PostgREST: `404 PGRST125` = wrong path/identifier. `401`/`42501` = correct
  identifier, insufficient privilege. These look equally like "no data" in a
  UI and have opposite causes.
- A database that *answers* is not a database that *matches your migrations*.

## 5. Order of operations

1. Reproduce. Get the literal error.
2. Locate the origin commit with `git log -S'<string>' -- <file>` when the cause
   smells like collateral damage from a refactor. Name that commit in the fix.
3. State the mechanism in one sentence, in plain language.
4. Write the failing check **first**. Confirm it fails.
5. Fix. Confirm the check passes.
6. Grep for the rest of the class.
7. `graphify update .`, then commit, push, and verify CI and deployment.

## 6. Honesty requirements

- Never claim a fix is verified unless you observed the failure before and the
  success after. If you only did one of those, say which one.
- Distinguish **verified** (observed), **inferred** (reasoned from evidence),
  and **unknown**. Do not collapse them.
- If you cannot reproduce, the honest report is "not reproduced, here is what I
  ruled out and what I'd check next." Not a confident patch.
- When correcting an earlier claim of mine, state plainly that the earlier claim
  was wrong. Do not quietly move on.
