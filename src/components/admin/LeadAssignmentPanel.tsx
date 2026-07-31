import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ClipboardList,
  Download,
  Eye,
  Loader2,
  Target,
  UserCheck,
  UserMinus,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import type { SupabaseClient } from "@supabase/supabase-js";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { buildLeadHuntRows } from "@/lib/leadHunt";
import { fetchAllSupabaseRows } from "@/lib/fetchAllSupabaseRows";
import { fetchAdminStudentsLight } from "@/lib/adminStudentDirectory";
import {
  LEAD_CRM_STATUS_LABELS,
  LEAD_CRM_STATUSES,
  assignLeads,
  buildStaffLeadStats,
  crmRowToAssignmentView,
  downloadCsv,
  ensureLeadCrmRows,
  fetchAllLeadCrm,
  fetchLeadCrmAssignedToStaff,
  fetchStaffForAssignment,
  fetchStaffLeadTargets,
  filterLeadAssignmentViews,
  leadSelectionKey,
  mergeHuntWithCrm,
  summarizeAssignedCrmRows,
  syncLeadCrmConvertedFromEnrollments,
  unassignLeads,
  upsertStaffLeadTargets,
  type LeadAssignmentView,
  type StaffLeadStats,
  type StaffLeadTargets,
} from "@/lib/leadAssignment";

type Props = {
  client: SupabaseClient;
  isActive: boolean;
};

const STAFF_PAGE_SIZE = 10;
const LEADS_PAGE_SIZE = 20;
const STAFF_ASSIGNED_PAGE_SIZE = 8;

function SidePagination({
  page,
  setPage,
  total,
  pageSize,
  label,
}: {
  page: number;
  setPage: (page: number) => void;
  total: number;
  pageSize: number;
  label: string;
}) {
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(Math.max(0, page), pageCount - 1);
  const from = total === 0 ? 0 : safePage * pageSize + 1;
  const to = Math.min(total, (safePage + 1) * pageSize);

  return (
    <div className="pt-3 mt-3 border-t flex flex-col sm:flex-row items-center justify-between gap-2">
      <div className="text-[11px] text-muted-foreground font-medium">
        Showing {from}–{to} of {total} {label}
      </div>
      <div className="flex items-center gap-1.5">
        <Button
          variant="outline"
          size="sm"
          className="h-8"
          disabled={safePage === 0 || total === 0}
          onClick={() => setPage(safePage - 1)}
        >
          Previous
        </Button>
        <span className="text-[11px] font-bold text-slate-600 px-2 tabular-nums">
          {safePage + 1} / {pageCount}
        </span>
        <Button
          variant="outline"
          size="sm"
          className="h-8"
          disabled={safePage >= pageCount - 1 || total === 0}
          onClick={() => setPage(safePage + 1)}
        >
          Next
        </Button>
      </div>
    </div>
  );
}

export function LeadAssignmentPanel({ client, isActive }: Props) {
  const [loading, setLoading] = useState(false);
  const [assigning, setAssigning] = useState(false);
  const [staffStats, setStaffStats] = useState<StaffLeadStats[]>([]);
  const [leads, setLeads] = useState<LeadAssignmentView[]>([]);
  const [targets, setTargets] = useState<StaffLeadTargets[]>([]);
  const [selectedStaffIds, setSelectedStaffIds] = useState<string[]>([]);
  const [selectedLeadKeys, setSelectedLeadKeys] = useState<string[]>([]);
  const [staffPage, setStaffPage] = useState(0);
  const [leadsPage, setLeadsPage] = useState(0);
  const [search, setSearch] = useState("");
  const [college, setCollege] = useState("all");
  const [course, setCourse] = useState("all");
  const [state, setState] = useState("all");
  const [city, setCity] = useState("all");
  const [source, setSource] = useState("all");
  const [status, setStatus] = useState("all");
  const [priority, setPriority] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [targetDrafts, setTargetDrafts] = useState<
    Record<string, { daily: number; weekly: number; monthly: number }>
  >({});
  const [staffViewOpen, setStaffViewOpen] = useState(false);
  const [staffView, setStaffView] = useState<StaffLeadStats | null>(null);
  const [staffRemoveKeys, setStaffRemoveKeys] = useState<string[]>([]);
  const [removing, setRemoving] = useState(false);
  const [staffAssignedPage, setStaffAssignedPage] = useState(0);
  const [staffAssignedLeads, setStaffAssignedLeads] = useState<LeadAssignmentView[]>([]);
  const [staffAssignedLoading, setStaffAssignedLoading] = useState(false);
  const [staffNameById, setStaffNameById] = useState<Map<string, string>>(new Map());

  // ── Monitoring tab filters ────────────────────────────────────────────────
  const [monitoringFromDate, setMonitoringFromDate] = useState("");
  const [monitoringToDate, setMonitoringToDate] = useState("");
  const [monitoringStatusFilter, setMonitoringStatusFilter] = useState<string>("all");
  const [monitoringStaffFilter, setMonitoringStaffFilter] = useState<string>("all");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [staffRows, crmRows, targetRows, drafts, cancelled, payments, students] =
        await Promise.all([
          fetchStaffForAssignment(client),
          fetchAllLeadCrm(client),
          fetchStaffLeadTargets(client),
          fetchAllSupabaseRows(client, "registration_leads", {
            orderBy: "updated_at",
            ascending: false,
          }),
          fetchAllSupabaseRows(client, "payment_cancelled", {
            orderBy: "created_at",
            ascending: false,
          }),
          fetchAllSupabaseRows(client, "payment_success", {
            orderBy: "created_at",
            ascending: false,
            modify: (q) => q.eq("status", "failed"),
          }),
          // Reuse shared students-light cache instead of a separate full email dump.
          fetchAdminStudentsLight(client),
        ]);

      const enrolledEmails = new Set(
        (students || [])
          .map((s) => String((s as { email?: string | null }).email || "").trim().toLowerCase())
          .filter(Boolean)
      );

      // Backfill Converted for leads whose email is already registered / paid.
      const synced = await syncLeadCrmConvertedFromEnrollments(client);
      const crmAfterSync =
        synced > 0 ? await fetchAllLeadCrm(client) : crmRows.length > 0 ? crmRows : await fetchAllLeadCrm(client);

      const hunt = buildLeadHuntRows({
        registrationDraftLeads: (drafts || []) as any[],
        failedPayments: (payments || []) as any[],
        cancelledPayments: (cancelled || []) as any[],
        enrolledEmails,
      });

      // Do not bulk-ensure all hub leads (can be 30k+). CRM rows are created on assign.
      const crmFresh = crmAfterSync;

      const staffNameById = new Map(
        staffRows.map((s) => [s.id, s.full_name || s.email || "Staff"])
      );
      const merged = mergeHuntWithCrm(hunt, crmFresh, staffNameById);
      const nextStaffStats = buildStaffLeadStats(staffRows, crmFresh);
      setStaffNameById(staffNameById);
      setLeads(merged);
      setStaffStats(nextStaffStats);
      setTargets(targetRows);
      const draftsMap: Record<string, { daily: number; weekly: number; monthly: number }> = {};
      for (const s of staffRows) {
        const t = targetRows.find((x) => x.staff_id === s.id);
        draftsMap[s.id] = {
          daily: t?.daily_calls ?? 0,
          weekly: t?.weekly_calls ?? 0,
          monthly: t?.monthly_calls ?? 0,
        };
      }
      setTargetDrafts(draftsMap);
      return nextStaffStats;
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to load lead assignment data");
      return null;
    } finally {
      setLoading(false);
    }
  }, [client]);

  useEffect(() => {
    if (!isActive) return;
    void load();
  }, [isActive, load]);

  const filteredLeads = useMemo(
    () =>
      filterLeadAssignmentViews(leads, {
        search,
        college,
        course,
        state,
        city,
        source,
        status,
        priority,
        dateFrom,
        dateTo,
      }),
    [leads, search, college, course, state, city, source, status, priority, dateFrom, dateTo]
  );

  useEffect(() => {
    setLeadsPage(0);
  }, [search, college, course, state, city, source, status, priority, dateFrom, dateTo]);

  useEffect(() => {
    setStaffPage(0);
  }, [staffStats.length]);

  const staffPageCount = Math.max(1, Math.ceil(staffStats.length / STAFF_PAGE_SIZE));
  const staffSafePage = Math.min(staffPage, staffPageCount - 1);
  const paginatedStaff = useMemo(
    () =>
      staffStats.slice(
        staffSafePage * STAFF_PAGE_SIZE,
        (staffSafePage + 1) * STAFF_PAGE_SIZE
      ),
    [staffStats, staffSafePage]
  );

  const leadsPageCount = Math.max(1, Math.ceil(filteredLeads.length / LEADS_PAGE_SIZE));
  const leadsSafePage = Math.min(leadsPage, leadsPageCount - 1);
  const paginatedLeads = useMemo(
    () =>
      filteredLeads.slice(
        leadsSafePage * LEADS_PAGE_SIZE,
        (leadsSafePage + 1) * LEADS_PAGE_SIZE
      ),
    [filteredLeads, leadsSafePage]
  );

  const filterOptions = useMemo(() => {
    const colleges = new Set<string>();
    const courses = new Set<string>();
    const states = new Set<string>();
    const cities = new Set<string>();
    const sources = new Set<string>();
    for (const l of leads) {
      if (l.college_name && l.college_name !== "—") colleges.add(l.college_name);
      if (l.course && l.course !== "—") courses.add(l.course);
      if (l.state) states.add(l.state);
      if (l.city) cities.add(l.city);
      if (l.lead_source) sources.add(l.lead_source);
    }
    return {
      colleges: [...colleges].sort(),
      courses: [...courses].sort(),
      states: [...states].sort(),
      cities: [...cities].sort(),
      sources: [...sources].sort(),
    };
  }, [leads]);

  // ── Monitoring filtered staff stats ──────────────────────────────────────
  // Re-aggregate from `leads` (LeadAssignmentView[]) with the monitoring filters applied.
  const monitoringFilteredStaffStats = useMemo<StaffLeadStats[]>(() => {
    // Filter the assigned leads
    const filtered = leads.filter((l) => {
      if (!l.assigned_staff_id) return false; // skip unassigned
      if (monitoringStatusFilter !== "all" && l.crm_status !== monitoringStatusFilter) return false;
      if (monitoringFromDate && l.created_at < monitoringFromDate) return false;
      if (monitoringToDate && l.created_at.slice(0, 10) > monitoringToDate) return false;
      return true;
    });

    // Group by staff
    const byStaff = new Map<string, typeof filtered>();
    for (const l of filtered) {
      const sid = l.assigned_staff_id!;
      if (!byStaff.has(sid)) byStaff.set(sid, []);
      byStaff.get(sid)!.push(l);
    }

    // Build per-staff stats — only show staff who appear in results (or all if no filter)
    const hasFilter =
      monitoringStatusFilter !== "all" || monitoringFromDate || monitoringToDate;

    return staffStats
      .filter((s) => {
        if (monitoringStaffFilter !== "all" && s.staff_id !== monitoringStaffFilter) return false;
        if (hasFilter && !byStaff.has(s.staff_id)) return false;
        return true;
      })
      .map((s) => {
        if (!hasFilter) return s; // no active filter — use prebuilt stat
        const mine = byStaff.get(s.staff_id) || [];
        const assigned = mine.length;
        let pending = 0, contacted = 0, interested = 0, follow_up = 0, converted = 0, closed_out = 0;
        for (const l of mine) {
          switch (l.crm_status) {
            case "pending": case "unassigned": pending++; break;
            case "contacted": contacted++; break;
            case "interested": interested++; break;
            case "follow_up": follow_up++; break;
            case "converted": converted++; break;
            default: closed_out++; break;
          }
        }
        const completion_pct = assigned === 0 ? 0 : Math.round((converted / assigned) * 1000) / 10;
        return { ...s, assigned, pending, contacted, interested, follow_up, converted, closed_out, completion_pct };
      });
  }, [leads, staffStats, monitoringFromDate, monitoringToDate, monitoringStatusFilter, monitoringStaffFilter]);

  const selectableLeadKeys = useMemo(
    () => filteredLeads.map((l) => leadSelectionKey(l)),
    [filteredLeads]
  );

  const allFilteredSelected =
    selectableLeadKeys.length > 0 &&
    selectableLeadKeys.every((k) => selectedLeadKeys.includes(k));

  const toggleStaff = (id: string) => {
    setSelectedStaffIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const toggleLead = (row: LeadAssignmentView) => {
    const key = leadSelectionKey(row);
    setSelectedLeadKeys((prev) =>
      prev.includes(key) ? prev.filter((x) => x !== key) : [...prev, key]
    );
  };

  const toggleSelectAllLeads = () => {
    if (allFilteredSelected) {
      setSelectedLeadKeys((prev) => prev.filter((k) => !selectableLeadKeys.includes(k)));
    } else {
      setSelectedLeadKeys((prev) => [...new Set([...prev, ...selectableLeadKeys])]);
    }
  };

  const resolveSelectedCrmIds = async () => {
    const selectedRows = leads.filter((l) => selectedLeadKeys.includes(leadSelectionKey(l)));
    if (selectedRows.length === 0) return [] as string[];
    const ids = await ensureLeadCrmRows(client, selectedRows);
    if (ids.length === 0) {
      throw new Error("Could not create CRM records for selected leads");
    }
    return ids;
  };

  const handleCustomAssign = async () => {
    if (selectedStaffIds.length !== 1) {
      toast.error("Custom Assign requires exactly one staff member");
      return;
    }
    if (selectedLeadKeys.length === 0) {
      toast.error("Select at least one lead");
      return;
    }
    setAssigning(true);
    try {
      const leadCrmIds = await resolveSelectedCrmIds();
      const result = await assignLeads(client, {
        staffIds: selectedStaffIds,
        leadCrmIds,
        mode: "custom",
      });
      toast.success(`Assigned ${result.assigned} lead(s)`);
      setSelectedLeadKeys([]);
      const nextStats = await load();
      if (staffViewOpen && staffView && selectedStaffIds[0] === staffView.staff_id) {
        if (nextStats) {
          setStaffView(nextStats.find((s) => s.staff_id === staffView.staff_id) || staffView);
        }
        await loadStaffAssignedLeads(staffView.staff_id);
      }
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Assign failed");
    } finally {
      setAssigning(false);
    }
  };

  const handleAutoAssign = async () => {
    if (selectedStaffIds.length < 2) {
      toast.error("Auto Equal Distribution requires at least two staff members");
      return;
    }
    if (selectedLeadKeys.length === 0) {
      toast.error("Select at least one lead");
      return;
    }
    setAssigning(true);
    try {
      const leadCrmIds = await resolveSelectedCrmIds();
      const result = await assignLeads(client, {
        staffIds: selectedStaffIds,
        leadCrmIds,
        mode: "equal",
      });
      toast.success(`Distributed ${result.assigned} lead(s) equally`);
      setSelectedLeadKeys([]);
      const nextStats = await load();
      if (staffViewOpen && staffView) {
        if (nextStats) {
          setStaffView(nextStats.find((s) => s.staff_id === staffView.staff_id) || staffView);
        }
        await loadStaffAssignedLeads(staffView.staff_id);
      }
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Auto assign failed");
    } finally {
      setAssigning(false);
    }
  };

  const saveTargets = async (staffId: string) => {
    const d = targetDrafts[staffId] || { daily: 0, weekly: 0, monthly: 0 };
    try {
      await upsertStaffLeadTargets(client, {
        staffId,
        daily: d.daily,
        weekly: d.weekly,
        monthly: d.monthly,
      });
      toast.success("Targets saved");
      await load();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to save targets");
    }
  };

  const reportAssignment = () => {
    downloadCsv(
      `lead_assignment_${new Date().toISOString().slice(0, 10)}.csv`,
      [
        "Lead ID",
        "Name",
        "Email",
        "Phone",
        "College",
        "Course",
        "Status",
        "Priority",
        "Assigned Staff",
        "Source",
      ],
      leads.map((l) => [
        l.crm_id || l.id,
        l.full_name,
        l.email,
        l.contact_number,
        l.college_name,
        l.course,
        LEAD_CRM_STATUS_LABELS[l.crm_status],
        l.crm_priority,
        l.assigned_staff_name || "",
        l.lead_source || "",
      ])
    );
  };

  const reportPerformance = () => {
    downloadCsv(
      `staff_performance_${new Date().toISOString().slice(0, 10)}.csv`,
      [
        "Staff",
        "Employee ID",
        "Assigned",
        "Pending",
        "Contacted",
        "Interested",
        "Follow-up",
        "Converted",
        "Closed-out",
        "Completion %",
      ],
      staffStats.map((s) => [
        s.full_name,
        s.employee_code,
        s.assigned,
        s.pending,
        s.contacted,
        s.interested,
        s.follow_up,
        s.converted,
        s.closed_out,
        s.completion_pct,
      ])
    );
  };

  const reportByStatus = (statuses: string[], filename: string) => {
    const rows = leads.filter((l) => statuses.includes(l.crm_status));
    downloadCsv(
      filename,
      ["Lead ID", "Name", "Email", "Phone", "Status", "Assigned Staff", "Follow-up Date", "Remarks"],
      rows.map((l) => [
        l.crm_id || l.id,
        l.full_name,
        l.email,
        l.contact_number,
        LEAD_CRM_STATUS_LABELS[l.crm_status],
        l.assigned_staff_name || "",
        l.follow_up_at || "",
        l.remarks || "",
      ])
    );
  };

  const loadStaffAssignedLeads = useCallback(
    async (staffId: string, nameMap?: Map<string, string>) => {
      setStaffAssignedLoading(true);
      try {
        const crmRows = await fetchLeadCrmAssignedToStaff(client, staffId);
        const names = nameMap || staffNameById;
        const huntByKey = new Map(leads.map((l) => [leadSelectionKey(l), l]));
        const views = crmRows.map((crm) =>
          crmRowToAssignmentView(
            crm,
            names,
            huntByKey.get(leadSelectionKey(crm)) || null
          )
        );
        setStaffAssignedLeads(views);
        return views;
      } catch (err: unknown) {
        toast.error(err instanceof Error ? err.message : "Failed to load assigned leads");
        setStaffAssignedLeads([]);
        return [] as LeadAssignmentView[];
      } finally {
        setStaffAssignedLoading(false);
      }
    },
    [client, leads, staffNameById]
  );

  const staffAssignedPageCount = Math.max(
    1,
    Math.ceil(staffAssignedLeads.length / STAFF_ASSIGNED_PAGE_SIZE)
  );
  const staffAssignedSafePage = Math.min(
    Math.max(0, staffAssignedPage),
    staffAssignedPageCount - 1
  );
  const paginatedStaffAssignedLeads = useMemo(() => {
    const start = staffAssignedSafePage * STAFF_ASSIGNED_PAGE_SIZE;
    return staffAssignedLeads.slice(start, start + STAFF_ASSIGNED_PAGE_SIZE);
  }, [staffAssignedLeads, staffAssignedSafePage]);

  /** Live counts from the popup lead list — must match Monitoring / Assigned totals. */
  const staffViewLiveStats = useMemo(
    () => summarizeAssignedCrmRows(staffAssignedLeads.map((l) => ({ status: l.crm_status }))),
    [staffAssignedLeads]
  );

  const openStaffView = (s: StaffLeadStats) => {
    setStaffView(s);
    setStaffRemoveKeys([]);
    setStaffAssignedPage(0);
    setStaffAssignedLeads([]);
    setStaffViewOpen(true);
    void loadStaffAssignedLeads(s.staff_id);
  };

  const toggleStaffRemoveLead = (row: LeadAssignmentView) => {
    const key = leadSelectionKey(row);
    setStaffRemoveKeys((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    );
  };

  const toggleAllStaffRemoveLeads = (checked: boolean) => {
    if (!checked) {
      setStaffRemoveKeys([]);
      return;
    }
    setStaffRemoveKeys(staffAssignedLeads.map((l) => leadSelectionKey(l)));
  };

  const removeSelectedFromStaff = async () => {
    if (!staffView) return;
    const selectedRows = staffAssignedLeads.filter((l) =>
      staffRemoveKeys.includes(leadSelectionKey(l))
    );
    const leadCrmIds = selectedRows
      .map((l) => l.crm_id)
      .filter((id): id is string => !!id);
    if (leadCrmIds.length === 0) {
      toast.error("Select assigned leads to remove");
      return;
    }
    setRemoving(true);
    try {
      const result = await unassignLeads(client, leadCrmIds);
      toast.success(`Removed ${result.removed} lead(s) from ${staffView.full_name}`);
      setStaffRemoveKeys([]);
      const nextStats = await load();
      if (nextStats) {
        setStaffView(nextStats.find((s) => s.staff_id === staffView.staff_id) || null);
      }
      await loadStaffAssignedLeads(staffView.staff_id);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Remove failed");
    } finally {
      setRemoving(false);
    }
  };

  const assignSelectedToViewedStaff = async () => {
    if (!staffView) return;
    if (selectedLeadKeys.length === 0) {
      toast.error("Select leads first, then assign to this staff");
      return;
    }
    setAssigning(true);
    try {
      const selectedRows = leads.filter((l) => selectedLeadKeys.includes(leadSelectionKey(l)));
      const leadCrmIds = await ensureLeadCrmRows(client, selectedRows);
      if (leadCrmIds.length === 0) throw new Error("Could not prepare selected leads");
      const result = await assignLeads(client, {
        staffIds: [staffView.staff_id],
        leadCrmIds,
        mode: "custom",
      });
      toast.success(`Assigned ${result.assigned} lead(s) to ${staffView.full_name}`);
      setSelectedLeadKeys([]);
      setSelectedStaffIds([staffView.staff_id]);
      const nextStats = await load();
      if (nextStats) {
        setStaffView(nextStats.find((s) => s.staff_id === staffView.staff_id) || staffView);
      }
      await loadStaffAssignedLeads(staffView.staff_id);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Assign failed");
    } finally {
      setAssigning(false);
    }
  };

  if (!isActive) return null;

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-black text-slate-800 flex items-center gap-2">
            <ClipboardList className="size-6 text-primary" /> Lead Assignment
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Assign Lead Hub entries to staff, set targets, and download reports.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
            {loading ? <Loader2 className="size-4 animate-spin mr-2" /> : null}
            Refresh
          </Button>
        </div>
      </div>

      {(selectedStaffIds.length > 0 || selectedLeadKeys.length > 0) && (
        <Card className="p-3 border border-primary/20 bg-primary/[0.04] shadow-sm">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
            <p className="text-sm font-medium text-slate-700">
              Selected <b>{selectedStaffIds.length}</b> staff · <b>{selectedLeadKeys.length}</b> leads
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="secondary"
                disabled={assigning || selectedStaffIds.length !== 1 || selectedLeadKeys.length === 0}
                onClick={() => void handleCustomAssign()}
              >
                <UserCheck className="size-4 mr-2" /> Assign to selected staff
              </Button>
              <Button
                size="sm"
                disabled={assigning || selectedStaffIds.length < 2 || selectedLeadKeys.length === 0}
                onClick={() => void handleAutoAssign()}
              >
                <Users className="size-4 mr-2" /> Auto equal distribute
              </Button>
            </div>
          </div>
        </Card>
      )}

      <Tabs defaultValue="assign" className="w-full">
        <TabsList className="bg-white border rounded-xl p-1 mb-4 flex flex-wrap h-auto gap-1">
          <TabsTrigger value="assign" className="rounded-lg text-xs font-bold">
            Assign
          </TabsTrigger>
          <TabsTrigger value="monitoring" className="rounded-lg text-xs font-bold">
            Monitoring
          </TabsTrigger>
          <TabsTrigger value="targets" className="rounded-lg text-xs font-bold">
            Targets
          </TabsTrigger>
          <TabsTrigger value="reports" className="rounded-lg text-xs font-bold">
            Reports
          </TabsTrigger>
        </TabsList>

        <TabsContent value="assign" className="mt-0">
          <div className="grid lg:grid-cols-12 gap-4">
            {/* Staff list */}
            <Card className="lg:col-span-4 p-4 border-none shadow-sm">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-black text-sm uppercase tracking-wide text-slate-600">
                  Staff ({staffStats.length})
                </h3>
                <Badge variant="outline">{selectedStaffIds.length} selected</Badge>
              </div>
              {loading ? (
                <div className="py-10 text-center text-muted-foreground">
                  <Loader2 className="size-5 animate-spin mx-auto mb-2" /> Loading…
                </div>
              ) : (
                <>
                  <ScrollArea className="h-[480px] pr-2">
                    <div className="space-y-2">
                      {paginatedStaff.map((s) => (
                        <div
                          key={s.staff_id}
                          className={`w-full rounded-xl border p-3 transition ${
                            selectedStaffIds.includes(s.staff_id)
                              ? "border-primary bg-primary/5"
                              : "border-slate-100 hover:bg-slate-50"
                          }`}
                        >
                          <div className="flex items-start gap-2">
                            <Checkbox
                              checked={selectedStaffIds.includes(s.staff_id)}
                              onCheckedChange={() => toggleStaff(s.staff_id)}
                            />
                            <button
                              type="button"
                              className="min-w-0 flex-1 text-left"
                              onClick={() => openStaffView(s)}
                            >
                              <div className="flex items-center justify-between gap-2">
                                <div className="font-bold text-sm truncate">{s.full_name}</div>
                                <Eye className="size-3.5 text-slate-400 shrink-0" />
                              </div>
                              <div className="text-[10px] text-muted-foreground font-mono">
                                {s.employee_code}
                              </div>
                              <div className="grid grid-cols-2 gap-1 mt-2 text-[10px]">
                                <span>Assigned: <b>{s.assigned}</b></span>
                                <span>Pending: <b>{s.pending}</b></span>
                                <span>Contacted: <b>{s.contacted}</b></span>
                                <span>Follow-up: <b>{s.follow_up}</b></span>
                                <span>Interested: <b>{s.interested}</b></span>
                                <span>Converted: <b>{s.converted}</b></span>
                                <span className="col-span-2">Closed-out: <b>{s.closed_out}</b></span>
                              </div>
                              <div className="mt-2 flex items-center gap-2">
                                <Progress value={s.completion_pct} className="h-1.5 flex-1" />
                                <span className="text-[10px] font-bold">{s.completion_pct}%</span>
                              </div>
                            </button>
                          </div>
                        </div>
                      ))}
                      {paginatedStaff.length === 0 ? (
                        <p className="text-sm text-muted-foreground text-center py-8">No staff found.</p>
                      ) : null}
                    </div>
                  </ScrollArea>
                  <SidePagination
                    page={staffSafePage}
                    setPage={setStaffPage}
                    total={staffStats.length}
                    pageSize={STAFF_PAGE_SIZE}
                    label="staff"
                  />
                </>
              )}
            </Card>

            {/* Lead list */}
            <Card className="lg:col-span-8 p-4 border-none shadow-sm space-y-3">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <h3 className="font-black text-sm uppercase tracking-wide text-slate-600">
                  Leads ({filteredLeads.length})
                </h3>
                <Badge variant="outline">{selectedLeadKeys.length} selected</Badge>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                <Input
                  placeholder="Search name / mobile / email / ID"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="col-span-2"
                />
                <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
                <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
                <Select value={college} onValueChange={setCollege}>
                  <SelectTrigger><SelectValue placeholder="College" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Colleges</SelectItem>
                    {filterOptions.colleges.map((c) => (
                      <SelectItem key={c} value={c}>{c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={course} onValueChange={setCourse}>
                  <SelectTrigger><SelectValue placeholder="Course" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Courses</SelectItem>
                    {filterOptions.courses.map((c) => (
                      <SelectItem key={c} value={c}>{c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={state} onValueChange={setState}>
                  <SelectTrigger><SelectValue placeholder="State" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All States</SelectItem>
                    {filterOptions.states.map((c) => (
                      <SelectItem key={c} value={c}>{c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={city} onValueChange={setCity}>
                  <SelectTrigger><SelectValue placeholder="City" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Cities</SelectItem>
                    {filterOptions.cities.map((c) => (
                      <SelectItem key={c} value={c}>{c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={source} onValueChange={setSource}>
                  <SelectTrigger><SelectValue placeholder="Source" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Sources</SelectItem>
                    {filterOptions.sources.map((c) => (
                      <SelectItem key={c} value={c}>{c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={status} onValueChange={setStatus}>
                  <SelectTrigger><SelectValue placeholder="Status" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Statuses</SelectItem>
                    {LEAD_CRM_STATUSES.map((s) => (
                      <SelectItem key={s} value={s}>{LEAD_CRM_STATUS_LABELS[s]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={priority} onValueChange={setPriority}>
                  <SelectTrigger><SelectValue placeholder="Priority" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Priorities</SelectItem>
                    <SelectItem value="low">Low</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="border rounded-xl overflow-x-auto overflow-y-auto max-h-[460px]">
                <Table className="min-w-[900px]">
                  <TableHeader className="bg-slate-50 sticky top-0 z-10">
                    <TableRow>
                      <TableHead className="w-10">
                        <Checkbox
                          checked={allFilteredSelected}
                          onCheckedChange={toggleSelectAllLeads}
                        />
                      </TableHead>
                      <TableHead className="min-w-[220px]">Lead</TableHead>
                      <TableHead className="min-w-[160px]">Phone</TableHead>
                      <TableHead className="min-w-[200px]">College</TableHead>
                      <TableHead className="min-w-[160px]">Course</TableHead>
                      <TableHead className="min-w-[120px]">Status</TableHead>
                      <TableHead className="min-w-[100px]">Priority</TableHead>
                      <TableHead className="min-w-[160px]">Assigned Staff</TableHead>
                      <TableHead className="min-w-[140px]">Source</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paginatedLeads.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={9} className="h-24 text-center text-muted-foreground">
                          No leads match filters.
                        </TableCell>
                      </TableRow>
                    ) : (
                      paginatedLeads.map((l) => {
                        const key = leadSelectionKey(l);
                        const selected = selectedLeadKeys.includes(key);
                        return (
                        <TableRow
                          key={key}
                          className={selected ? "bg-primary/5" : undefined}
                        >
                          <TableCell>
                            <Checkbox
                              checked={selected}
                              onCheckedChange={() => toggleLead(l)}
                            />
                          </TableCell>
                          <TableCell>
                            <div className="font-bold text-sm whitespace-nowrap">{l.full_name}</div>
                            <div className="text-[10px] text-muted-foreground">{l.email}</div>
                            <div className="text-[10px] font-mono text-slate-400">
                              {(l.crm_id || l.source_id || l.id).slice(0, 8)}
                            </div>
                          </TableCell>
                          <TableCell className="text-xs whitespace-nowrap">
                            {l.contact_number || "—"}
                          </TableCell>
                          <TableCell className="text-xs whitespace-nowrap">{l.college_name}</TableCell>
                          <TableCell className="text-xs whitespace-nowrap">{l.course}</TableCell>
                          <TableCell>
                            <Badge variant="secondary" className="text-[10px] whitespace-nowrap">
                              {LEAD_CRM_STATUS_LABELS[l.crm_status]}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-xs capitalize">{l.crm_priority}</TableCell>
                          <TableCell className="text-xs whitespace-nowrap">
                            {l.assigned_staff_name || (
                              <span className="text-amber-600 font-semibold">None</span>
                            )}
                          </TableCell>
                          <TableCell className="text-xs whitespace-nowrap">{l.lead_source || "—"}</TableCell>
                        </TableRow>
                        );
                      })
                    )}
                  </TableBody>
                </Table>
              </div>
              <SidePagination
                page={leadsSafePage}
                setPage={setLeadsPage}
                total={filteredLeads.length}
                pageSize={LEADS_PAGE_SIZE}
                label="leads"
              />
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="monitoring" className="mt-0">
          {/* ── Monitoring Filters ── */}
          <div className="mb-5 flex flex-wrap items-end gap-3 rounded-xl border bg-slate-50/80 p-4">
            <div className="space-y-1 min-w-[120px]">
              <Label className="text-[11px] uppercase font-bold text-muted-foreground">From Date</Label>
              <Input
                type="date"
                value={monitoringFromDate}
                onChange={(e) => setMonitoringFromDate(e.target.value)}
                className="h-8 text-sm"
              />
            </div>
            <div className="space-y-1 min-w-[120px]">
              <Label className="text-[11px] uppercase font-bold text-muted-foreground">To Date</Label>
              <Input
                type="date"
                value={monitoringToDate}
                onChange={(e) => setMonitoringToDate(e.target.value)}
                className="h-8 text-sm"
              />
            </div>
            <div className="space-y-1 min-w-[160px]">
              <Label className="text-[11px] uppercase font-bold text-muted-foreground">Lead Status</Label>
              <Select value={monitoringStatusFilter} onValueChange={setMonitoringStatusFilter}>
                <SelectTrigger className="h-8 text-sm">
                  <SelectValue placeholder="All Statuses" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  {LEAD_CRM_STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>{LEAD_CRM_STATUS_LABELS[s]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1 min-w-[160px]">
              <Label className="text-[11px] uppercase font-bold text-muted-foreground">Staff Member</Label>
              <Select value={monitoringStaffFilter} onValueChange={setMonitoringStaffFilter}>
                <SelectTrigger className="h-8 text-sm">
                  <SelectValue placeholder="All Staff" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Staff</SelectItem>
                  {staffStats.map((s) => (
                    <SelectItem key={s.staff_id} value={s.staff_id}>{s.full_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="h-8 text-sm"
              onClick={() => {
                setMonitoringFromDate("");
                setMonitoringToDate("");
                setMonitoringStatusFilter("all");
                setMonitoringStaffFilter("all");
              }}
            >
              Clear Filters
            </Button>
            <div className="ml-auto text-[11px] text-muted-foreground font-medium self-end pb-1">
              Showing {monitoringFilteredStaffStats.length} of {staffStats.length} staff
              {monitoringStatusFilter !== "all" && (
                <Badge className="ml-2 text-[10px] bg-primary/10 text-primary border-none">
                  {LEAD_CRM_STATUS_LABELS[monitoringStatusFilter as import("@/lib/leadAssignment").LeadCrmStatus]}
                </Badge>
              )}
            </div>
          </div>

          {monitoringFilteredStaffStats.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-3">
              <ClipboardList className="size-10 opacity-30" />
              <p className="text-sm">No data matches the selected filters.</p>
              <Button variant="outline" size="sm" onClick={() => {
                setMonitoringFromDate(""); setMonitoringToDate("");
                setMonitoringStatusFilter("all"); setMonitoringStaffFilter("all");
              }}>Clear Filters</Button>
            </div>
          ) : (
          <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">
            {monitoringFilteredStaffStats.map((s) => (
              <Card
                key={s.staff_id}
                className="p-5 border-none shadow-sm cursor-pointer hover:ring-2 hover:ring-primary/20 transition"
                onClick={() => openStaffView(s)}
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h4 className="font-black text-slate-900">{s.full_name}</h4>
                    <p className="text-[10px] font-mono text-muted-foreground">{s.employee_code}</p>
                  </div>
                  <Badge className="bg-primary/10 text-primary border-none">
                    {s.completion_pct}%
                  </Badge>
                </div>
                <div className="grid grid-cols-2 gap-3 mt-4 text-sm">
                  <div className="rounded-lg bg-slate-50 p-3">
                    <div className="text-[10px] uppercase text-muted-foreground font-bold">Assigned</div>
                    <div className="text-xl font-black">{s.assigned}</div>
                  </div>
                  <div className="rounded-lg bg-amber-50 p-3">
                    <div className="text-[10px] uppercase text-amber-700 font-bold">Pending</div>
                    <div className="text-xl font-black text-amber-800">{s.pending}</div>
                  </div>
                  <div className="rounded-lg bg-slate-50 p-3">
                    <div className="text-[10px] uppercase text-muted-foreground font-bold">Contacted</div>
                    <div className="text-xl font-black">{s.contacted}</div>
                  </div>
                  <div className="rounded-lg bg-violet-50 p-3">
                    <div className="text-[10px] uppercase text-violet-700 font-bold">Interested</div>
                    <div className="text-xl font-black text-violet-800">{s.interested}</div>
                  </div>
                  <div className="rounded-lg bg-blue-50 p-3">
                    <div className="text-[10px] uppercase text-blue-700 font-bold">Follow-up</div>
                    <div className="text-xl font-black text-blue-800">{s.follow_up}</div>
                  </div>
                  <div className="rounded-lg bg-emerald-50 p-3">
                    <div className="text-[10px] uppercase text-emerald-700 font-bold">Converted</div>
                    <div className="text-xl font-black text-emerald-800">{s.converted}</div>
                  </div>
                  <div className="rounded-lg bg-rose-50 p-3 col-span-2">
                    <div className="text-[10px] uppercase text-rose-700 font-bold">
                      Closed-out (not interested / closed / wrong / unreachable)
                    </div>
                    <div className="text-xl font-black text-rose-800">{s.closed_out}</div>
                  </div>
                </div>
                <p className="text-[10px] text-muted-foreground mt-2">
                  Pending + Contacted + Interested + Follow-up + Converted + Closed-out ={" "}
                  <b>
                    {s.pending +
                      s.contacted +
                      s.interested +
                      s.follow_up +
                      s.converted +
                      s.closed_out}
                  </b>{" "}
                  (Assigned <b>{s.assigned}</b>)
                </p>
                <Progress value={s.completion_pct} className="h-2 mt-4" />
              </Card>
            ))}
          </div>
          )}
        </TabsContent>

        <TabsContent value="targets" className="mt-0">
          <Card className="p-4 border-none shadow-sm">
            <div className="flex items-center gap-2 mb-4">
              <Target className="size-5 text-primary" />
              <h3 className="font-black">Staff Call Targets</h3>
            </div>
            <div className="space-y-4">
              {staffStats.map((s) => {
                const d = targetDrafts[s.staff_id] || { daily: 0, weekly: 0, monthly: 0 };
                return (
                  <div
                    key={s.staff_id}
                    className="grid md:grid-cols-5 gap-3 items-end border rounded-xl p-4"
                  >
                    <div>
                      <div className="font-bold text-sm">{s.full_name}</div>
                      <div className="text-[10px] font-mono text-muted-foreground">
                        {s.employee_code}
                      </div>
                    </div>
                    <div>
                      <Label className="text-[10px] uppercase">Daily</Label>
                      <Input
                        type="number"
                        min={0}
                        value={d.daily}
                        onChange={(e) =>
                          setTargetDrafts((prev) => ({
                            ...prev,
                            [s.staff_id]: { ...d, daily: Number(e.target.value) || 0 },
                          }))
                        }
                      />
                    </div>
                    <div>
                      <Label className="text-[10px] uppercase">Weekly</Label>
                      <Input
                        type="number"
                        min={0}
                        value={d.weekly}
                        onChange={(e) =>
                          setTargetDrafts((prev) => ({
                            ...prev,
                            [s.staff_id]: { ...d, weekly: Number(e.target.value) || 0 },
                          }))
                        }
                      />
                    </div>
                    <div>
                      <Label className="text-[10px] uppercase">Monthly</Label>
                      <Input
                        type="number"
                        min={0}
                        value={d.monthly}
                        onChange={(e) =>
                          setTargetDrafts((prev) => ({
                            ...prev,
                            [s.staff_id]: { ...d, monthly: Number(e.target.value) || 0 },
                          }))
                        }
                      />
                    </div>
                    <Button onClick={() => void saveTargets(s.staff_id)}>Save</Button>
                  </div>
                );
              })}
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="reports" className="mt-0">
          <Card className="p-6 border-none shadow-sm space-y-3 max-w-xl">
            <h3 className="font-black mb-2">Download Reports</h3>
            <Button variant="outline" className="w-full justify-start" onClick={reportAssignment}>
              <Download className="size-4 mr-2" /> Lead Assignment Report
            </Button>
            <Button variant="outline" className="w-full justify-start" onClick={reportPerformance}>
              <Download className="size-4 mr-2" /> Staff Performance Report
            </Button>
            <Button
              variant="outline"
              className="w-full justify-start"
              onClick={() =>
                reportByStatus(
                  ["follow_up"],
                  `follow_up_report_${new Date().toISOString().slice(0, 10)}.csv`
                )
              }
            >
              <Download className="size-4 mr-2" /> Follow-up Report
            </Button>
            <Button
              variant="outline"
              className="w-full justify-start"
              onClick={() =>
                reportByStatus(
                  ["pending", "unassigned"],
                  `pending_report_${new Date().toISOString().slice(0, 10)}.csv`
                )
              }
            >
              <Download className="size-4 mr-2" /> Pending Report
            </Button>
            <Button
              variant="outline"
              className="w-full justify-start"
              onClick={() =>
                reportByStatus(
                  ["converted"],
                  `conversion_report_${new Date().toISOString().slice(0, 10)}.csv`
                )
              }
            >
              <Download className="size-4 mr-2" /> Conversion Report
            </Button>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog
        open={staffViewOpen}
        onOpenChange={(open) => {
          setStaffViewOpen(open);
          if (!open) {
            setStaffRemoveKeys([]);
            setStaffAssignedPage(0);
            setStaffAssignedLeads([]);
          }
        }}
      >
        <DialogContent className="max-w-2xl rounded-3xl border-none p-0 overflow-hidden">
          <div className="bg-primary p-5 text-white">
            <DialogTitle className="text-xl font-black">
              {staffView?.full_name || "Staff details"}
            </DialogTitle>
            <DialogDescription className="text-primary-foreground/80 text-xs mt-1 font-mono">
              {staffView?.employee_code} · {staffView?.email}
            </DialogDescription>
          </div>
          {staffView && (
            <div className="p-5 space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
                <div className="rounded-xl bg-slate-50 p-3">
                  <div className="text-[10px] uppercase text-muted-foreground font-bold">Assigned</div>
                  <div className="text-lg font-black">
                    {staffAssignedLoading ? "…" : staffViewLiveStats.assigned}
                  </div>
                </div>
                <div className="rounded-xl bg-amber-50 p-3">
                  <div className="text-[10px] uppercase text-amber-700 font-bold">Pending</div>
                  <div className="text-lg font-black text-amber-800">
                    {staffAssignedLoading ? "…" : staffViewLiveStats.pending}
                  </div>
                </div>
                <div className="rounded-xl bg-slate-50 p-3">
                  <div className="text-[10px] uppercase text-muted-foreground font-bold">Contacted</div>
                  <div className="text-lg font-black">
                    {staffAssignedLoading ? "…" : staffViewLiveStats.contacted}
                  </div>
                </div>
                <div className="rounded-xl bg-violet-50 p-3">
                  <div className="text-[10px] uppercase text-violet-700 font-bold">Interested</div>
                  <div className="text-lg font-black text-violet-800">
                    {staffAssignedLoading ? "…" : staffViewLiveStats.interested}
                  </div>
                </div>
                <div className="rounded-xl bg-blue-50 p-3">
                  <div className="text-[10px] uppercase text-blue-700 font-bold">Follow-up</div>
                  <div className="text-lg font-black text-blue-800">
                    {staffAssignedLoading ? "…" : staffViewLiveStats.follow_up}
                  </div>
                </div>
                <div className="rounded-xl bg-emerald-50 p-3">
                  <div className="text-[10px] uppercase text-emerald-700 font-bold">Converted</div>
                  <div className="text-lg font-black text-emerald-800">
                    {staffAssignedLoading ? "…" : staffViewLiveStats.converted}
                  </div>
                </div>
                <div className="rounded-xl bg-rose-50 p-3 col-span-2 md:col-span-3">
                  <div className="text-[10px] uppercase text-rose-700 font-bold">Closed-out</div>
                  <div className="text-lg font-black text-rose-800">
                    {staffAssignedLoading ? "…" : staffViewLiveStats.closed_out}
                  </div>
                </div>
              </div>
              <Progress value={staffViewLiveStats.completion_pct} className="h-2" />
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <p className="text-xs text-muted-foreground">
                  Completion {staffViewLiveStats.completion_pct}% ·{" "}
                  {staffAssignedLoading
                    ? "Loading assigned leads…"
                    : `${staffViewLiveStats.assigned} assigned lead(s)`}
                  . Select from this list to remove.
                </p>
                <Button
                  size="sm"
                  variant="destructive"
                  disabled={removing || staffRemoveKeys.length === 0}
                  onClick={() => void removeSelectedFromStaff()}
                >
                  {removing ? (
                    <Loader2 className="size-4 animate-spin mr-2" />
                  ) : (
                    <UserMinus className="size-4 mr-2" />
                  )}
                  Remove {staffRemoveKeys.length || ""} from staff
                </Button>
              </div>
              <div className="rounded-xl border overflow-hidden">
                <div className="max-h-64 overflow-y-auto overscroll-contain">
                  <Table>
                    <TableHeader className="sticky top-0 z-10 bg-white shadow-sm">
                      <TableRow>
                        <TableHead className="w-10">
                          <Checkbox
                            checked={
                              staffAssignedLeads.length > 0 &&
                              staffRemoveKeys.length === staffAssignedLeads.length
                            }
                            onCheckedChange={(v) => toggleAllStaffRemoveLeads(v === true)}
                            disabled={staffAssignedLeads.length === 0}
                            aria-label="Select all assigned leads"
                          />
                        </TableHead>
                        <TableHead>Name</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Phone</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {staffAssignedLoading ? (
                        <TableRow>
                          <TableCell colSpan={4} className="text-center text-muted-foreground py-8">
                            <Loader2 className="size-5 animate-spin inline-block mr-2" />
                            Loading assigned leads…
                          </TableCell>
                        </TableRow>
                      ) : staffAssignedLeads.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={4} className="text-center text-muted-foreground py-8">
                            No assigned leads yet for this staff.
                          </TableCell>
                        </TableRow>
                      ) : (
                        paginatedStaffAssignedLeads.map((l) => {
                          const key = leadSelectionKey(l);
                          return (
                            <TableRow key={key}>
                              <TableCell>
                                <Checkbox
                                  checked={staffRemoveKeys.includes(key)}
                                  onCheckedChange={() => toggleStaffRemoveLead(l)}
                                  aria-label={`Select ${l.full_name}`}
                                />
                              </TableCell>
                              <TableCell>
                                <div className="font-bold text-sm">{l.full_name}</div>
                                <div className="text-[10px] text-muted-foreground">{l.email}</div>
                              </TableCell>
                              <TableCell>
                                <Badge variant="secondary" className="text-[10px]">
                                  {LEAD_CRM_STATUS_LABELS[l.crm_status]}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-xs">{l.contact_number || "—"}</TableCell>
                            </TableRow>
                          );
                        })
                      )}
                    </TableBody>
                  </Table>
                </div>
                {staffAssignedLeads.length > 0 ? (
                  <div className="border-t px-3 py-2 bg-slate-50/80">
                    <SidePagination
                      page={staffAssignedSafePage}
                      setPage={setStaffAssignedPage}
                      total={staffAssignedLeads.length}
                      pageSize={STAFF_ASSIGNED_PAGE_SIZE}
                      label="assigned leads"
                    />
                  </div>
                ) : null}
              </div>
              <DialogFooter className="gap-2 sm:justify-between">
                <Button
                  variant="outline"
                  onClick={() => {
                    setSelectedStaffIds((prev) =>
                      prev.includes(staffView.staff_id)
                        ? prev
                        : [...prev, staffView.staff_id]
                    );
                    toast.message(`${staffView.full_name} marked for assignment`);
                  }}
                >
                  Select for assign
                </Button>
                <div className="flex gap-2">
                  <Button variant="ghost" onClick={() => setStaffViewOpen(false)}>
                    Close
                  </Button>
                  <Button
                    disabled={assigning || selectedLeadKeys.length === 0}
                    onClick={() => void assignSelectedToViewedStaff()}
                  >
                    {assigning ? <Loader2 className="size-4 animate-spin mr-2" /> : null}
                    Assign {selectedLeadKeys.length} selected lead(s)
                  </Button>
                </div>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
