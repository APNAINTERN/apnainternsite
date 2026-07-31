import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

// Parse .env manually to avoid dotenv dependency issues
const envPath = path.resolve(process.cwd(), '.env');
const envContent = fs.readFileSync(envPath, 'utf-8');
const env = {};
envContent.split('\n').forEach(line => {
  const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
  if (match) {
    let key = match[1];
    let value = match[2] || '';
    // Remove quotes if present
    if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
    if (value.startsWith("'") && value.endsWith("'")) value = value.slice(1, -1);
    env[key] = value;
  }
});

const SUPABASE_URL = env.VITE_SUPABASE_URL;
const SUPABASE_KEY = env.VITE_SUPABASE_PUBLISHABLE_KEY;

console.log("Supabase URL:", SUPABASE_URL);

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function check() {
  // Query students
  const { data: students, error: studentErr } = await supabase.from('students').select('*').limit(5);
  console.log('Students Query Result (no auth):');
  if (studentErr) console.log('Error:', studentErr);
  else console.log('Count:', students.length, 'Sample:', students);

  // Query user_roles
  const { data: roles, error: rolesErr } = await supabase.from('user_roles').select('*').limit(5);
  console.log('Roles Query Result (no auth):');
  if (rolesErr) console.log('Error:', rolesErr);
  else console.log('Count:', roles.length);
}

check();
