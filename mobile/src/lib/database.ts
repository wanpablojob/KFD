/**
 * Supabase Database types for the mobile app.
 *
 * Re-exported from database.generated.ts, which scripts/gen-db-types.sh builds
 * from admin/supabase/migrations and writes byte-for-byte identical to the admin
 * app's copy. These used to be written by hand here, covering only what this
 * app touched, and they drifted from the schema -- which is how a single
 * unapplied column could hide a rider's profile without the compiler noticing.
 *
 * Do not add hand-written table or function shapes here. Change the migration,
 * rerun the script, and let the compiler point at what moved.
 */
export type {
  Database,
  Json,
  Tables,
  TablesInsert,
  TablesUpdate,
  Enums,
} from "./database.generated";
