import { supabase } from "@/integrations/supabase/client";

export type EmployeeAttendanceStatus = "present" | "absent" | "half_day" | "leave" | "holiday" | "overtime";

export type EmployeeAttendanceRow = {
  id: string;
  employee_id: string;
  attendance_date: string;
  status: EmployeeAttendanceStatus;
  notes: string | null;
  marked_by: string | null;
  check_in_at: string | null;
  check_out_at: string | null;
  created_at: string;
  updated_at: string;
};

export const ATTENDANCE_STATUS_LABELS: Record<EmployeeAttendanceStatus, string> = {
  present: "Present",
  absent: "Absent",
  half_day: "Half Day",
  leave: "Leave",
  holiday: "Holiday",
  overtime: "Overtime",
};

/** DB CHECK originally allowed only present/absent/half_day/leave. */
const LEGACY_SAFE_STATUSES = new Set<EmployeeAttendanceStatus>([
  "present",
  "absent",
  "half_day",
  "leave",
]);

function statusForDb(status: EmployeeAttendanceStatus | undefined): EmployeeAttendanceStatus | undefined {
  if (!status) return undefined;
  if (LEGACY_SAFE_STATUSES.has(status)) return status;
  // Map extended UI statuses onto values the original CHECK constraint accepts.
  if (status === "holiday") return "leave";
  if (status === "overtime") return "present";
  return "present";
}

/** Returns working hours (decimal) between two ISO timestamps, or null. */
export function calcWorkingHours(checkIn: string | null, checkOut: string | null): number | null {
  if (!checkIn || !checkOut) return null;
  const diff = new Date(checkOut).getTime() - new Date(checkIn).getTime();
  if (diff <= 0) return null;
  return Math.round((diff / 3_600_000) * 100) / 100; // 2 decimal places
}

/** Format decimal hours as "Xh Ym" */
export function formatHours(hours: number | null): string {
  if (hours === null) return "—";
  const h = Math.floor(hours);
  const m = Math.round((hours - h) * 60);
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

export function formatAttendanceTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "—";
  }
}

export function combineDateAndTime(date: string, time: string): string | null {
  if (!date || !time) return null;
  const iso = new Date(`${date}T${time}`);
  if (Number.isNaN(iso.getTime())) return null;
  return iso.toISOString();
}

export async function listEmployeeAttendance(opts?: {
  employeeId?: string;
  fromDate?: string;
  toDate?: string;
  status?: EmployeeAttendanceStatus | "all";
  limit?: number;
}): Promise<EmployeeAttendanceRow[]> {
  let q = supabase
    .from("employee_attendance")
    .select("*")
    .order("attendance_date", { ascending: false })
    .limit(opts?.limit ?? 500);

  if (opts?.employeeId) q = q.eq("employee_id", opts.employeeId);
  if (opts?.fromDate) q = q.gte("attendance_date", opts.fromDate);
  if (opts?.toDate) q = q.lte("attendance_date", opts.toDate);
  if (opts?.status && opts.status !== "all") q = q.eq("status", opts.status);

  const { data, error } = await q;
  if (error) throw error;
  return (data || []) as EmployeeAttendanceRow[];
}

export async function upsertEmployeeAttendance(input: {
  employeeId: string;
  attendanceDate: string;
  status: EmployeeAttendanceStatus;
  notes?: string;
  markedBy?: string | null;
  checkInAt?: string | null;
  checkOutAt?: string | null;
}): Promise<EmployeeAttendanceRow> {
  const payload = {
    employee_id: input.employeeId,
    attendance_date: input.attendanceDate,
    status: statusForDb(input.status) || "present",
    notes: input.notes?.trim() || null,
    marked_by: input.markedBy ?? null,
    check_in_at: input.checkInAt ?? null,
    check_out_at: input.checkOutAt ?? null,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from("employee_attendance")
    .upsert(payload, { onConflict: "employee_id,attendance_date" })
    .select("*")
    .single();

  if (error) throw error;
  return data as EmployeeAttendanceRow;
}

export async function deleteEmployeeAttendance(id: string): Promise<void> {
  const { error } = await supabase.from("employee_attendance").delete().eq("id", id);
  if (error) throw error;
}

/**
 * Update a specific attendance record by its ID.
 * Only writes columns that exist on employee_attendance
 * (audit_log / working_hours were never migrated and broke Check Out & Edit).
 */
export async function updateEmployeeAttendance(
  id: string,
  updates: {
    attendanceDate?: string;
    status?: EmployeeAttendanceStatus;
    notes?: string;
    checkInAt?: string | null;
    checkOutAt?: string | null;
    editedBy?: string | null;
    previousValue?: Record<string, unknown>;
  }
): Promise<EmployeeAttendanceRow> {
  const payload: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };

  if (updates.attendanceDate !== undefined) payload.attendance_date = updates.attendanceDate;
  if (updates.status !== undefined) payload.status = statusForDb(updates.status);
  if (updates.notes !== undefined) payload.notes = updates.notes.trim() || null;
  if (updates.checkInAt !== undefined) payload.check_in_at = updates.checkInAt;
  if (updates.checkOutAt !== undefined) payload.check_out_at = updates.checkOutAt;

  const { data, error } = await supabase
    .from("employee_attendance")
    .update(payload)
    .eq("id", id)
    .select("*")
    .single();

  if (error) throw error;
  return data as EmployeeAttendanceRow;
}
