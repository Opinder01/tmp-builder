// One-off script to create the first admin account, since there is no
// public sign-up screen by design. Run after the Supabase project exists
// and 0001_init.sql / 0002_storage_buckets.sql have been applied:
//
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
//   node scripts/create-admin.js "you@crowntraffic.ca" "a-strong-password" "Your Name"

import { createClient } from "@supabase/supabase-js";

const [, , email, password, fullName] = process.argv;

if (!email || !password || !fullName) {
  console.error('Usage: node scripts/create-admin.js "<email>" "<password>" "<full name>"');
  process.exit(1);
}

if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in the environment.");
  process.exit(1);
}

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const { data: created, error: createError } = await supabase.auth.admin.createUser({
  email,
  password,
  email_confirm: true,
});
if (createError) {
  console.error("Failed to create auth user:", createError.message);
  process.exit(1);
}

const { error: profileError } = await supabase.from("profiles").insert({
  id: created.user.id,
  role: "admin",
  full_name: fullName,
  email,
});
if (profileError) {
  console.error("Failed to create profile row:", profileError.message);
  process.exit(1);
}

console.log(`Admin account created: ${email}`);
