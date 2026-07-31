import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.VITE_SUPABASE_URL!, process.env.VITE_SUPABASE_SERVICE_ROLE_KEY!);

async function checkSchema() {
  const { data, error } = await supabase.rpc('get_table_columns', { table_name: 'students' });
  if (error) {
    // Fallback: try querying a sample row
    const { data: sample } = await supabase.from('students').select('*').limit(1);
    console.log("Sample row keys:", Object.keys(sample?.[0] || {}));
  } else {
    console.log("Columns:", data);
  }
}

checkSchema();
