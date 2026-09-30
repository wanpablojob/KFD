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
 * submit_lead() is created by migration 0032_leads.sql, which is committed but
 * NOT yet applied to production. It is declared in database.overrides.ts so
 * these arguments stay type-checked; the call fails at runtime with 404
 * PGRST202 until 0032 is applied, which is the honest current state of the lead
 * forms.
 */
export async function submitLead(input: LeadInput): Promise<void> {
  const { error } = await supabase.rpc("submit_lead", {
    p_kind: input.kind,
    p_name: input.name,
    p_contact: input.contact,
    p_note: input.note?.trim() || null,
    p_consent: input.consent,
  });

  if (error) throw new Error(error.message);
}
