/* ==========================================================================
   backend/supabaseClient.js — Supabase PostgreSQL Connection
   Initializes the Supabase client safely with connection state detection.
   ========================================================================== */

const { createClient } = require("@supabase/supabase-js");
const config = require("./config");

let supabase = null;
let isConfigured = false;

if (
  config.SUPABASE_URL &&
  config.SUPABASE_URL.trim() !== "" &&
  !config.SUPABASE_URL.includes("your-project") &&
  (config.SUPABASE_SERVICE_ROLE_KEY || config.SUPABASE_ANON_KEY)
) {
  try {
    const key = config.SUPABASE_SERVICE_ROLE_KEY || config.SUPABASE_ANON_KEY;
    supabase = createClient(config.SUPABASE_URL, key, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });
    isConfigured = true;
    console.log(`[Supabase] Successfully initialized client for: ${config.SUPABASE_URL}`);
  } catch (err) {
    console.error(`[Supabase Error] Failed to initialize client: ${err.message}`);
    supabase = null;
    isConfigured = false;
  }
} else {
  console.log(
    "[Supabase Notice] Supabase credentials not set in .env. Local storage fallback active. Set SUPABASE_URL and SUPABASE_ANON_KEY to connect to Supabase PostgreSQL."
  );
}

module.exports = {
  supabase,
  isConfigured: () => isConfigured,
};
