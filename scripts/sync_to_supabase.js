/* ==========================================================================
   scripts/sync_to_supabase.js — Sync Local Data to Supabase PostgreSQL
   Transfers renewals, app_users, invitations, and audit logs to Supabase.
   ========================================================================== */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

if (!url || !key) {
  console.error('ERROR: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in .env.');
  process.exit(1);
}

const supabase = createClient(url, key, { auth: { persistSession: false } });

// Convert camelCase to snake_case
function toSnakeCase(obj) {
  if (!obj || typeof obj !== 'object') return obj;
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    const snakeKey = k.replace(/[A-Z]/g, (l) => `_${l.toLowerCase()}`);
    out[snakeKey] = v;
  }
  return out;
}

async function sync() {
  const storePath = path.join(__dirname, '..', 'data', 'store.json');
  const seedPath = path.join(__dirname, '..', 'data', 'seed.json');
  const fileToRead = fs.existsSync(storePath) ? storePath : seedPath;

  if (!fs.existsSync(fileToRead)) {
    console.error('No store or seed file found.');
    return;
  }

  const store = JSON.parse(fs.readFileSync(fileToRead, 'utf8'));
  console.log(`Loaded data from ${fileToRead}`);

  // 1. Sync app_users
  if (store.users && store.users.length > 0) {
    console.log(`Syncing ${store.users.length} users to app_users...`);
    for (const u of store.users) {
      const record = {
        id: u.id,
        email: u.email,
        full_name: u.fullName || u.name,
        role: u.role || 'Employee',
        status: u.status || 'active',
        mobile: u.mobile || '',
        password_hash: u.passwordHash || u.password || '',
      };
      const { error } = await supabase.from('app_users').upsert(toSnakeCase(record), { onConflict: 'email' });
      if (error) {
        console.warn(`[app_users error for ${u.email}]:`, error.message);
      } else {
        console.log(`  Synced user: ${u.email} (${u.role})`);
      }
    }
  }

  // 2. Sync invitations
  if (store.invitations && store.invitations.length > 0) {
    console.log(`Syncing ${store.invitations.length} invitations...`);
    for (const inv of store.invitations) {
      const { error } = await supabase.from('invitations').upsert(toSnakeCase(inv), { onConflict: 'token' });
      if (error) {
        console.warn(`[invitations error for ${inv.email}]:`, error.message);
      } else {
        console.log(`  Synced invite: ${inv.email} (${inv.role}, status: ${inv.status})`);
      }
    }
  }

  // 3. Sync renewals
  if (store.renewals && store.renewals.length > 0) {
    console.log(`Syncing ${store.renewals.length} renewals...`);
    for (const r of store.renewals) {
      const { error } = await supabase.from('renewals').upsert(toSnakeCase(r), { onConflict: 'id' });
      if (error) {
        console.warn(`[renewals error for ${r.name}]:`, error.message);
      } else {
        console.log(`  Synced renewal: ${r.name}`);
      }
    }
  }

  console.log('Sync process completed.');
}

sync().catch(console.error);
