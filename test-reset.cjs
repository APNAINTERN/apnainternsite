const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env' });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("Missing Supabase credentials in .env");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function testReset() {
  console.log("Testing Supabase reset password...");
  const email = "raunakkumarjob@gmail.com";
  
  const { data, error } = await supabase.auth.resetPasswordForEmail(email);
  
  if (error) {
    console.error("❌ Error:", error.message, error.status);
  } else {
    console.log("✅ Success! Data:", data);
  }
}

testReset();
