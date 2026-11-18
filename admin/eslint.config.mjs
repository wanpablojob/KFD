import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Written by scripts/gen-db-types.sh; must stay identical to the mobile copy.
    "src/lib/supabase/database.types.ts",
    // Third-party source kept verbatim (plus the patch in PATCH.md); it is
    // maintained upstream, not held to this app's lint rules.
    "vendor/**",
  ]),
]);

export default eslintConfig;
