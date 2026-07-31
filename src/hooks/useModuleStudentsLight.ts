import { useCallback, useEffect, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchAdminStudentsLight } from "@/lib/adminStudentDirectory";

/**
 * Shared student pool for Staff/Admin modules (Attendance, Certificates, Classes, Uploads).
 * Always uses the same Admin light-list loader so module counts stay in sync.
 */
export function useModuleStudentsLight(
  client: SupabaseClient,
  isActive: boolean
): {
  students: Record<string, unknown>[];
  loading: boolean;
  reload: () => Promise<void>;
} {
  const [students, setStudents] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(false);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const rows = await fetchAdminStudentsLight(client, { force: true });
      setStudents(rows || []);
    } catch (err) {
      console.warn("[module-students] load failed:", err);
      setStudents([]);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [client]);

  useEffect(() => {
    if (!isActive) return;
    // Warm from session cache when possible (no force) — avoids re-paging 30k on every tab open.
    void (async () => {
      setLoading(true);
      try {
        const rows = await fetchAdminStudentsLight(client);
        setStudents(rows || []);
      } catch (err) {
        const msg =
          err instanceof Error
            ? err.message
            : err && typeof err === "object" && "message" in err
              ? String((err as { message?: unknown }).message || "")
              : "";
        console.warn("[module-students]", msg || err);
        setStudents([]);
      } finally {
        setLoading(false);
      }
    })();
  }, [isActive, client]);

  return { students, loading, reload };
}
