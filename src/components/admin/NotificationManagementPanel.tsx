import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Bell, Eye, Loader2, Pencil, RefreshCw, Send, Trash2, Users } from "lucide-react";
import { ClassTargetFilters, emptyClassTargetFilters, filtersToTargetArrays, collegesForUniversityNames, pruneCollegesForUniversities } from "@/lib/classLinkTargeting";
import { InternshipModeFilterSelect } from "@/components/admin/InternshipModeFilterSelect";
import { MultiSelectCheckboxGroup } from "@/components/admin/MultiSelectCheckboxGroup";
import {
  NotificationRow,
  countNotificationTargets,
  deleteNotification,
  describeNotificationTargets,
  notificationTargetSummaryShort,
  fetchAdminNotifications,
  formatNotificationError,
  publishNotification,
  publishNotificationDraft,
  updateNotificationDraft,
} from "@/lib/notificationApi";

type Props = {
  notifications?: NotificationRow[];
  unis: { id: string; name: string }[];
  colleges: { id: string; name: string; university_id: string }[];
  domains: { id: string; name: string }[];
  studentsForTargeting: {
    university_name?: string | null;
    college_name?: string | null;
    internship_domain?: string | null;
    course?: string | null;
  }[];
  currentUserId?: string;
  onRefresh: () => void | Promise<void>;
  /** When true, reload history (e.g. admin opened Notifications tab). */
  isActive?: boolean;
};

const emptyFilters = emptyClassTargetFilters();

export function NotificationManagementPanel({
  notifications: notificationsProp = [],
  unis,
  colleges,
  domains,
  currentUserId,
  onRefresh,
  isActive = true,
}: Props) {
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [filters, setFilters] = useState<ClassTargetFilters>(emptyFilters);
  const [audienceMode, setAudienceMode] = useState<"filtered" | "specific">("filtered");
  const [specificStudentId, setSpecificStudentId] = useState("");
  const [saving, setSaving] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [editDraft, setEditDraft] = useState<NotificationRow | null>(null);
  const [history, setHistory] = useState<NotificationRow[]>(notificationsProp);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [audienceOpen, setAudienceOpen] = useState(false);
  const [audienceView, setAudienceView] = useState<
    | { kind: "history"; row: NotificationRow }
    | { kind: "compose" }
    | null
  >(null);

  const [recipientCountN, setRecipientCountN] = useState(0);

  const openAudienceForRow = (row: NotificationRow) => {
    setAudienceView({ kind: "history", row });
    setAudienceOpen(true);
  };

  const openAudienceForCompose = () => {
    setAudienceView({ kind: "compose" });
    setAudienceOpen(true);
  };

  const composeAsNotificationRow = (): NotificationRow => {
    if (audienceMode === "specific") {
      return {
        target_type: "specific",
        target_user_id: specificStudentId || null,
      };
    }
    const arrays = filtersToTargetArrays(filters);
    const isAll =
      filters.universities.length === 0 &&
      filters.colleges.length === 0 &&
      filters.domain === "all" &&
      filters.mode === "all";
    return {
      target_type: isAll ? "all" : "filtered",
      target_universities: arrays.target_universities,
      target_colleges: arrays.target_colleges,
      target_domains: arrays.target_domains,
      target_modes: arrays.target_modes,
    };
  };

  const renderAudienceBody = (row: NotificationRow, matched: number) => (
    <div className="space-y-4 pr-3">
      <div className="flex items-center gap-2 rounded-lg bg-primary/5 border border-primary/10 p-3 text-sm shrink-0">
        <Users className="size-4 text-primary shrink-0" />
        <span>
          <span className="font-bold text-slate-900">{matched}</span> student
          {matched === 1 ? "" : "s"} will receive this notification
        </span>
      </div>
      {row.target_type === "specific" ? (
        <div className="rounded-lg border p-3 text-sm">
          <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-2">
            Specific student
          </p>
          <p className="font-mono text-xs break-all">{row.target_user_id || specificStudentId || "—"}</p>
        </div>
      ) : null}
      {row.target_universities?.length ? (
        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-2">
            Universities
          </p>
          <ul className="space-y-1.5 text-sm">
            {row.target_universities.map((u) => (
              <li key={u} className="rounded-md border bg-muted/20 px-3 py-2 leading-snug">
                {u}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {row.target_colleges?.length ? (
        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-2">
            Colleges
          </p>
          <ul className="space-y-1.5 text-sm">
            {row.target_colleges.map((c) => (
              <li key={c} className="rounded-md border bg-muted/20 px-3 py-2 leading-snug">
                {c}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {row.target_domains?.length ? (
        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-2">
            Internship domains
          </p>
          <ul className="space-y-1.5 text-sm">
            {row.target_domains.map((d) => (
              <li key={d} className="rounded-md border bg-muted/20 px-3 py-2 leading-snug">
                {d}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {row.target_modes?.length ? (
        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-2">
            Internship modes
          </p>
          <ul className="space-y-1.5 text-sm">
            {row.target_modes.map((m) => (
              <li key={m} className="rounded-md border bg-muted/20 px-3 py-2 leading-snug">
                {m}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {(row.target_type === "all" ||
        (row.target_type !== "specific" &&
          !row.target_universities?.length &&
          !row.target_colleges?.length &&
          !row.target_domains?.length &&
          !row.target_modes?.length)) &&
      row.target_type !== "specific" ? (
        <p className="text-sm text-muted-foreground rounded-lg border border-dashed p-4 text-center">
          All enrolled students (no filters).
        </p>
      ) : null}
      <p className="text-xs text-muted-foreground border-t pt-3 leading-relaxed">
        {describeNotificationTargets(row)}
      </p>
    </div>
  );

  const audienceModalRow =
    audienceView?.kind === "history"
      ? audienceView.row
      : audienceView?.kind === "compose"
        ? composeAsNotificationRow()
        : null;

  const audienceModalCount =
    audienceView?.kind === "history"
      ? audienceView.row.recipient_count ?? 0
      : recipientCountN;

  const loadHistory = async () => {
    setHistoryLoading(true);
    try {
      const rows = await fetchAdminNotifications(supabase, 100);
      setHistory(rows);
    } catch (e: unknown) {
      console.error("Notification history load:", e);
      if (notificationsProp.length) setHistory(notificationsProp);
    } finally {
      setHistoryLoading(false);
    }
  };

  useEffect(() => {
    if (isActive) void loadHistory();
  }, [isActive]);

  useEffect(() => {
    if (notificationsProp.length > 0 && history.length === 0) {
      setHistory(notificationsProp);
    }
  }, [notificationsProp, history.length]);

  const refreshAll = async () => {
    await loadHistory();
    await onRefresh();
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (audienceMode === "specific") {
          if (!specificStudentId.trim()) {
            if (!cancelled) setRecipientCountN(0);
            return;
          }
          const { data } = await supabase
            .from("students")
            .select("id")
            .or(`registration_id.eq.${specificStudentId},id.eq.${specificStudentId}`)
            .maybeSingle();
          if (!cancelled) setRecipientCountN(data ? 1 : 0);
          return;
        }
        const n = await countNotificationTargets(supabase, filters);
        if (!cancelled) setRecipientCountN(n);
      } catch {
        if (!cancelled) setRecipientCountN(0);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [filters, audienceMode, specificStudentId]);

  const sortedHistory = useMemo(
    () =>
      [...history].sort(
        (a, b) =>
          new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime()
      ),
    [history]
  );

  const resolveSpecificUserId = async (): Promise<string | null> => {
    if (audienceMode !== "specific") return null;
    const q = specificStudentId.trim();
    if (!q) return null;
    const { data } = await supabase
      .from("students")
      .select("id")
      .or(`registration_id.eq.${q},id.eq.${q}`)
      .maybeSingle();
    return data?.id ?? null;
  };

  const validate = () => {
    if (!title.trim()) return "Notification title is required.";
    if (!message.trim()) return "Notification message is required.";
    if (audienceMode === "specific" && !specificStudentId.trim()) {
      return "Enter a student registration ID or UUID.";
    }
    if (recipientCountN === 0) return "No students match the selected audience.";
    return null;
  };

  const send = async (asDraft: boolean) => {
    const err = validate();
    if (err) return toast.error(err);
    setSaving(true);
    try {
      const specificUserId = await resolveSpecificUserId();
      if (audienceMode === "specific" && !specificUserId) {
        throw new Error("Student not found with this ID or registration ID");
      }
      await publishNotification(supabase, {
        title,
        message,
        filters: audienceMode === "specific" ? emptyFilters : filters,
        createdBy: currentUserId,
        status: asDraft ? "draft" : "published",
        specificUserId,
      });
      toast.success(asDraft ? "Draft saved." : `Notification sent to ${recipientCountN} student(s).`);
      setTitle("");
      setMessage("");
      setFilters(emptyFilters);
      setSpecificStudentId("");
      setPreviewOpen(false);
      setEditDraft(null);
      await refreshAll();
    } catch (e: unknown) {
      toast.error(formatNotificationError(e));
    } finally {
      setSaving(false);
    }
  };

  const handlePublishDraft = async (n: NotificationRow) => {
    if (!n.id) return;
    setSaving(true);
    try {
      const sent = await publishNotificationDraft(supabase, n.id);
      toast.success(`Draft published to ${sent} student(s).`);
      await refreshAll();
    } catch (e: unknown) {
      toast.error(formatNotificationError(e));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (n: NotificationRow) => {
    if (!n.id || !confirm(`Delete notification "${n.title}"?`)) return;
    setSaving(true);
    try {
      await deleteNotification(supabase, n.id);
      toast.success("Notification deleted.");
      await refreshAll();
    } catch (e: unknown) {
      toast.error(formatNotificationError(e));
    } finally {
      setSaving(false);
    }
  };

  const handleUpdateDraft = async () => {
    if (!editDraft?.id) return;
    const err = validate();
    if (err) return toast.error(err);
    setSaving(true);
    try {
      const specificUserId = await resolveSpecificUserId();
      await updateNotificationDraft(supabase, editDraft.id, {
        title,
        message,
        filters: audienceMode === "specific" ? emptyFilters : filters,
        specificUserId,
      });
      toast.success("Draft updated.");
      setEditDraft(null);
      await refreshAll();
    } catch (e: unknown) {
      toast.error(formatNotificationError(e));
    } finally {
      setSaving(false);
    }
  };

  const loadDraftIntoForm = (n: NotificationRow) => {
    setEditDraft(n);
    setTitle(n.title || "");
    setMessage(n.message || "");
    if (n.target_type === "specific") {
      setAudienceMode("specific");
      setSpecificStudentId(n.target_user_id || "");
      setFilters(emptyFilters);
    } else {
      setAudienceMode("filtered");
      setSpecificStudentId("");
      setFilters({
        universities: n.target_universities ?? [],
        colleges: n.target_colleges ?? [],
        domain: n.target_domains?.[0] || "all",
        mode: n.target_modes?.[0] || "all",
      });
    }
  };

  const renderFilters = () => {
    const filteredColleges = collegesForUniversityNames(colleges, unis, filters.universities);

    return (
      <>
        <MultiSelectCheckboxGroup
          label="University"
          options={unis}
          selectedValues={filters.universities}
          onChange={(newUnis) => {
            setFilters({
              ...filters,
              universities: newUnis,
              colleges: pruneCollegesForUniversities(colleges, unis, newUnis, filters.colleges),
            });
          }}
        />
        <MultiSelectCheckboxGroup
          label="College"
          options={filteredColleges}
          selectedValues={filters.colleges}
          onChange={(newColleges) => setFilters({ ...filters, colleges: newColleges })}
        />
        <div className="space-y-2">
          <Label>Internship Domain</Label>
          <Select value={filters.domain} onValueChange={(v) => setFilters({ ...filters, domain: v })}>
            <SelectTrigger><SelectValue placeholder="All Domains" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Domains</SelectItem>
              {domains.map((d) => (
                <SelectItem key={d.id} value={d.name}>{d.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Internship Mode</Label>
          <InternshipModeFilterSelect
            value={filters.mode}
            onValueChange={(v) => setFilters({ ...filters, mode: v })}
          />
        </div>
      </>
    );
  };

  return (
    <div className="grid lg:grid-cols-3 gap-6">
      <div className="lg:col-span-1">
        <Card className="p-6 border-none shadow-elegant">
          <h3 className="text-lg font-bold mb-1 flex items-center gap-2">
            <Bell className="size-5 text-primary" /> Notification Management
          </h3>
          <p className="text-xs text-muted-foreground mb-4">
            Filter by university, college, domain, and mode. Matched students receive the notification on their dashboard.
          </p>

          <div className="rounded-xl bg-primary/5 border border-primary/10 p-4 mb-4 flex items-center gap-3">
            <Users className="size-5 text-primary shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-[10px] font-black uppercase tracking-widest text-primary">Recipients</p>
              <p className="text-2xl font-black text-slate-900">{recipientCountN}</p>
              <p className="text-[11px] text-muted-foreground">students will receive this notification</p>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="shrink-0 text-xs h-8"
              onClick={openAudienceForCompose}
            >
              View audience
            </Button>
          </div>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Audience</Label>
              <Select
                value={audienceMode}
                onValueChange={(v) => setAudienceMode(v as "filtered" | "specific")}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="filtered">Filter by university / college / domain</SelectItem>
                  <SelectItem value="specific">Specific student</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {audienceMode === "filtered" ? renderFilters() : (
              <div className="space-y-2">
                <Label>Student Reg ID or UUID</Label>
                <Input
                  value={specificStudentId}
                  onChange={(e) => setSpecificStudentId(e.target.value)}
                  placeholder="e.g. API-..."
                />
              </div>
            )}

            <div className="space-y-2">
              <Label>Notification Title</Label>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Important schedule update"
              />
            </div>

            <div className="space-y-2">
              <Label>Message</Label>
              <Textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Write your message for students..."
                className="min-h-[100px]"
              />
            </div>

            <Button
              className="w-full gap-2"
              onClick={() => {
                const err = validate();
                if (err) return toast.error(err);
                setPreviewOpen(true);
              }}
            >
              <Eye className="size-4" /> Preview & Send
            </Button>
            <Button
              variant="outline"
              className="w-full"
              disabled={saving}
              onClick={() => void send(true)}
            >
              Save as draft
            </Button>
            {editDraft ? (
              <Button className="w-full" variant="secondary" disabled={saving} onClick={() => void handleUpdateDraft()}>
                Update draft
              </Button>
            ) : null}
          </div>
        </Card>
      </div>

      <div className="lg:col-span-2">
        <Card className="overflow-hidden border-none shadow-elegant h-full">
          <div className="p-4 bg-muted/20 border-b flex justify-between items-center gap-2">
            <div>
              <h3 className="font-bold">Notification History</h3>
              <p className="text-xs text-muted-foreground">Sent and draft notifications</p>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="secondary">{sortedHistory.length} total</Badge>
              <Button
                variant="outline"
                size="icon"
                className="size-8"
                title="Refresh history"
                disabled={historyLoading}
                onClick={() => void loadHistory()}
              >
                <RefreshCw className={`size-4 ${historyLoading ? "animate-spin" : ""}`} />
              </Button>
            </div>
          </div>
          <ScrollArea className="h-[min(640px,70vh)] w-full">
            {historyLoading && sortedHistory.length === 0 ? (
              <div className="flex items-center justify-center gap-2 py-16 text-muted-foreground">
                <Loader2 className="size-5 animate-spin" /> Loading history…
              </div>
            ) : sortedHistory.length === 0 ? (
              <div className="text-center py-16 text-muted-foreground px-4">No notifications yet.</div>
            ) : (
              <div className="min-w-[900px]">
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead className="w-[140px]">Sent</TableHead>
                      <TableHead className="min-w-[160px]">Title</TableHead>
                      <TableHead className="min-w-[200px]">Message</TableHead>
                      <TableHead className="min-w-[140px]">Audience</TableHead>
                      <TableHead className="w-[90px]">Recipients</TableHead>
                      <TableHead className="w-[80px]">Status</TableHead>
                      <TableHead className="w-[120px] text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sortedHistory.map((n) => (
                      <TableRow key={n.id} className="align-top">
                        <TableCell className="text-xs whitespace-nowrap py-3">
                          {n.created_at
                            ? new Date(n.created_at).toLocaleString([], {
                                dateStyle: "medium",
                                timeStyle: "short",
                              })
                            : "—"}
                        </TableCell>
                        <TableCell className="py-3">
                          <div className="font-semibold text-sm line-clamp-2">{n.title}</div>
                          {n.class_id ? (
                            <Badge variant="secondary" className="text-[9px] mt-1">
                              Class link
                            </Badge>
                          ) : null}
                        </TableCell>
                        <TableCell className="py-3 text-xs text-muted-foreground max-w-[280px]">
                          <p className="line-clamp-3 whitespace-pre-wrap">{n.message}</p>
                        </TableCell>
                        <TableCell className="py-3">
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 text-[11px] font-medium max-w-[140px] truncate"
                            title="View audience targeting"
                            onClick={() => openAudienceForRow(n)}
                          >
                            {notificationTargetSummaryShort(n)}
                          </Button>
                        </TableCell>
                        <TableCell className="py-3 text-sm font-medium tabular-nums">
                          {n.recipient_count ?? "—"}
                        </TableCell>
                        <TableCell className="py-3">
                          <Badge variant={n.status === "draft" ? "outline" : "default"} className="text-[10px]">
                            {n.status === "draft" ? "Draft" : "Sent"}
                          </Badge>
                        </TableCell>
                        <TableCell className="py-3 text-right">
                          <div className="flex justify-end gap-1 flex-wrap">
                            {n.status === "draft" ? (
                              <>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-7 px-2"
                                  onClick={() => loadDraftIntoForm(n)}
                                >
                                  <Pencil className="size-3.5" />
                                </Button>
                                <Button
                                  size="sm"
                                  className="h-7 px-2"
                                  disabled={saving}
                                  onClick={() => void handlePublishDraft(n)}
                                >
                                  <Send className="size-3.5" />
                                </Button>
                              </>
                            ) : null}
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 px-2 text-destructive"
                              disabled={saving}
                              onClick={() => void handleDelete(n)}
                            >
                              <Trash2 className="size-3.5" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
            {sortedHistory.length > 0 ? <ScrollBar orientation="horizontal" /> : null}
          </ScrollArea>
        </Card>
      </div>

      <Dialog
        open={audienceOpen}
        onOpenChange={(open) => {
          setAudienceOpen(open);
          if (!open) setAudienceView(null);
        }}
      >
        <DialogContent className="sm:max-w-md max-h-[85vh] flex flex-col p-0 gap-0 overflow-hidden">
          {audienceModalRow ? (
            <>
              <DialogHeader className="px-6 pt-6 pb-3 shrink-0 border-b bg-muted/20">
                <DialogTitle className="text-base leading-snug">
                  {audienceView?.kind === "history"
                    ? `Audience — ${audienceView.row.title || "Notification"}`
                    : "Audience — current selection"}
                </DialogTitle>
                <DialogDescription>
                  {audienceModalCount} matching student
                  {audienceModalCount === 1 ? "" : "s"} · scroll for full targeting lists
                </DialogDescription>
              </DialogHeader>
              <ScrollArea className="flex-1 w-full min-h-0 max-h-[min(58vh,420px)]">
                <div className="px-6 py-4">
                  {renderAudienceBody(audienceModalRow, audienceModalCount)}
                </div>
              </ScrollArea>
              <Separator />
              <DialogFooter className="px-6 py-4 shrink-0">
                <Button variant="outline" onClick={() => setAudienceOpen(false)}>
                  Close
                </Button>
              </DialogFooter>
            </>
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] flex flex-col overflow-hidden">
          <DialogHeader className="shrink-0">
            <DialogTitle>Preview notification</DialogTitle>
            <DialogDescription>
              This will be delivered to {recipientCountN} student{recipientCountN === 1 ? "" : "s"}.
            </DialogDescription>
          </DialogHeader>
          <ScrollArea className="flex-1 max-h-[50vh] pr-4">
            <div className="space-y-3 text-sm pb-2">
              <div><span className="font-bold">Title:</span> {title}</div>
              <div className="whitespace-pre-wrap"><span className="font-bold">Message:</span> {message}</div>
              <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                <span>
                  <span className="font-bold">Audience:</span>{" "}
                  {notificationTargetSummaryShort(composeAsNotificationRow())}
                </span>
                <Button variant="outline" size="sm" className="w-fit gap-1.5" onClick={openAudienceForCompose}>
                  <Users className="size-3.5" /> View full audience
                </Button>
              </div>
            </div>
          </ScrollArea>
          <DialogFooter className="shrink-0">
            <Button variant="outline" onClick={() => setPreviewOpen(false)}>Back</Button>
            <Button disabled={saving} onClick={() => void send(false)}>
              {saving ? <Loader2 className="size-4 animate-spin mr-2" /> : <Send className="size-4 mr-2" />}
              Send notification
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
