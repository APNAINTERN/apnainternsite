import { createClient } from "@supabase/supabase-js";
import { saveEngineeringConfig } from "../../src/lib/engineeringConfig.ts";

const API = "https://eikmcrd7ei.execute-api.ap-south-1.amazonaws.com/staging";

async function main() {
  const client = createClient(API, "local-anon-key", {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: auth, error: authErr } = await client.auth.signInWithPassword({
    email: "apnaintern.in@gmail.com",
    password: "Shiva@2028#77",
  });
  if (authErr) throw authErr;
  console.log("logged in as", auth.user?.email);

  const testName = `Eng Mgmt Test ${Date.now()}`;
  const saved = await saveEngineeringConfig(client, {
    universityName: testName,
    collegeNames: ["Test College Alpha", "Test College Beta"],
    courses: ["B.Tech", "Other"],
    branchesByCourse: {
      "B.Tech": ["CSE", "Other"],
      Other: ["Other"],
    },
    domains: ["Web Development"],
  });

  console.log("saved:", {
    id: saved.id,
    university_id: saved.university_id,
    university_name: saved.university_name,
    colleges_inserted: saved.colleges_inserted,
    college_warnings: saved.college_warnings,
  });

  const { data: configs, error: listErr } = await client
    .from("engineering_university_configs")
    .select("*")
    .order("created_at", { ascending: false });
  if (listErr) throw listErr;
  console.log("list count after save:", configs?.length);

  // cleanup
  if (saved.id) {
    await client.from("engineering_university_configs").delete().eq("id", saved.id);
  }
  if (saved.university_id) {
    await client.from("colleges").delete().eq("university_id", saved.university_id);
    await client.from("universities").delete().eq("id", saved.university_id);
  }
  console.log("cleanup done");
}

main().catch((e) => {
  console.error("FAIL:", e);
  process.exit(1);
});
