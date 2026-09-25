/**
 * Commit message rules for the KFD monorepo.
 * Style documented in README.md -> "Commit style".
 *
 * @type {import('@commitlint/types').UserConfig}
 */
module.exports = {
  extends: ["@commitlint/config-conventional"],
  rules: {
    "header-max-length": [2, "always", 100],
    "body-max-line-length": [1, "always", 100],
    "subject-empty": [2, "never"],
    "scope-case": [2, "always", "lower-case"],
    "type-enum": [
      2,
      "always",
      [
        "build",
        "chore",
        "ci",
        "docs",
        "feat",
        "fix",
        "perf",
        "refactor",
        "revert",
        "style",
        "test",
      ],
    ],
  },
};
