import { createClient } from "@supabase/supabase-js";

/**
 * Service-role Supabase client — SERVER ONLY.
 *
 * Bypasses Row Level Security. Used by the verification worker to write results.
 * Never import this from a Client Component.
 */
export function createAdminClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set");
  }
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
