import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = "https://unqfphgjilxpbzajcdjl.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVucWZwaGdqaWx4cGJ6YWpjZGpsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzczNzYxMjUsImV4cCI6MjA5Mjk1MjEyNX0.lgQXDkliN603WXSENd_odb6ndg6urW8UaaKP7wf1fTU";

const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);

async function run() {
  console.log("Attempting to login to:", SUPABASE_URL);
  
  // Try login
  const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
      email: 'superadmin@ezyintern.com',
      password: 'Raunak@12583'
  });

  if (authError) {
    console.error("❌ LOGIN FAILED:", authError.message);
    // Let's list a few profiles or roles if unauthenticated or try admin
    const { data: authData2, error: authError2 } = await supabase.auth.signInWithPassword({
        email: 'admin@ezyintern.in',
        password: 'Raunak@12583'
    });
    if (authError2) {
      console.error("❌ LOGIN 2 FAILED:", authError2.message);
      return;
    }
    console.log("✅ LOGIN 2 SUCCESSFUL! User ID:", authData2.user.id);
  } else {
    console.log("✅ LOGIN SUCCESSFUL! User ID:", authData.user.id);
  }

  // 1. Fetch count from fetchStudents query pattern
  const { data: studentsExact, count: exactCount, error: countErr } = await supabase
    .from("students")
    .select("*", { count: "exact" });
  
  console.log("fetchStudents pattern:");
  console.log(" - Error:", countErr ? countErr.message : "None");
  console.log(" - Count:", exactCount);
  console.log(" - Data length:", studentsExact ? studentsExact.length : 0);

  // 2. Fetch from loadAll query pattern
  const { data: loadAllStudents, error: loadAllErr } = await supabase
    .from('students')
    .select('id, full_name, email, college_name, internship_domain, created_at')
    .order('created_at', { ascending: false })
    .limit(50000);

  console.log("loadAll pattern:");
  console.log(" - Error:", loadAllErr ? loadAllErr.message : "None");
  console.log(" - Data length:", loadAllStudents ? loadAllStudents.length : 0);
  
  if (loadAllStudents && studentsExact) {
    const diff = studentsExact.filter(s => !loadAllStudents.some(las => las.id === s.id));
    console.log("Differences (in exact but not in loadAll):", diff.map(s => ({ id: s.id, name: s.full_name, email: s.email })));
  }
}

run();
