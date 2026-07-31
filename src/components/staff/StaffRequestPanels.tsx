import { useCallback, useEffect, useState } from "react";
import {
  ClipboardList,
  FileText,
  Loader2,
  Paperclip,
  Send,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
  createLeaveRequest,
  LEAVE_TYPE_LABELS,
  listOwnLeaveRequests,
  REQUEST_STATUS_LABELS,
  type LeaveType,
  type StaffLeaveRequest,
} from "@/lib/staffLeaveApi";
import {
  createRequirementRequest,
  listOwnRequirementRequests,
  REQUIREMENT_CATEGORY_LABELS,
  type RequirementCategory,
  type StaffRequirementRequest,
} from "@/lib/staffRequirementsApi";

function statusBadge(status: string) {
  if (status === "approved") return <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100">Approved</Badge>;
  if (status === "rejected") return <Badge className="bg-rose-100 text-rose-800 hover:bg-rose-100">Rejected</Badge>;
  return <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100">Pending</Badge>;
}

type Props = {
  isActive?: boolean;
  currentUserId: string | null;
};

function LeaveTab({ isActive, currentUserId }: Props) {
  const [rows, setRows] = useState<StaffLeaveRequest[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [leaveType, setLeaveType] = useState<LeaveType>("casual");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [reason, setReason] = useState("");
  const [file, setFile] = useState<File | null>(null);

  const load = useCallback(async () => {
    if (!currentUserId) return;
    setLoading(true);
    try {
      setRows(await listOwnLeaveRequests(supabase, currentUserId));
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Could not load leave requests.");
    } finally {
      setLoading(false);
    }
  }, [currentUserId]);

  useEffect(() => {
    if (isActive) void load();
  }, [isActive, load]);

  const submit = async () => {
    if (!currentUserId) {
      toast.error("Not signed in.");
      return;
    }
    setSubmitting(true);
    try {
      await createLeaveRequest(supabase, {
        staffId: currentUserId,
        leaveType,
        fromDate,
        toDate,
        reason,
        file,
      });
      toast.success("Leave request submitted.");
      setFromDate("");
      setToDate("");
      setReason("");
      setFile(null);
      setLeaveType("casual");
      await load();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Submit failed.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <Card className="border-none p-5 shadow-elegant space-y-4">
        <h3 className="font-bold text-slate-800">Apply for Leave</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Leave Type</Label>
            <Select value={leaveType} onValueChange={(v) => setLeaveType(v as LeaveType)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(LEAVE_TYPE_LABELS) as LeaveType[]).map((k) => (
                  <SelectItem key={k} value={k}>
                    {LEAVE_TYPE_LABELS[k]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5 sm:col-span-2 grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>From Date</Label>
              <Input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>To Date</Label>
              <Input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Reason / Description</Label>
            <Textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Why do you need leave?" />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Attachment (optional)</Label>
            <Input
              type="file"
              accept=".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx"
              onChange={(e) => setFile(e.target.files?.[0] || null)}
            />
            {file ? (
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <Paperclip className="size-3" /> {file.name}
              </p>
            ) : null}
          </div>
        </div>
        <Button className="gap-2 font-bold" disabled={submitting} onClick={() => void submit()}>
          {submitting ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
          Submit Request
        </Button>
      </Card>

      <Card className="border-none shadow-elegant overflow-hidden">
        <div className="border-b px-5 py-3">
          <h3 className="font-bold text-slate-800">Leave History</h3>
          <p className="text-xs text-muted-foreground">Status, admin remarks, and past requests.</p>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Type</TableHead>
              <TableHead>From</TableHead>
              <TableHead>To</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Admin Remarks</TableHead>
              <TableHead>File</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={6} className="py-8 text-center">
                  <Loader2 className="inline size-5 animate-spin" />
                </TableCell>
              </TableRow>
            ) : rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                  No leave requests yet.
                </TableCell>
              </TableRow>
            ) : (
              rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-medium">{LEAVE_TYPE_LABELS[r.leave_type]}</TableCell>
                  <TableCell>{r.from_date}</TableCell>
                  <TableCell>{r.to_date}</TableCell>
                  <TableCell>{statusBadge(r.status)}</TableCell>
                  <TableCell className="max-w-[14rem] text-sm text-muted-foreground">
                    {r.admin_remarks || "—"}
                    {r.reviewed_at ? (
                      <span className="mt-1 block text-[10px]">
                        {REQUEST_STATUS_LABELS[r.status]} · {new Date(r.reviewed_at).toLocaleString()}
                      </span>
                    ) : null}
                  </TableCell>
                  <TableCell>
                    {r.attachment_url ? (
                      <a
                        href={r.attachment_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs font-semibold text-primary hover:underline"
                      >
                        {r.attachment_name || "View"}
                      </a>
                    ) : (
                      "—"
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}

function RequirementsTab({ isActive, currentUserId }: Props) {
  const [rows, setRows] = useState<StaffRequirementRequest[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState<RequirementCategory>("equipment");
  const [description, setDescription] = useState("");
  const [file, setFile] = useState<File | null>(null);

  const load = useCallback(async () => {
    if (!currentUserId) return;
    setLoading(true);
    try {
      setRows(await listOwnRequirementRequests(supabase, currentUserId));
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Could not load requirements.");
    } finally {
      setLoading(false);
    }
  }, [currentUserId]);

  useEffect(() => {
    if (isActive) void load();
  }, [isActive, load]);

  const submit = async () => {
    if (!currentUserId) {
      toast.error("Not signed in.");
      return;
    }
    setSubmitting(true);
    try {
      await createRequirementRequest(supabase, {
        staffId: currentUserId,
        title,
        category,
        description,
        file,
      });
      toast.success("Requirement request submitted.");
      setTitle("");
      setCategory("equipment");
      setDescription("");
      setFile(null);
      await load();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Submit failed.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <Card className="border-none p-5 shadow-elegant space-y-4">
        <h3 className="font-bold text-slate-800">Submit Requirement Request</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Requirement Title</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. New laptop charger" />
          </div>
          <div className="space-y-1.5">
            <Label>Category</Label>
            <Select value={category} onValueChange={(v) => setCategory(v as RequirementCategory)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(REQUIREMENT_CATEGORY_LABELS) as RequirementCategory[]).map((k) => (
                  <SelectItem key={k} value={k}>
                    {REQUIREMENT_CATEGORY_LABELS[k]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Description</Label>
            <Textarea rows={3} value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Attachment (optional)</Label>
            <Input
              type="file"
              accept=".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx"
              onChange={(e) => setFile(e.target.files?.[0] || null)}
            />
          </div>
        </div>
        <Button className="gap-2 font-bold" disabled={submitting} onClick={() => void submit()}>
          {submitting ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
          Submit Request
        </Button>
      </Card>

      <Card className="border-none shadow-elegant overflow-hidden">
        <div className="border-b px-5 py-3">
          <h3 className="font-bold text-slate-800">Request History</h3>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Title</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Admin Remarks</TableHead>
              <TableHead>File</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={5} className="py-8 text-center">
                  <Loader2 className="inline size-5 animate-spin" />
                </TableCell>
              </TableRow>
            ) : rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                  No requirement requests yet.
                </TableCell>
              </TableRow>
            ) : (
              rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-medium">
                    <div>{r.title}</div>
                    <div className="text-xs text-muted-foreground line-clamp-2">{r.description}</div>
                  </TableCell>
                  <TableCell>{REQUIREMENT_CATEGORY_LABELS[r.category]}</TableCell>
                  <TableCell>{statusBadge(r.status)}</TableCell>
                  <TableCell className="max-w-[14rem] text-sm text-muted-foreground">
                    {r.admin_remarks || "—"}
                    {r.reviewed_at ? (
                      <span className="mt-1 block text-[10px]">
                        {new Date(r.reviewed_at).toLocaleString()}
                      </span>
                    ) : null}
                  </TableCell>
                  <TableCell>
                    {r.attachment_url ? (
                      <a
                        href={r.attachment_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs font-semibold text-primary hover:underline"
                      >
                        {r.attachment_name || "View"}
                      </a>
                    ) : (
                      "—"
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}

export function StaffRequestsPanel({ isActive = true, currentUserId }: Props) {
  const [inner, setInner] = useState("leave");

  return (
    <div className="space-y-4">
      <div>
        <h2 className="flex items-center gap-2 text-xl font-black">
          <ClipboardList className="size-5 text-primary" /> Requests
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Apply for leave or submit workplace requirements. Track status and admin remarks here.
        </p>
      </div>

      <Tabs value={inner} onValueChange={setInner}>
        <TabsList className="bg-slate-100">
          <TabsTrigger value="leave" className="gap-1.5">
            <FileText className="size-3.5" /> Leave Request
          </TabsTrigger>
          <TabsTrigger value="requirements" className="gap-1.5">
            <ClipboardList className="size-3.5" /> Requirements
          </TabsTrigger>
        </TabsList>
        <TabsContent value="leave" className="mt-4">
          <LeaveTab isActive={isActive && inner === "leave"} currentUserId={currentUserId} />
        </TabsContent>
        <TabsContent value="requirements" className="mt-4">
          <RequirementsTab isActive={isActive && inner === "requirements"} currentUserId={currentUserId} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
