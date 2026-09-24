---
name: token-efficiency
description: Use when working in this repo to keep token usage low — scoped graph queries first, targeted reads only, never dump whole files. Triggers on codebase questions, broad greps, large file reads, and long sessions.
---

# Token Efficiency

Low-token workflows for this codebase. Treat these as defaults, not suggestions.

## 1. Graph first (always available here)

This repo has a knowledge graph at `graphify-out/` built by the `graphify` CLI (installed as `~/.local/bin/graphify`).

- For codebase questions, run `graphify query "<question>"` **before** any raw `grep`/`rg`/`find`/`cat` sweep. It returns a scoped, token-budgeted subgraph (default 2000-token cap) far smaller than raw file reads.
- Use `graphify path "A" "B"` for relationship questions and `graphify explain "Concept"` for focused single-concept deep dives.
- The `graphify` MCP server (`graphify-mcp`) exposes the same graph as tools: `query_graph`, `get_node`, `get_neighbors`, `shortest_path`, `god_nodes`, `graph_stats`.
- Read `graphify-out/GRAPH_REPORT.md` only for broad architecture review, never as a first step.
- Prefer `graphify query "<question>"` over `graphify query "<question>" --budget 5000` — keep budgets small.

## 2. Target reads

- Use `Read` with explicit `offset`/`limit` windows instead of opening whole files.
- Never `cat` a file when you can grep for the exact symbol first.
- Use `Grep` with `include` filters to narrow before reading.
- Read the minimal surrounding context to answer the specific question; do not skim entire files.

## 3. Session hygiene

- Prefer the `explore` subagent for open-ended searches (returns a compact summary, keeps big raw output out of the main thread).
- For long sessions, summaries/compaction exist for a reason — let context be compacted rather than escalating runs of verbose output.
- Do not re-run the same search twice; cache results mentally and answer from what tools returned.

## 4. What NOT to do

- Do not `cat` `package-lock.json`, `graph.json`, or `GRAPH_REPORT.md` (large, mostly noise).
- Do not run `rg -r` (ripgrep + replace) to explore; that's for edits.
- Do not dump a full directory listing unless the layout question requires it.