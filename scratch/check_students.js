import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = "https://unqfphgjilxpbzajcdjl.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVucWZwaGdqaWx4cGJ6YWpjZGpsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzczNzYxMjUsImV4cCI6MjA5Mjk1MjEyNX0.lgQXDkliN603WXSENd_odb6ndg6urW8UaaKP7wf1fTU";

const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);

async function run() {
  const { data: students, error: studentErr, count: studentCount } = await supabase
    .from('students')
    .select('*', { count: 'exact' });
  
  if (studentErr) {
    console.error('Error fetching students:', studentErr);
    return;
  }

  const { data: attendance, error: attErr } = await supabase
    .from('attendance')
    .select('student_id, marked_at');
  
  if (attErr) {
    console.error('Error fetching attendance:', attErr);
    return;
  }

  console.log('Total students in table:', studentCount || students.length);
  console.log('Total attendance records:', attendance.length);
  
  const uniqueStudentsWithAttendance = new Set(attendance.map(a => a.student_id));
  console.log('Unique students with attendance:', uniqueStudentsWithAttendance.size);

  const studentsWithoutAttendance = students.filter(s => !uniqueStudentsWithAttendance.has(s.id));
  console.log('Students with 0 attendance records:', studentsWithoutAttendance.length);
}

run();
