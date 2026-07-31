import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = "https://unqfphgjilxpbzajcdjl.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVucWZwaGdqaWx4cGJ6YWpjZGpsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzczNzYxMjUsImV4cCI6MjA5Mjk1MjEyNX0.lgQXDkliN603WXSENd_odb6ndg6urW8UaaKP7wf1fTU";

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function checkStudents() {
  const { data, error } = await supabase
    .from('students')
    .select('full_name, registration_id, college_name, university_name')
    .order('created_at', { ascending: false })
    .limit(10);

  if (error) {
    console.error('Error:', error);
    return;
  }

  console.table(data);
}

checkStudents();
