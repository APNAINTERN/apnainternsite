import { useCallback, useEffect, useMemo, useState } from "react";
import { CalendarDays, Clock, Edit2, Loader2, LogOut, Plus, Save, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  ATTENDANCE_STATUS_LABELS,
  calcWorkingHours,
  combineDateAndTime,
  deleteEmployeeAttendance,
  formatAttendanceTime,
  formatHours,
  listEmployeeAttendance,
  updateEmployeeAttendance,
  upsertEmployeeAttendance,
  type EmployeeAttendanceRow,
  type EmployeeAttendanceStatus,
} from "@/lib/employeeAttendance";

export type StaffEmployeeOption = {
  id: string;
  email: string;
  full_name?: string | null;
};

type Props = {
  employees: StaffEmployeeOption[];
  currentUserId: string | null;
  isActive?: boolean;
};

/** Pull HH:MM from an ISO timestamp string (locale-safe for <input type="time">). */
function isoToTime(iso: string | null | undefined): string {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "";
    const hh = String(d.getHours()).padStart(2, "0");
    const mm = String(d.getMinutes()).padStart(2, "0");
    return `${hh}:${mm}`;
  } catch {
    return "";
  }
}

const STATUS_BADGE_CLS: Record<EmployeeAttendanceStatus, string> = {
  present: "bg-emerald-50 text-emerald-700 border-emerald-200",
  absent: "bg-red-50 text-red-700 border-red-200",
  half_day: "bg-amber-50 text-amber-700 border-amber-200",
  leave: "bg-slate-100 text-slate-700 border-slate-200",
  holiday: "bg-blue-50 text-blue-700 border-blue-200",
  overtime: "bg-purple-50 text-purple-700 border-purple-200",
};

// ─── Edit modal state ────────────────────────────────────────────────────────
type EditState = {
  row: EmployeeAttendanceRow;
  date: string;
  checkIn: string;
  checkOut: string;
  status: EmployeeAttendanceStatus;
  notes: string;
};

export function EmployeeAttendancePanel({ employees, currentUserId, isActive = true }: Props) {
  const [rows, setRows] = useState<EmployeeAttendanceRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  // Mark-new form
  const [filterEmployee, setFilterEmployee] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<EmployeeAttendanceStatus | "all">("all");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

  const [markEmployee, setMarkEmployee] = useState("");
  const [markDate, setMarkDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [markStatus, setMarkStatus] = useState<EmployeeAttendanceStatus>("present");
  const [markNotes, setMarkNotes] = useState("");
  const [markCheckIn, setMarkCheckIn] = useState("09:30");
  const [markCheckOut, setMarkCheckOut] = useState("18:00");

  // Edit modal
  const [editState, setEditState] = useState<EditState | null>(null);
  const [editSaving, setEditSaving] = useState(false);

  const employeeName = useCallback(
    (id: string) => {
      const e = employees.find((x) => x.id === id);
      return e?.full_name || e?.email || id.slice(0, 8);
    },
    [employees]
  );

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await listEmployeeAttendance({
        employeeId: filterEmployee !== "all" ? filterEmployee : undefined,
        fromDate: fromDate || undefined,
        toDate: toDate || undefined,
        status: filterStatus,
      });
      setRows(data);
    } catch (e: any) {
      toast.error(e?.message || "Failed to load attendance");
    } finally {
      setLoading(false);
    }
  }, [filterEmployee, filterStatus, fromDate, toDate]);

  useEffect(() => {
    if (isActive) void load();
  }, [isActive, load]);

  useEffect(() => {
    if (!markEmployee && employees.length) setMarkEmployee(employees[0].id);
  }, [employees, markEmployee]);

  // ── Mark new ──────────────────────────────────────────────────────────────
  const handleMark = async () => {
    if (!markEmployee || !markDate) {
      toast.error("Select employee and date");
      return;
    }
    const checkIn = combineDateAndTime(markDate, markCheckIn);
    const checkOut = combineDateAndTime(markDate, markCheckOut);
    if (checkIn && checkOut && new Date(checkOut) <= new Date(checkIn)) {
      toast.error("Check-out time cannot be earlier than or equal to check-in time.");
      return;
    }
    setSaving(true);
    try {
      await upsertEmployeeAttendance({
        employeeId: markEmployee,
        attendanceDate: markDate,
        status: markStatus,
        notes: markNotes,
        markedBy: currentUserId,
        checkInAt: checkIn,
        checkOutAt: checkOut,
      });
      toast.success("Attendance saved");
      setMarkNotes("");
      await load();
    } catch (e: any) {
      toast.error(e?.message || "Could not save attendance");
    } finally {
      setSaving(false);
    }
  };

  // ── Delete ────────────────────────────────────────────────────────────────
  const handleDelete = async (id: string) => {
    try {
      await deleteEmployeeAttendance(id);
      toast.success("Record removed");
      await load();
    } catch (e: any) {
      toast.error(e?.message || "Could not delete");
    }
  };

  // ── Quick Check-out (stamp current time) ─────────────────────────────────
  const [checkingOut, setCheckingOut] = useState<string | null>(null); // row id being processed

  const handleQuickCheckout = async (r: EmployeeAttendanceRow) => {
    if (!r.check_in_at) {
      toast.error("Cannot check out — no check-in recorded.");
      return;
    }
    const now = new Date();
    const checkOutIso = now.toISOString();
    if (new Date(checkOutIso) <= new Date(r.check_in_at)) {
      toast.error("Check-out time cannot be earlier than check-in time.");
      return;
    }
    setCheckingOut(r.id);
    try {
      await updateEmployeeAttendance(r.id, {
        checkOutAt: checkOutIso,
        editedBy: currentUserId,
        previousValue: {
          check_out_at: r.check_out_at,
          status: r.status,
        },
      });
      toast.success(`Check-out recorded at ${now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}.`);
      await load();
    } catch (e: any) {
      toast.error(e?.message || "Could not record check-out.");
    } finally {
      setCheckingOut(null);
    }
  };
  const openEdit = (row: EmployeeAttendanceRow) => {
    setEditState({
      row,
      date: row.attendance_date,
      checkIn: isoToTime(row.check_in_at),
      checkOut: isoToTime(row.check_out_at),
      status: row.status,
      notes: row.notes || "",
    });
  };

  // ── Save Edit ──────────────────────────────────────────────────────────────
  const handleEditSave = async () => {
    if (!editState) return;

    // Validation
    if (!editState.date) {
      toast.error("Attendance date is required.");
      return;
    }

    const newCheckIn = combineDateAndTime(editState.date, editState.checkIn);
    const newCheckOut = combineDateAndTime(editState.date, editState.checkOut);

    if (newCheckIn && newCheckOut && new Date(newCheckOut) <= new Date(newCheckIn)) {
      toast.error("Check-out time cannot be earlier than or equal to check-in time.");
      return;
    }

    // Build audit snapshot of previous values
    const previousValue: Record<string, unknown> = {
      attendance_date: editState.row.attendance_date,
      status: editState.row.status,
      check_in_at: editState.row.check_in_at,
      check_out_at: editState.row.check_out_at,
      notes: editState.row.notes,
    };

    setEditSaving(true);
    try {
      await updateEmployeeAttendance(editState.row.id, {
        attendanceDate: editState.date,
        status: editState.status,
        notes: editState.notes,
        checkInAt: newCheckIn,
        checkOutAt: newCheckOut,
        editedBy: currentUserId,
        previousValue,
      });
      toast.success("Attendance updated successfully.");
      setEditState(null);
      await load();
    } catch (e: any) {
      toast.error(e?.message || "Could not update attendance");
    } finally {
      setEditSaving(false);
    }
  };

  // ── Derived working hours for edit preview ────────────────────────────────
  const editPreviewHours = useMemo(() => {
    if (!editState) return null;
    const ci = combineDateAndTime(editState.date, editState.checkIn);
    const co = combineDateAndTime(editState.date, editState.checkOut);
    return calcWorkingHours(ci, co);
  }, [editState]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold flex items-center gap-2">
          <CalendarDays className="size-6 text-primary" /> Employee Attendance
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          Mark, edit and manage attendance for staff and sub-admin employees.
        </p>
      </div>

      {/* ── Mark New Attendance ── */}
      <Card className="p-6 border-none shadow-elegant space-y-4">
        <h3 className="font-bold text-slate-800 flex items-center gap-2">
          <Plus className="size-4" /> Mark Attendance
        </h3>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <div className="space-y-2">
            <Label>Employee</Label>
            <Select value={markEmployee} onValueChange={setMarkEmployee}>
              <SelectTrigger>
                <SelectValue placeholder="Select employee" />
              </SelectTrigger>
              <SelectContent>
                {employees.map((e) => (
                  <SelectItem key={e.id} value={e.id}>
                    {e.full_name || e.email}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Date</Label>
            <Input type="date" value={markDate} onChange={(e) => setMarkDate(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Status</Label>
            <Select value={markStatus} onValueChange={(v) => setMarkStatus(v as EmployeeAttendanceStatus)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(ATTENDANCE_STATUS_LABELS) as EmployeeAttendanceStatus[]).map((s) => (
                  <SelectItem key={s} value={s}>{ATTENDANCE_STATUS_LABELS[s]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Check-in Time</Label>
            <Input type="time" value={markCheckIn} onChange={(e) => setMarkCheckIn(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Check-out Time</Label>
            <Input type="time" value={markCheckOut} onChange={(e) => setMarkCheckOut(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Notes</Label>
            <Textarea
              rows={1}
              value={markNotes}
              onChange={(e) => setMarkNotes(e.target.value)}
              placeholder="Optional"
            />
          </div>
        </div>
        <Button onClick={handleMark} disabled={saving || !employees.length} className="font-bold">
          {saving && <Loader2 className="size-4 animate-spin mr-2" />}
          Save Attendance
        </Button>
        {!employees.length && (
          <p className="text-sm text-muted-foreground">No staff employees found in admin_staff.</p>
        )}
      </Card>

      {/* ── Attendance Records Table ── */}
      <Card className="p-6 border-none shadow-elegant space-y-4">
        <h3 className="font-bold text-slate-800">Attendance Records</h3>

        {/* Filters */}
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-2 min-w-[180px]">
            <Label>Filter Employee</Label>
            <Select value={filterEmployee} onValueChange={setFilterEmployee}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All employees</SelectItem>
                {employees.map((e) => (
                  <SelectItem key={e.id} value={e.id}>{e.full_name || e.email}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>From</Label>
            <Input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>To</Label>
            <Input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} />
          </div>
          <div className="space-y-2 min-w-[140px]">
            <Label>Status</Label>
            <Select value={filterStatus} onValueChange={(v) => setFilterStatus(v as EmployeeAttendanceStatus | "all")}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                {(Object.keys(ATTENDANCE_STATUS_LABELS) as EmployeeAttendanceStatus[]).map((s) => (
                  <SelectItem key={s} value={s}>{ATTENDANCE_STATUS_LABELS[s]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button variant="outline" onClick={() => void load()} disabled={loading}>
            {loading ? <Loader2 className="size-4 animate-spin" /> : "Refresh"}
          </Button>
        </div>

        {/* Table */}
        <div className="rounded-xl border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Employee</TableHead>
                <TableHead>Check-in</TableHead>
                <TableHead>Check-out</TableHead>
                <TableHead>Working Hrs</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Notes</TableHead>
                <TableHead className="w-24 text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading && (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                    <Loader2 className="size-5 animate-spin inline mr-2" /> Loading…
                  </TableCell>
                </TableRow>
              )}
              {!loading && rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                    No attendance records found.
                  </TableCell>
                </TableRow>
              )}
              {!loading &&
                rows.map((r) => (
                  <TableRow key={r.id} className="hover:bg-slate-50 transition-colors">
                    <TableCell className="font-medium">{r.attendance_date}</TableCell>
                    <TableCell>{employeeName(r.employee_id)}</TableCell>
                    <TableCell>{formatAttendanceTime(r.check_in_at)}</TableCell>
                    <TableCell>{formatAttendanceTime(r.check_out_at)}</TableCell>
                    <TableCell className="text-slate-600">
                      {formatHours(calcWorkingHours(r.check_in_at, r.check_out_at))}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={STATUS_BADGE_CLS[r.status]}>
                        {ATTENDANCE_STATUS_LABELS[r.status]}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground max-w-xs truncate">
                      {r.notes || "—"}
                    </TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-1">
                        {/* ── Quick Check-out button (shown only when not yet checked out) ── */}
                        {!r.check_out_at && (
                          <Button
                            size="icon"
                            variant="ghost"
                            className="text-emerald-600 hover:bg-emerald-50"
                            title="Record Check-out now"
                            disabled={checkingOut === r.id}
                            onClick={() => void handleQuickCheckout(r)}
                          >
                            {checkingOut === r.id ? (
                              <Loader2 className="size-4 animate-spin" />
                            ) : (
                              <LogOut className="size-4" />
                            )}
                          </Button>
                        )}
                        <Button
                          size="icon"
                          variant="ghost"
                          className="text-blue-500 hover:bg-blue-50"
                          title="Edit"
                          onClick={() => openEdit(r)}
                        >
                          <Edit2 className="size-4" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="text-red-500 hover:bg-red-50"
                          title="Delete"
                          onClick={() => void handleDelete(r.id)}
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
            </TableBody>
          </Table>
        </div>
      </Card>

      {/* ─────────── EDIT MODAL ─────────── */}
      <Dialog open={!!editState} onOpenChange={(open) => { if (!open) setEditState(null); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Edit2 className="size-4 text-primary" /> Edit Attendance Record
            </DialogTitle>
            <DialogDescription>
              Update the attendance record for{" "}
              <strong>{editState ? employeeName(editState.row.employee_id) : ""}</strong>.
              All changes are logged with your name and timestamp.
            </DialogDescription>
          </DialogHeader>

          {editState && (
            <div className="space-y-4 py-2">
              {/* Date */}
              <div className="space-y-2">
                <Label htmlFor="edit-date">Attendance Date <span className="text-red-500">*</span></Label>
                <Input
                  id="edit-date"
                  type="date"
                  value={editState.date}
                  onChange={(e) => setEditState((s) => s && { ...s, date: e.target.value })}
                />
              </div>

              {/* Status */}
              <div className="space-y-2">
                <Label htmlFor="edit-status">Status <span className="text-red-500">*</span></Label>
                <Select
                  value={editState.status}
                  onValueChange={(v) =>
                    setEditState((s) => s && { ...s, status: v as EmployeeAttendanceStatus })
                  }
                >
                  <SelectTrigger id="edit-status">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.keys(ATTENDANCE_STATUS_LABELS) as EmployeeAttendanceStatus[]).map((s) => (
                      <SelectItem key={s} value={s}>{ATTENDANCE_STATUS_LABELS[s]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Check-in / Check-out */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="edit-checkin">Check-in Time</Label>
                  <Input
                    id="edit-checkin"
                    type="time"
                    value={editState.checkIn}
                    onChange={(e) => setEditState((s) => s && { ...s, checkIn: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-checkout">Check-out Time</Label>
                  <Input
                    id="edit-checkout"
                    type="time"
                    value={editState.checkOut}
                    onChange={(e) => setEditState((s) => s && { ...s, checkOut: e.target.value })}
                  />
                </div>
              </div>

              {/* Auto-calculated working hours preview */}
              {editPreviewHours !== null && (
                <div className="flex items-center gap-2 rounded-lg bg-primary/5 border border-primary/10 px-4 py-2.5 text-sm">
                  <Clock className="size-4 text-primary shrink-0" />
                  <span className="text-slate-600">
                    Working hours: <strong className="text-slate-900">{formatHours(editPreviewHours)}</strong>
                    {editPreviewHours > 9 && (
                      <Badge variant="outline" className="ml-2 text-purple-700 border-purple-200 bg-purple-50">
                        Overtime
                      </Badge>
                    )}
                  </span>
                </div>
              )}

              {/* Notes */}
              <div className="space-y-2">
                <Label htmlFor="edit-notes">Remarks / Notes</Label>
                <Textarea
                  id="edit-notes"
                  rows={3}
                  value={editState.notes}
                  onChange={(e) => setEditState((s) => s && { ...s, notes: e.target.value })}
                  placeholder="Optional notes or reason for edit…"
                />
              </div>

              {/* Audit info */}
              <p className="text-xs text-muted-foreground bg-slate-50 border rounded-lg px-3 py-2">
                <strong>Audit Log:</strong> This edit will be recorded with your user ID, the current
                timestamp, and the previous values for full traceability.
              </p>
            </div>
          )}

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setEditState(null)} disabled={editSaving}>
              <X className="size-4 mr-1" /> Cancel
            </Button>
            <Button onClick={handleEditSave} disabled={editSaving} className="font-bold">
              {editSaving ? (
                <Loader2 className="size-4 animate-spin mr-2" />
              ) : (
                <Save className="size-4 mr-2" />
              )}
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
