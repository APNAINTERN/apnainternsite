import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase as defaultClient } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Activity,
  CheckSquare,
  Download,
  Loader2,
  Search,
  Users,
} from "lucide-react";
import { fetchAdminStudentsLight } from "@/lib/adminStudentDirectory";
import { fetchAllCollegesCatalog } from "@/lib/institutionCatalog";
import {
  adminBulkMarkAttendance,
  adminMarkStudentAttendanceDay,
  adminResetAllAttendance,
  exportAttendanceReportXlsx,
  fetchAttendanceCountsForStudentIds,
  fetchAttendanceCountsRpcOnly,
  formatAttendanceBulkScopeLabel,
  isAttendanceResetScoped,
} from "@/lib/attendanceAdmin";
import {
  ATTENDANCE_ELIGIBILITY_MIN_PERCENT,
  INTERNSHIP_ATTENDANCE_TOTAL_DAYS,
  calcAttendancePercentage,
  getStudentRecordId,
  isAttendanceEligible,
  minDaysForAttendanceEligibility,
  normalizeStudentId,
} from "@/lib/attendanceStats";
import {
  ADMIN_PROGRAMME_ATTENDANCE_HINT,
  bulkAttendanceDateRangeForUniversity,
  programmeAttendanceDayBasis,
} from "@/lib/internshipProgramme";
import { displayCollegeName } from "@/lib/collegeDisplay";
import {
  countProgrammePresentDays,
  nextAbsentProgrammeDayKeys,
  programmeDayMarkedAtIso,
} from "@/lib/studentPortalDocuments";

type CatalogUni = { id: string; name: string };
type CatalogCollege = { id: string; name: string; university_id: string };
type CatalogDomain = { id: string; name: string };

type Props = {
  client?: SupabaseClient;
  currentUserId?: string | null;
  isActive: boolean;
  /** Optional: notify parent when students load (Admin certs coupling). */
  onStudentsLoaded?: (rows: Record<string, unknown>[]) => void;
};

const PAGE_SIZE = 20;
const STUDENTS_CACHE_TTL_MS = 5 * 60 * 1000;

type StudentsCache = {
  rows: Record<string, unknown>[];
  fetchedAt: number;
};

let studentsLightCache: StudentsCache | null = null;
let countsRpcCache: { map: Record<string, number>; fetchedAt: number } | null = null;

async function loadStudentsLightCached(client: SupabaseClient): Promise<Record<string, unknown>[]> {
  const now = Date.now();
  if (studentsLightCache && now - studentsLightCache.fetchedAt < STUDENTS_CACHE_TTL_MS) {
    return studentsLightCache.rows;
  }
  const rows = await fetchAdminStudentsLight(client);
  studentsLightCache = { rows, fetchedAt: Date.now() };
  return rows;
}

export function StudentAttendancePanel({
  client = defaultClient,
  currentUserId,
  isActive,
  onStudentsLoaded,
}: Props) {
  const [loading, setLoading] = useState(false);
  const [countsLoading, setCountsLoading] = useState(false);
  const [opsLoading, setOpsLoading] = useState(false);
  const [students, setStudents] = useState<Record<string, unknown>[]>(
    () => studentsLightCache?.rows || []
  );
  const [counts, setCounts] = useState<Record<string, number>>(
    () => countsRpcCache?.map || {}
  );
  const [criteria, setCriteria] = useState(ATTENDANCE_ELIGIBILITY_MIN_PERCENT);
  const [savingCriteria, setSavingCriteria] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [uniFilter, setUniFilter] = useState("all");
  const [collegeFilter, setCollegeFilter] = useState("all");
  const [domainFilter, setDomainFilter] = useState("all");
  const [page, setPage] = useState(0);
  const [bulkStart, setBulkStart] = useState("");
  const [bulkEnd, setBulkEnd] = useState("");
  const [unis, setUnis] = useState<CatalogUni[]>([]);
  const [colleges, setColleges] = useState<CatalogCollege[]>([]);
  const [domains, setDomains] = useState<CatalogDomain[]>([]);
  const studentsRef = useRef<Record<string, unknown>[]>(studentsLightCache?.rows || []);
  const countsLoadRef = useRef(0);
  const pageCountsKeyRef = useRef("");
  const fullCountsStartedRef = useRef(false);
  const catalogLoadedRef = useRef(false);

  const loadCatalog = useCallback(async () => {
    if (catalogLoadedRef.current && unis.length && colleges.length) return;
    const [{ data: u }, c, { data: d }] = await Promise.all([
      client.from("universities").select("id,name").order("name"),
      fetchAllCollegesCatalog(client),
      client.from("internship_domains").select("id,name").order("name"),
    ]);
    setUnis((u || []) as CatalogUni[]);
    setColleges((c || []) as CatalogCollege[]);
    setDomains((d || []) as CatalogDomain[]);
    catalogLoadedRef.current = true;
  }, [client, colleges.length, unis.length]);

  const onStudentsLoadedRef = useRef(onStudentsLoaded);
  onStudentsLoadedRef.current = onStudentsLoaded;

  const reload = useCallback(async () => {
    const hasCached = (studentsLightCache?.rows.length || 0) > 0;
    if (!hasCached) setLoading(true);
    try {
      const [rows] = await Promise.all([
        loadStudentsLightCached(client),
        loadCatalog().catch(() => {}),
        (async () => {
          const { data: settings } = await client
            .from("attendance_settings")
            .select("min_percentage")
            .eq("id", 1)
            .maybeSingle();
          if (settings?.min_percentage != null) {
            setCriteria(Number(settings.min_percentage) || ATTENDANCE_ELIGIBILITY_MIN_PERCENT);
          }
        })().catch(() => {}),
      ]);
      setStudents(rows);
      studentsRef.current = rows;
      onStudentsLoadedRef.current?.(rows);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to load attendance students");
      if (!studentsRef.current.length) setStudents([]);
    } finally {
      setLoading(false);
    }
  }, [client, loadCatalog]);

  useEffect(() => {
    if (!isActive) return;
    void reload();
  }, [isActive, reload]);

  useEffect(() => {
    if (uniFilter === "all") return;
    const range = bulkAttendanceDateRangeForUniversity(uniFilter);
    if (range?.start && range?.end) {
      setBulkStart(range.start);
      setBulkEnd(range.end);
    }
  }, [uniFilter]);

  const collegeOptions = useMemo(() => {
    if (uniFilter === "all") return colleges;
    const uni = unis.find((u) => u.name === uniFilter);
    if (!uni) return colleges;
    return colleges.filter((c) => c.university_id === uni.id);
  }, [colleges, uniFilter, unis]);

  const filtered = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    return students.filter((s) => {
      if (uniFilter !== "all" && String(s.university_name || "") !== uniFilter) return false;
      if (collegeFilter !== "all" && String(s.college_name || "") !== collegeFilter) return false;
      if (domainFilter !== "all") {
        const domain = String(s.internship_domain || s.course || "").toLowerCase();
        if (!domain.includes(domainFilter.toLowerCase())) return false;
      }
      if (!q) return true;
      return (
        String(s.full_name || "").toLowerCase().includes(q) ||
        String(s.email || "").toLowerCase().includes(q) ||
        String(s.registration_id || "").toLowerCase().includes(q)
      );
    });
  }, [students, searchTerm, uniFilter, collegeFilter, domainFilter]);

  useEffect(() => {
    setPage(0);
  }, [searchTerm, uniFilter, collegeFilter, domainFilter]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const pageSlice = filtered.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE);

  // Fast: load counts for the visible page only (~20 students).
  useEffect(() => {
    if (!isActive || pageSlice.length === 0) return;
    const ids = pageSlice.map((s) => getStudentRecordId(s)).filter(Boolean);
    const key = `${safePage}:${ids.join(",")}`;
    if (pageCountsKeyRef.current === key) return;
    pageCountsKeyRef.current = key;

    const loadId = ++countsLoadRef.current;
    setCountsLoading(true);
    const uniById: Record<string, string> = {};
    for (const s of pageSlice) {
      const id = normalizeStudentId(getStudentRecordId(s));
      const uni = String(s.university_name ?? "").trim();
      if (id && uni) uniById[id] = uni;
    }

    void fetchAttendanceCountsForStudentIds(client, ids, uniById, (pageCounts) => {
      if (loadId !== countsLoadRef.current) return;
      setCounts((prev) => ({ ...prev, ...pageCounts }));
    })
      .then((map) => {
        if (loadId !== countsLoadRef.current) return;
        if (Object.keys(map).length) setCounts((prev) => ({ ...prev, ...map }));
      })
      .catch((err: unknown) => {
        console.warn("[attendance] page counts failed", err);
      })
      .finally(() => {
        if (loadId === countsLoadRef.current) setCountsLoading(false);
      });
  }, [isActive, pageSlice, safePage, client]);

  // Background: full counts via RPC once (no 674k-row table scan).
  useEffect(() => {
    if (!isActive || students.length === 0 || fullCountsStartedRef.current) return;
    const now = Date.now();
    if (countsRpcCache && now - countsRpcCache.fetchedAt < STUDENTS_CACHE_TTL_MS) {
      setCounts((prev) => ({ ...countsRpcCache!.map, ...prev }));
      fullCountsStartedRef.current = true;
      return;
    }
    fullCountsStartedRef.current = true;
    void fetchAttendanceCountsRpcOnly(client, (pageCounts) => {
      setCounts((prev) => ({ ...prev, ...pageCounts }));
    }).then((map) => {
      if (Object.keys(map).length) {
        countsRpcCache = { map, fetchedAt: Date.now() };
        setCounts((prev) => ({ ...map, ...prev }));
      }
    });
  }, [isActive, students.length, client]);

  const resetScoped = isAttendanceResetScoped(
    uniFilter === "all" ? null : uniFilter,
    collegeFilter === "all" ? null : collegeFilter,
    domainFilter === "all" ? null : domainFilter
  );
  const scopeLabel = formatAttendanceBulkScopeLabel(
    uniFilter === "all" ? null : uniFilter,
    collegeFilter === "all" ? null : collegeFilter,
    domainFilter === "all" ? null : domainFilter
  );

  const refreshVisibleCounts = async () => {
    const ids = pageSlice.map((s) => getStudentRecordId(s)).filter(Boolean);
    const uniById: Record<string, string> = {};
    for (const s of pageSlice) {
      const id = normalizeStudentId(getStudentRecordId(s));
      const uni = String(s.university_name ?? "").trim();
      if (id && uni) uniById[id] = uni;
    }
    const map = await fetchAttendanceCountsForStudentIds(client, ids, uniById);
    setCounts((prev) => ({ ...prev, ...map }));
  };

  const markPresent = async (student: Record<string, unknown>) => {
    const id = getStudentRecordId(student);
    if (!id) return;
    setOpsLoading(true);
    try {
      const { data: existing, error: fetchErr } = await client
        .from("attendance")
        .select("marked_at")
        .eq("student_id", id);
      if (fetchErr) throw fetchErr;

      const uni = String(student.university_name || "");
      const dayKeys = nextAbsentProgrammeDayKeys(existing || [], 1, uni);
      if (dayKeys.length === 0) {
        toast.error("All programme days are already marked present for this student.");
        return;
      }

      const markedAt = programmeDayMarkedAtIso(dayKeys[0]);
      await adminMarkStudentAttendanceDay(client, id, markedAt);

      const programmeMarked = countProgrammePresentDays(
        [...(existing || []), { marked_at: markedAt }],
        uni
      );
      setCounts((prev) => ({
        ...prev,
        [normalizeStudentId(id)]: programmeMarked,
      }));
      toast.success("Marked present");
    } catch (err: unknown) {
      const msg =
        err instanceof Error
          ? err.message
          : err && typeof err === "object" && "message" in err
            ? String((err as { message?: unknown }).message || "Mark failed")
            : "Mark failed";
      toast.error(msg);
    } finally {
      setOpsLoading(false);
    }
  };

  const runBulkMark = async () => {
    if (!bulkStart || !bulkEnd) {
      toast.error("Select from/to dates");
      return;
    }
    setOpsLoading(true);
    try {
      const result = await adminBulkMarkAttendance(client, {
        startDate: bulkStart,
        endDate: bulkEnd,
        universityName: uniFilter === "all" ? null : uniFilter,
        collegeName: collegeFilter === "all" ? null : collegeFilter,
      });
      toast.success(
        `Bulk mark: ${result.records_inserted} records for ${result.students_matched} students`
      );
      countsRpcCache = null;
      fullCountsStartedRef.current = false;
      pageCountsKeyRef.current = "";
      await refreshVisibleCounts();
      void fetchAttendanceCountsRpcOnly(client).then((map) => {
        if (Object.keys(map).length) {
          countsRpcCache = { map, fetchedAt: Date.now() };
          setCounts((prev) => ({ ...map, ...prev }));
        }
      });
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Bulk mark failed");
    } finally {
      setOpsLoading(false);
    }
  };

  const runReset = async () => {
    const ok = window.confirm(
      resetScoped
        ? `Reset attendance for filtered students (${scopeLabel})?`
        : "Reset ALL student attendance records?"
    );
    if (!ok) return;
    setOpsLoading(true);
    try {
      await adminResetAllAttendance(client, {
        universityName: uniFilter === "all" ? null : uniFilter,
        collegeName: collegeFilter === "all" ? null : collegeFilter,
      });
      toast.success("Attendance reset");
      setCounts({});
      countsRpcCache = null;
      fullCountsStartedRef.current = false;
      pageCountsKeyRef.current = "";
      await refreshVisibleCounts();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Reset failed");
    } finally {
      setOpsLoading(false);
    }
  };

  if (!isActive) return null;

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="grid md:grid-cols-3 gap-6">
        <Card className="md:col-span-1 p-6 border-none shadow-elegant bg-slate-900 text-white">
          <h3 className="font-black mb-1 flex items-center gap-2 text-primary">
            <CheckSquare className="size-5" /> Eligibility Criteria
          </h3>
          <p className="text-slate-400 text-xs mb-4">
            Minimum attendance % for certificate eligibility. Out of{" "}
            {INTERNSHIP_ATTENDANCE_TOTAL_DAYS} days — Eligible at {criteria}% (
            {minDaysForAttendanceEligibility(criteria)} marked days).
          </p>
          <div className="flex items-center gap-3">
            <input
              type="number"
              min={0}
              max={100}
              value={criteria}
              onChange={(e) => setCriteria(Number(e.target.value))}
              className="w-24 h-10 rounded-xl bg-slate-800 border-none text-white text-center font-black text-lg focus:ring-2 focus:ring-primary/40 outline-none"
            />
            <span className="text-slate-400 font-bold">%</span>
            <Button
              className="ml-auto bg-primary hover:bg-primary/90 font-black"
              disabled={savingCriteria}
              onClick={async () => {
                setSavingCriteria(true);
                const { error } = await client.from("attendance_settings").upsert({
                  id: 1,
                  min_percentage: criteria,
                  updated_at: new Date().toISOString(),
                });
                if (error) toast.error("Failed to save");
                else toast.success("Criteria saved");
                setSavingCriteria(false);
              }}
            >
              {savingCriteria ? <Loader2 className="size-4 animate-spin" /> : "Save"}
            </Button>
          </div>
        </Card>

        <Card className="md:col-span-2 p-6 border-none shadow-elegant bg-white flex items-center justify-between gap-4">
          <div>
            <h3 className="font-black text-slate-800 flex items-center gap-2">
              <Users className="size-5 text-primary" /> Total Students Tracked
            </h3>
            <div className="text-4xl font-black text-primary mt-1">
              {loading ? "…" : students.length}
            </div>
            <p className="text-muted-foreground text-xs mt-1">
              Same directory light-list used by Certificates &amp; Admin
              {countsLoading ? " · loading counts…" : ""}
            </p>
          </div>
          <Button
            variant="outline"
            className="gap-2 bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100 rounded-xl font-bold"
            onClick={() => {
              if (!filtered.length) return toast.error("No data to export");
              exportAttendanceReportXlsx(
                filtered.map((s) => {
                  const id = getStudentRecordId(s);
                  const days = counts[normalizeStudentId(id)] || 0;
                  const basis = programmeAttendanceDayBasis(String(s.university_name || ""));
                  const pct = calcAttendancePercentage(days, basis);
                  return {
                    full_name: String(s.full_name || ""),
                    email: String(s.email || ""),
                    university_name: String(s.university_name || ""),
                    college_name: String(s.college_name || ""),
                    internship_domain: String(s.internship_domain || ""),
                    total_days: days,
                    percentage: pct,
                    isEligible: isAttendanceEligible(days, criteria, basis),
                  };
                })
              );
              toast.success(`Exported ${filtered.length} student(s)`);
            }}
          >
            <Download className="size-4" /> Export Excel
          </Button>
        </Card>
      </div>

      <Card className="border-none shadow-elegant overflow-hidden">
        <div className="p-4 border-b bg-muted/20 flex flex-col gap-4">
          <div className="flex flex-col lg:flex-row items-stretch lg:items-center gap-3">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
              <Input
                className="pl-9 bg-white border-none"
                placeholder="Search student..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            <Select
              value={uniFilter}
              onValueChange={(v) => {
                setUniFilter(v);
                setCollegeFilter("all");
              }}
            >
              <SelectTrigger className="w-full lg:w-52 bg-white border-none shadow-soft">
                <SelectValue placeholder="University" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Universities</SelectItem>
                {unis.map((u) => (
                  <SelectItem key={u.id} value={u.name}>
                    {u.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={collegeFilter} onValueChange={setCollegeFilter}>
              <SelectTrigger className="w-full lg:w-52 bg-white border-none shadow-soft">
                <SelectValue placeholder="College" />
              </SelectTrigger>
              <SelectContent className="max-h-72">
                <SelectItem value="all">All Colleges</SelectItem>
                {collegeOptions.map((c) => (
                  <SelectItem key={c.id} value={c.name}>
                    {displayCollegeName(c.name)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={domainFilter} onValueChange={setDomainFilter}>
              <SelectTrigger className="w-full lg:w-48 bg-white border-none shadow-soft">
                <SelectValue placeholder="Domain" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Domains</SelectItem>
                {domains.map((d) => (
                  <SelectItem key={d.id} value={d.name}>
                    {d.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              variant="ghost"
              size="sm"
              className="gap-2 text-violet-600 font-bold shrink-0"
              onClick={() => void reload()}
            >
              <Activity className="size-4" /> Refresh Data
            </Button>
          </div>

          <div className="rounded-xl border border-amber-200 bg-amber-50/80 p-4 space-y-3">
            <h3 className="font-black text-amber-950">Bulk attendance actions</h3>
            <p className="text-xs text-amber-950/80 font-medium">{ADMIN_PROGRAMME_ATTENDANCE_HINT}</p>
            <div className="flex flex-col sm:flex-row sm:items-end gap-3 flex-wrap">
              <Button
                variant="outline"
                className="border-amber-300 bg-white text-amber-950 hover:bg-amber-100 font-bold"
                disabled={opsLoading}
                onClick={() => void runReset()}
              >
                {resetScoped ? "Reset filtered attendance" : "Reset all attendance"}
              </Button>
              <div className="space-y-1">
                <Label className="text-xs font-bold text-amber-900">From date</Label>
                <Input
                  type="date"
                  value={bulkStart}
                  onChange={(e) => setBulkStart(e.target.value)}
                  className="bg-white w-full sm:w-40"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs font-bold text-amber-900">To date</Label>
                <Input
                  type="date"
                  value={bulkEnd}
                  onChange={(e) => setBulkEnd(e.target.value)}
                  className="bg-white w-full sm:w-40"
                />
              </div>
              <Button
                className="bg-amber-700 hover:bg-amber-800 font-bold"
                disabled={opsLoading}
                onClick={() => void runBulkMark()}
              >
                Mark present ({filtered.length})
              </Button>
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Student</TableHead>
                <TableHead>College</TableHead>
                <TableHead>Days</TableHead>
                <TableHead>%</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-12 text-muted-foreground">
                    <Loader2 className="size-6 animate-spin inline mr-2" /> Loading students…
                  </TableCell>
                </TableRow>
              ) : pageSlice.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-12 text-muted-foreground">
                    No students match filters.
                  </TableCell>
                </TableRow>
              ) : (
                pageSlice.map((s) => {
                  const id = getStudentRecordId(s);
                  const days = counts[normalizeStudentId(id)] || 0;
                  const basis = programmeAttendanceDayBasis(String(s.university_name || ""));
                  const pct = calcAttendancePercentage(days, basis);
                  const eligible = isAttendanceEligible(days, criteria, basis);
                  return (
                    <TableRow key={id}>
                      <TableCell>
                        <p className="font-bold text-sm">{String(s.full_name || "—")}</p>
                        <p className="text-[10px] text-muted-foreground">{String(s.email || "")}</p>
                      </TableCell>
                      <TableCell className="text-xs">
                        {displayCollegeName(String(s.college_name || "—"))}
                      </TableCell>
                      <TableCell className="font-bold">{days}</TableCell>
                      <TableCell className="font-bold">{pct}%</TableCell>
                      <TableCell>
                        <Badge className={eligible ? "bg-emerald-500" : "bg-slate-400"}>
                          {eligible ? "Eligible" : "In progress"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-8 font-bold"
                          disabled={opsLoading}
                          onClick={() => void markPresent(s)}
                        >
                          Mark today
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
        <div className="p-3 border-t flex items-center justify-between text-xs text-muted-foreground">
          <span>
            Showing {filtered.length === 0 ? 0 : safePage * PAGE_SIZE + 1}–
            {Math.min(filtered.length, (safePage + 1) * PAGE_SIZE)} of {filtered.length}
            {countsLoading ? " · updating counts…" : ""}
          </span>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={safePage <= 0}
              onClick={() => setPage((p) => p - 1)}
            >
              Previous
            </Button>
            <span className="px-2 py-1 font-bold">
              {safePage + 1}/{pageCount}
            </span>
            <Button
              size="sm"
              variant="outline"
              disabled={safePage >= pageCount - 1}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}
