import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = "https://jeehuxtfhzpwsnvmvjne.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImplZWh1eHRmaHpwd3Nudm12am5lIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzczODYwNjcsImV4cCI6MjA5Mjk2MjA2N30.UvYH6YvvA7xo3P-NJjcul-vZI_2qYQjRY9xo4p2txGc";

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function testLogin() {
    console.log("Attempting to login to:", SUPABASE_URL);
    
    const { data, error } = await supabase.auth.signInWithPassword({
        email: 'superadmin@ezyintern.com',
        password: 'Raunak@12583'
    });
    
    if (error) {
        console.error("❌ LOGIN FAILED:", error.status, error.message);
    } else {
        console.log("✅ LOGIN SUCCESSFUL! User ID:", data.user.id);
        
        // Check if user has super_admin role
        const { data: roles, error: roleError } = await supabase
            .from('user_roles')
            .select('role')
            .eq('user_id', data.user.id);
            
        if (roleError) {
            console.error("❌ Role Check Failed:", roleError.message);
        } else {
            console.log("✅ Roles found:", roles);
        }
    }
}

testLogin();
