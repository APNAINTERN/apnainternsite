import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Supabase credentials missing');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function checkConfig() {
  const { data, error } = await supabase.from('payment_config').select('*').eq('id', 1).maybeSingle();
  if (error) {
    console.error('Error:', error);
  } else {
    console.log('Config:', JSON.stringify(data, null, 2));
  }
}

checkConfig();
