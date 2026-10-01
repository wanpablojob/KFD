"use client";

import { supabase } from "./supabase/client";

export type LeadKind = "waitlist" | "restaurant" | "rider";

export interface LeadInput {
  kind: LeadKind;
  name: string;
  contact: string;
  note?: string;
  consent: boolean;
}

/**
 * Write a pre-launch signup through public.submit_lead().
 *
 * Never a table insert: `leads` has RLS with no policies and no browser grants,
 * so the SECURITY DEFINER function is the only path in. Calling it with the anon
 * key is the intended design -- the forms are open to signed-out visitors.
 */

/**
 * submit_lead() comes from migration 0032_leads.sql, applied to production on
 * 2026-10-01 along with 0024-0031. Its arguments are checked against the
 * generated schema -- database.overrides.ts, which used to declare this
 * function ahead of production, has been removed.
 */
export async function submitLead(input: LeadInput): Promise<void> {
  const { error } = await supabase.rpc("submit_lead", {
    p_kind: input.kind,
    p_name: input.name,
    p_contact: input.contact,
    // Omitted rather than passed as null: the RPC argument is optional text,
    // and submit_lead coalesces a missing note to '' internally.
    ...(input.note?.trim() ? { p_note: input.note.trim() } : {}),
    p_consent: input.consent,
  });

  if (error) throw new Error(error.message);
}
