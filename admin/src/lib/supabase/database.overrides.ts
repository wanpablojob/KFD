import type { Database as Generated } from "./database.types";

/**
 * Schema the code targets, ahead of what is actually deployed.
 *
 * `database.types.ts` is generated from the live project, so it reflects what
 * production has -- and production is behind the migration folder. Migration
 * 0032_leads.sql is committed but not applied, so `leads` and `submit_lead()`
 * are absent from the generated types even though the app already calls them.
 *
 * Rather than casting the RPC name away in leads.ts, which would leave its
 * arguments unchecked -- the exact hole that let 2e58e12 ship a mangled
 * identifier past a green typecheck -- this declares the pending function with
 * its real signature so `.rpc()` still type-checks every argument.
 *
 * MAINTENANCE: apply 0032_leads.sql to production, regenerate
 *   supabase gen types typescript --project-id <ref> > src/lib/supabase/database.types.ts
 * then delete PendingFunctions and export Database again from the generated
 * file. Nothing else needs to change.
 */

export type PendingFunctions = {
  /** public.submit_lead(text, text, text, text, boolean) -> void */
  submit_lead: {
    Args: {
      p_kind: string;
      p_name: string;
      p_contact: string;
      p_note: string | null;
      p_consent: boolean;
    };
    Returns: undefined;
  };
};

export type Database = Omit<Generated, "public"> & {
  public: Omit<Generated["public"], "Functions"> & {
    Functions: Generated["public"]["Functions"] & PendingFunctions;
  };
};
