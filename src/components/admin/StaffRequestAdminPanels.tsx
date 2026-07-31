import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, Loader2, Search, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
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
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  LEAVE_TYPE_LABELS,
  listAllLeaveRequests,
  reviewLeaveRequest,
  type RequestStatus,
  type StaffLeaveRequest,
} from "@/lib/staffLeaveApi";
import {
  listAllRequirementRequests,
  REQUIREMENT_CATEGORY_LABELS,
  reviewRequirementRequest,
  type RequirementCategory,
  type StaffRequirementRequest,
} from "@/lib/staffRequirementsApi";

export type StaffNameOption = {
  id: string;
  email: string;
  full_name?: string | null;
};

function statusBadge(status: string) {
  if (status === "approved")
    return <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100">Approved</Badge>;
  if (status === "rejected")
    return <Badge className="bg-rose-100 text-rose-800 hover:bg-rose-100">Rejected</Badge>;
  return <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100">Pending</Badge>;
}

type CommonProps = {
  employees: StaffNameOption[];
  currentUserId: string | null;
  isActive?: boolean;
};

function staffLabel(employees: StaffNameOption[], id: string) {
  const e = employees.find((x) => x.id === id);
  return e?.full_name || e?.email || id.slice(0, 8);
}

export function AdminStaffLeaveRequestsPanel({
  employees,
  currentUserId,
  isActive = true,
}: CommonProps) {
  const [rows, setRows] = useState<StaffLeaveRequest[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<RequestStatus | "all">("all");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [staffFilter, setStaffFilter] = useState("all");
  const [reviewRow, setReviewRow] = useState<StaffLeaveRequest | null>(null);
  const [reviewAction, setReviewAction] = useState<"approved" | "rejected">("approved");
  const [remarks, setRemarks] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows(
        await listAllLeaveRequests(supabase, {
          staffId: staffFilter !== "all" ? staffFilter : undefined,
          status,
          fromDate: fromDate || undefined,
          toDate: toDate || undefined,
        })
      );
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to load leave requests.");
    } finally {
      setLoading(false);
    }
  }, [staffFilter, status, fromDate, toDate]);

  useEffect(() => {
    if (isActive) void load();
  }, [isActive, load]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => {
      const name = staffLabel(employees, r.staff_id).toLowerCase();
      return (
        name.includes(q) ||
        r.reason.toLowerCase().includes(q) ||
        LEAVE_TYPE_LABELS[r.leave_type].toLowerCase().includes(q)
      );
    });
  }, [rows, search, employees]);

  const openReview = (row: StaffLeaveRequest, action: "approved" | "rejected") => {
    setReviewRow(row);
    setReviewAction(action);
    setRemarks(row.admin_remarks || "");
  };

  const saveReview = async () => {
    if (!reviewRow || !currentUserId) return;
    setSaving(true);
    try {
      await reviewLeaveRequest(supabase, reviewRow.id, {
        status: reviewAction,
        adminRemarks: remarks,
        reviewedBy: currentUserId,
      });
      toast.success(`Leave request ${reviewAction}.`);
      setReviewRow(null);
      await load();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Update failed.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-lg font-bold">Leave Requests</h3>
        <p className="text-sm text-muted-foreground">
          Search, filter, approve or reject staff leave with remarks.
        </p>
      </div>

      <Card className="border-none p-4 shadow-elegant">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <div className="relative lg:col-span-2">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
            <Input
              className="pl-9"
              placeholder="Search staff, reason…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <Select value={staffFilter} onValueChange={setStaffFilter}>
            <SelectTrigger>
              <SelectValue placeholder="Staff" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All staff</SelectItem>
              {employees.map((e) => (
                <SelectItem key={e.id} value={e.id}>
                  {e.full_name || e.email}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={status} onValueChange={(v) => setStatus(v as RequestStatus | "all")}>
            <SelectTrigger>
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="approved">Approved</SelectItem>
              <SelectItem value="rejected">Rejected</SelectItem>
            </SelectContent>
          </Select>
          <div className="grid grid-cols-2 gap-2 lg:col-span-1 sm:col-span-2 lg:grid-cols-1">
            <Input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} title="From" />
            <Input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} title="To" />
          </div>
        </div>
      </Card>

      <Card className="border-none shadow-elegant overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Staff</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Dates</TableHead>
              <TableHead>Reason</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Remarks</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={7} className="py-10 text-center">
                  <Loader2 className="inline size-5 animate-spin" />
                </TableCell>
              </TableRow>
            ) : filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="py-10 text-center text-muted-foreground">
                  No leave requests found.
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-medium">{staffLabel(employees, r.staff_id)}</TableCell>
                  <TableCell>{LEAVE_TYPE_LABELS[r.leave_type]}</TableCell>
                  <TableCell className="whitespace-nowrap text-sm">
                    {r.from_date} → {r.to_date}
                  </TableCell>
                  <TableCell className="max-w-[12rem] text-sm">
                    <span className="line-clamp-2">{r.reason}</span>
                    {r.attachment_url ? (
                      <a
                        href={r.attachment_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-1 block text-xs text-primary hover:underline"
                      >
                        Attachment
                      </a>
                    ) : null}
                  </TableCell>
                  <TableCell>
                    {statusBadge(r.status)}
                    {r.reviewed_at ? (
                      <div className="mt-1 text-[10px] text-muted-foreground">
                        {new Date(r.reviewed_at).toLocaleString()}
                        {r.reviewed_by ? ` · ${staffLabel(employees, r.reviewed_by)}` : ""}
                      </div>
                    ) : null}
                  </TableCell>
                  <TableCell className="max-w-[10rem] text-sm text-muted-foreground">
                    {r.admin_remarks || "—"}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button
                        size="sm"
                        variant="outline"
                        className="gap-1 border-emerald-200 text-emerald-700 hover:bg-emerald-50"
                        disabled={r.status === "approved"}
                        onClick={() => openReview(r, "approved")}
                      >
                        <Check className="size-3.5" /> Approve
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="gap-1 border-rose-200 text-rose-700 hover:bg-rose-50"
                        disabled={r.status === "rejected"}
                        onClick={() => openReview(r, "rejected")}
                      >
                        <X className="size-3.5" /> Reject
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>

      <Dialog open={!!reviewRow} onOpenChange={(o) => !o && setReviewRow(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {reviewAction === "approved" ? "Approve" : "Reject"} leave request
            </DialogTitle>
          </DialogHeader>
          {reviewRow ? (
            <div className="space-y-3 text-sm">
              <p>
                <span className="font-semibold">{staffLabel(employees, reviewRow.staff_id)}</span>
                {" · "}
                {LEAVE_TYPE_LABELS[reviewRow.leave_type]} ({reviewRow.from_date} → {reviewRow.to_date})
              </p>
              <p className="text-muted-foreground">{reviewRow.reason}</p>
              <div className="space-y-1.5">
                <Label>Admin Remarks</Label>
                <Textarea rows={3} value={remarks} onChange={(e) => setRemarks(e.target.value)} />
              </div>
            </div>
          ) : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => setReviewRow(null)}>
              Cancel
            </Button>
            <Button disabled={saving} onClick={() => void saveReview()}>
              {saving ? <Loader2 className="size-4 animate-spin" /> : "Confirm"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export function AdminStaffRequirementsPanel({
  employees,
  currentUserId,
  isActive = true,
}: CommonProps) {
  const [rows, setRows] = useState<StaffRequirementRequest[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<RequestStatus | "all">("all");
  const [category, setCategory] = useState<RequirementCategory | "all">("all");
  const [staffFilter, setStaffFilter] = useState("all");
  const [reviewRow, setReviewRow] = useState<StaffRequirementRequest | null>(null);
  const [reviewAction, setReviewAction] = useState<"approved" | "rejected">("approved");
  const [remarks, setRemarks] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows(
        await listAllRequirementRequests(supabase, {
          staffId: staffFilter !== "all" ? staffFilter : undefined,
          status,
          category,
        })
      );
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to load requirements.");
    } finally {
      setLoading(false);
    }
  }, [staffFilter, status, category]);

  useEffect(() => {
    if (isActive) void load();
  }, [isActive, load]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => {
      const name = staffLabel(employees, r.staff_id).toLowerCase();
      return (
        name.includes(q) ||
        r.title.toLowerCase().includes(q) ||
        r.description.toLowerCase().includes(q) ||
        REQUIREMENT_CATEGORY_LABELS[r.category].toLowerCase().includes(q)
      );
    });
  }, [rows, search, employees]);

  const openReview = (row: StaffRequirementRequest, action: "approved" | "rejected") => {
    setReviewRow(row);
    setReviewAction(action);
    setRemarks(row.admin_remarks || "");
  };

  const saveReview = async () => {
    if (!reviewRow || !currentUserId) return;
    setSaving(true);
    try {
      await reviewRequirementRequest(supabase, reviewRow.id, {
        status: reviewAction,
        adminRemarks: remarks,
        reviewedBy: currentUserId,
      });
      toast.success(`Requirement ${reviewAction}.`);
      setReviewRow(null);
      await load();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Update failed.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-lg font-bold">Requirements</h3>
        <p className="text-sm text-muted-foreground">
          Review staff requirement requests, add remarks, and update status.
        </p>
      </div>

      <Card className="border-none p-4 shadow-elegant">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="relative lg:col-span-2">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
            <Input
              className="pl-9"
              placeholder="Search staff, title…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <Select value={staffFilter} onValueChange={setStaffFilter}>
            <SelectTrigger>
              <SelectValue placeholder="Staff" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All staff</SelectItem>
              {employees.map((e) => (
                <SelectItem key={e.id} value={e.id}>
                  {e.full_name || e.email}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={category}
            onValueChange={(v) => setCategory(v as RequirementCategory | "all")}
          >
            <SelectTrigger>
              <SelectValue placeholder="Category" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All categories</SelectItem>
              {(Object.keys(REQUIREMENT_CATEGORY_LABELS) as RequirementCategory[]).map((k) => (
                <SelectItem key={k} value={k}>
                  {REQUIREMENT_CATEGORY_LABELS[k]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={status} onValueChange={(v) => setStatus(v as RequestStatus | "all")}>
            <SelectTrigger>
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="approved">Approved</SelectItem>
              <SelectItem value="rejected">Rejected</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </Card>

      <Card className="border-none shadow-elegant overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Staff</TableHead>
              <TableHead>Title</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Remarks</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={6} className="py-10 text-center">
                  <Loader2 className="inline size-5 animate-spin" />
                </TableCell>
              </TableRow>
            ) : filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="py-10 text-center text-muted-foreground">
                  No requirement requests found.
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-medium">{staffLabel(employees, r.staff_id)}</TableCell>
                  <TableCell className="max-w-[14rem]">
                    <div className="font-medium">{r.title}</div>
                    <div className="line-clamp-2 text-xs text-muted-foreground">{r.description}</div>
                    {r.attachment_url ? (
                      <a
                        href={r.attachment_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-1 block text-xs text-primary hover:underline"
                      >
                        Attachment
                      </a>
                    ) : null}
                  </TableCell>
                  <TableCell>{REQUIREMENT_CATEGORY_LABELS[r.category]}</TableCell>
                  <TableCell>
                    {statusBadge(r.status)}
                    {r.reviewed_at ? (
                      <div className="mt-1 text-[10px] text-muted-foreground">
                        {new Date(r.reviewed_at).toLocaleString()}
                      </div>
                    ) : null}
                  </TableCell>
                  <TableCell className="max-w-[10rem] text-sm text-muted-foreground">
                    {r.admin_remarks || "—"}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button
                        size="sm"
                        variant="outline"
                        className="gap-1 border-emerald-200 text-emerald-700 hover:bg-emerald-50"
                        disabled={r.status === "approved"}
                        onClick={() => openReview(r, "approved")}
                      >
                        <Check className="size-3.5" /> Approve
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="gap-1 border-rose-200 text-rose-700 hover:bg-rose-50"
                        disabled={r.status === "rejected"}
                        onClick={() => openReview(r, "rejected")}
                      >
                        <X className="size-3.5" /> Reject
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>

      <Dialog open={!!reviewRow} onOpenChange={(o) => !o && setReviewRow(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {reviewAction === "approved" ? "Approve" : "Reject"} requirement
            </DialogTitle>
          </DialogHeader>
          {reviewRow ? (
            <div className="space-y-3 text-sm">
              <p>
                <span className="font-semibold">{staffLabel(employees, reviewRow.staff_id)}</span>
                {" · "}
                {reviewRow.title}
              </p>
              <p className="text-muted-foreground">{reviewRow.description}</p>
              <div className="space-y-1.5">
                <Label>Admin Remarks</Label>
                <Textarea rows={3} value={remarks} onChange={(e) => setRemarks(e.target.value)} />
              </div>
            </div>
          ) : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => setReviewRow(null)}>
              Cancel
            </Button>
            <Button disabled={saving} onClick={() => void saveReview()}>
              {saving ? <Loader2 className="size-4 animate-spin" /> : "Confirm"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
