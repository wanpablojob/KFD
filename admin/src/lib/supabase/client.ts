import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database.overrides";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const publishableKey =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
  "";

// The Database generic is load-bearing, not decoration. With a bare
// `SupabaseClient`, `.from()` accepts any string, so a table name mangled into
// a route path -- as happened in 2e58e12, turning every query into
// `/rest/v1/dashboard/orders` and a runtime 404 -- typechecked clean. With the
// generated schema, TypeScript rejects identifiers the database does not have.
// Regenerate with:
//   supabase gen types typescript --project-id <ref> > src/lib/supabase/database.types.ts
export const supabase: SupabaseClient<Database> = createClient(url, publishableKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  },
});