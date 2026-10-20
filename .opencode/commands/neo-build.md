---
description: Neo — build and audit without pushing
agent: neo
model: opencode/big-pickle
---

Load the `kfd-build` skill and implement:

$ARGUMENTS

Run the targeted checks, then `scripts/verify.sh all`. Inspect the real diff, update the knowledge graph, and write the build journal entry. Report the evidence and verdict. Do not commit or push in this command; leave the tree ready for `/neo-ship`.
