---
description: Plan and implement a change end-to-end
agent: build
---

Load the `kfd-build` skill and follow it for this task:

$ARGUMENTS

Start by restating the goal and the acceptance criteria. Plan before editing, make the smallest change that satisfies them, run the targeted checks, then run `scripts/verify.sh all`. Inspect the real diff, update the knowledge graph, and write the build journal entry. Report the evidence and leave the tree ready to ship; commit and push are the separate `/ship` step.
