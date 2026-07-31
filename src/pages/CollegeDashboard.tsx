import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { COLLEGE_LOGIN_PATH } from "@/lib/authRoutes";
import { displayCollegeName } from "@/lib/collegeDisplay";
import {
  type AssignedCollege,
  buildDirectoryCollegeFilters,
} from "@/lib/collegeAdminScope";
import {
  fetchCollegeAdminPortalData,
  fetchCollegeAdminStudentsPage,
} from "@/lib/collegeAdminStudents";
import { isStudentVisibleInSupportDirectory } from "@/lib/studentPaymentAccess";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import {
  LayoutDashboard,
  Loader2,
  LogOut,
  Menu,
  Search,
  Users,
  ChevronLeft,
  ChevronRight,
  GraduationCap,
  Filter,
  User,
  Shield,
} from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SharedProfilePanel } from "@/components/SharedProfilePanel";
import { StaffSecurityPanel } from "@/components/staff/StaffAccountPanels";
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Tooltip,
  Legend,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
} from "recharts";

const PAGE_SIZE = 12;

const GENDER_COLORS: Record<string, string> = {
  Male: "#0ea5e9",
  Female: "#ec4899",
  Other: "#94a3b8",
};

const STREAM_COLORS: Record<string, string> = {
  "B.Com": "#6366f1",
  "B.Sc": "#22c55e",
  "B.A": "#f97316",
  Other: "#94a3b8",
};

function genderBucket(g: string | null | undefined): "Male" | "Female" | "Other" {
  const x = (g || "").trim().toLowerCase();
  if (["m", "male", "man"].includes(x)) return "Male";
  if (["f", "female", "woman"].includes(x)) return "Female";
  if (!x) return "Other";
  return "Other";
}

/** Group into B.Com / B.Sc / B.A / Other from course, degree, department text. */
function programStream(s: {
  course?: string | null;
  degree?: string | null;
  department?: string | null;
}): "B.Com" | "B.Sc" | "B.A" | "Other" {
  const raw = `${s.course || ""} ${s.degree || ""} ${s.department || ""}`.toLowerCase();
  if (/b\.?\s*com|bcom|\bcommerce\b|bachelor\s+of\s+commerce/.test(raw)) return "B.Com";
  if (/b\.?\s*sc|bsc|\bscience\b|bachelor\s+of\s+science/.test(raw)) return "B.Sc";
  if (/b\.?\s*a\b|\bba\b|\barts\b|bachelor\s+of\s+arts/.test(raw)) return "B.A";
  return "Other";
}

function countMap<T extends string>(items: T[]): { name: string; value: number }[] {
  const m = new Map<string, number>();
  for (const k of items) m.set(k, (m.get(k) || 0) + 1);
  return Array.from(m.entries())
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value);
}

type Section = "dashboard" | "students" | "profile" | "security";

export default function CollegeDashboard() {
  const navigate = useNavigate();

  // ── Bootstrap state (loaded once on mount) ─────────────────────────────────
  const [bootstrapLoading, setBootstrapLoading] = useState(true);
  const [assignedColleges, setAssignedColleges] = useState<AssignedCollege[]>([]);
  const [directoryCollegeNames, setDirectoryCollegeNames] = useState<string[]>([]);
  const [scopedStudentCount, setScopedStudentCount] = useState(0);
  const [sessionUser, setSessionUser] = useState<any>(null);

  // Stats data loaded in the background
  const [statsStudents, setStatsStudents] = useState<any[]>([]);
  const [statsLoading, setStatsLoading] = useState(false);

  // ── Students tab server-side pagination state ───────────────────────────────
  const [pageStudents, setPageStudents] = useState<any[]>([]);
  const [pageTotal, setPageTotal] = useState(0);
  const [pageLoading, setPageLoading] = useState(false);

  // ── UI state ────────────────────────────────────────────────────────────────
  const [section, setSection] = useState<Section>("dashboard");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [page, setPage] = useState(0);
  const [detailStudent, setDetailStudent] = useState<any | null>(null);
  const [navOpen, setNavOpen] = useState(false);
  const [collegeFilter, setCollegeFilter] = useState<string>("all");

  // Debounce search so we don't fire a DB call on every keystroke
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleSearchChange = (val: string) => {
    setSearch(val);
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    searchDebounceRef.current = setTimeout(() => {
      setDebouncedSearch(val);
      setPage(0);
    }, 350);
  };

  // Reset page when filter changes
  useEffect(() => {
    setPage(0);
  }, [collegeFilter]);

  // ── 1. Bootstrap: load metadata (run instantly on mount) ────────────────────
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) {
        navigate(COLLEGE_LOGIN_PATH, { replace: true });
        return;
      }
      setSessionUser(session.user);

      try {
        const {
          assignedColleges: assigned,
          directoryCollegeNames: dirNames,
          scopedStudentCount: dbCount,
        } = await fetchCollegeAdminPortalData(supabase, session.user.id);

        if (cancelled) return;
        setAssignedColleges(assigned);
        setDirectoryCollegeNames(dirNames);
        setScopedStudentCount(dbCount);
      } catch (error) {
        console.error(error);
        if (!cancelled) {
          setAssignedColleges([]);
        }
      }
      if (!cancelled) setBootstrapLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [navigate]);

  // ── 2. Background stats loader (non-blocking) ──────────────────────────────
  useEffect(() => {
    if (bootstrapLoading || assignedColleges.length === 0) return;

    let cancelled = false;
    (async () => {
      setStatsLoading(true);
      try {
        const { data, error } = await supabase
          .rpc("college_admin_list_students")
          .select("gender,course,degree,department,college_name,created_at,id,metadata");
        
        if (cancelled) return;
        if (error) throw error;
        setStatsStudents(
          (data || []).filter((row) => isStudentVisibleInSupportDirectory(row))
        );
      } catch (error) {
        console.warn("Failed to load dashboard charts stats background:", error);
      } finally {
        if (!cancelled) setStatsLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [bootstrapLoading, assignedColleges.length]);

  // ── 3. Server-side page fetch — fires when Students tab is active ───────────
  const fetchPage = useCallback(async () => {
    if (assignedColleges.length === 0) return;
    setPageLoading(true);
    try {
      const result = await fetchCollegeAdminStudentsPage(
        supabase,
        page,
        PAGE_SIZE,
        debouncedSearch,
        collegeFilter
      );
      setPageStudents(result.students as any[]);
      setPageTotal(result.total);
    } catch (err) {
      console.error("College admin page fetch error:", err);
      setPageStudents([]);
    } finally {
      setPageLoading(false);
    }
  }, [assignedColleges.length, page, debouncedSearch, collegeFilter]);

  useEffect(() => {
    if (section === "students" && !bootstrapLoading) {
      fetchPage();
    }
  }, [section, bootstrapLoading, fetchPage]);

  // ── Derived dashboard stats (from statsStudents loaded in background) ───────
  const collegeScopedStudents = useMemo(() => {
    if (collegeFilter === "all") return statsStudents;
    return statsStudents.filter(
      (s) => String(s.college_name ?? "").trim() === collegeFilter
    );
  }, [statsStudents, collegeFilter]);

  const directoryCollegeFilters = useMemo(() => {
    const fromStudents = buildDirectoryCollegeFilters(statsStudents);
    if (fromStudents.length > 0) return fromStudents;
    return directoryCollegeNames.map((directoryName) => ({ directoryName, count: 0 }));
  }, [statsStudents, directoryCollegeNames]);

  const genderData = useMemo(
    () => countMap(collegeScopedStudents.map((s) => genderBucket(s.gender))),
    [collegeScopedStudents]
  );
  const streamData = useMemo(
    () => countMap(collegeScopedStudents.map((s) => programStream(s))),
    [collegeScopedStudents]
  );

  const allScopeTotal =
    collegeFilter === "all" && scopedStudentCount > 0
      ? scopedStudentCount
      : statsStudents.length > 0
      ? statsStudents.length
      : scopedStudentCount;
  const dashTotal = collegeScopedStudents.length;
  const maleN = collegeScopedStudents.filter((s) => genderBucket(s.gender) === "Male").length;
  const femaleN = collegeScopedStudents.filter((s) => genderBucket(s.gender) === "Female").length;
  const otherGenderN = dashTotal - maleN - femaleN;

  const selectedCollegeLabel =
    collegeFilter === "all"
      ? "All assigned colleges"
      : displayCollegeName(collegeFilter) || collegeFilter;

  // ── Students tab pagination ─────────────────────────────────────────────────
  const pageCount = Math.max(1, Math.ceil(pageTotal / PAGE_SIZE));

  const signOut = async () => {
    await supabase.auth.signOut();
    navigate(COLLEGE_LOGIN_PATH, { replace: true });
  };

  const NavLinks = ({ mobile = false }: { mobile?: boolean }) => (
    <nav className={cn("flex flex-col gap-1", mobile ? "p-4" : "p-3")}>
      <button
        type="button"
        onClick={() => {
          setSection("dashboard");
          setNavOpen(false);
        }}
        className={cn(
          "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-bold transition-colors text-left",
          section === "dashboard"
            ? "bg-emerald-600 text-white shadow-md"
            : "text-slate-600 hover:bg-slate-100"
        )}
      >
        <LayoutDashboard className="size-4 shrink-0" />
        Dashboard
      </button>
      <button
        type="button"
        onClick={() => {
          setSection("students");
          setNavOpen(false);
        }}
        className={cn(
          "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-bold transition-colors text-left",
          section === "students"
            ? "bg-emerald-600 text-white shadow-md"
            : "text-slate-600 hover:bg-slate-100"
        )}
      >
        <Users className="size-4 shrink-0" />
        Students
      </button>
      <button
        type="button"
        onClick={() => {
          setSection("profile");
          setNavOpen(false);
        }}
        className={cn(
          "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-bold transition-colors text-left",
          section === "profile"
            ? "bg-emerald-600 text-white shadow-md"
            : "text-slate-600 hover:bg-slate-100"
        )}
      >
        <User className="size-4 shrink-0" />
        Profile
      </button>
      <button
        type="button"
        onClick={() => {
          setSection("security");
          setNavOpen(false);
        }}
        className={cn(
          "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-bold transition-colors text-left",
          section === "security"
            ? "bg-emerald-600 text-white shadow-md"
            : "text-slate-600 hover:bg-slate-100"
        )}
      >
        <Shield className="size-4 shrink-0" />
        Security
      </button>
    </nav>
  );

  if (bootstrapLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <Loader2 className="size-10 animate-spin text-emerald-600" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-100 flex text-slate-900">
      <aside className="hidden md:flex w-56 flex-col border-r border-slate-200 bg-white shadow-sm shrink-0">
        <div className="p-4 border-b border-slate-100">
          <p className="text-[10px] font-black uppercase tracking-widest text-emerald-600">College portal</p>
          <p className="font-black text-sm mt-0.5">EzyIntern</p>
        </div>
        <NavLinks />
        <div className="mt-auto p-3 border-t border-slate-100">
          <Button variant="outline" size="sm" className="w-full gap-2 font-semibold" onClick={signOut}>
            <LogOut className="size-4" /> Sign out
          </Button>
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-14 md:h-16 border-b border-slate-200 bg-white flex items-center justify-between px-4 md:px-6 shrink-0 shadow-sm">
          <div className="flex items-center gap-3 min-w-0">
            <Sheet open={navOpen} onOpenChange={setNavOpen}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" className="md:hidden shrink-0">
                  <Menu className="size-5" />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="w-64 p-0 flex flex-col">
                <div className="p-4 border-b">
                  <p className="text-[10px] font-black uppercase text-emerald-600">College portal</p>
                  <p className="font-black">EzyIntern</p>
                </div>
                <NavLinks mobile />
                <div className="mt-auto p-4 border-t">
                  <Button variant="outline" className="w-full gap-2" onClick={signOut}>
                    <LogOut className="size-4" /> Sign out
                  </Button>
                </div>
              </SheetContent>
            </Sheet>
            <div className="min-w-0">
              <h1 className="font-black text-base md:text-lg truncate capitalize">
                {section}
              </h1>
              <p className="text-[10px] md:text-xs text-slate-500 truncate hidden sm:block">
                {assignedColleges.length
                  ? `${allScopeTotal} students · ${selectedCollegeLabel}`
                  : "No colleges assigned — contact your administrator"}
              </p>
            </div>
          </div>
          <Button variant="outline" size="sm" className="gap-2 font-semibold hidden md:flex" onClick={signOut}>
            <LogOut className="size-4" /> Sign out
          </Button>
        </header>

        <main className="flex-1 overflow-auto p-4 md:p-6">
          {assignedColleges.length > 1 && (
            <Card className="p-4 mb-4 border-none shadow-elegant bg-white max-w-6xl mx-auto">
              <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                <div className="flex items-center gap-2 text-sm font-bold text-slate-700 shrink-0">
                  <Filter className="size-4 text-emerald-600" />
                  Filter by college
                </div>
                <Select value={collegeFilter} onValueChange={setCollegeFilter}>
                  <SelectTrigger className="h-10 max-w-md bg-slate-50 font-semibold">
                    <GraduationCap className="size-4 mr-2 text-emerald-600 shrink-0" />
                    <SelectValue placeholder="All colleges" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">
                      All colleges ({allScopeTotal} students)
                    </SelectItem>
                    {directoryCollegeFilters.map(({ directoryName, count }) => (
                      <SelectItem key={directoryName} value={directoryName}>
                        {displayCollegeName(directoryName) || directoryName} ({count} students)
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </Card>
          )}

          {/* ── Dashboard section ── */}
          {section === "dashboard" && (
            <div className="space-y-6 max-w-6xl mx-auto">
              {collegeFilter !== "all" && (
                <p className="text-sm font-semibold text-emerald-800 bg-emerald-50 border border-emerald-100 rounded-xl px-4 py-3">
                  Showing data for <span className="font-black">{selectedCollegeLabel}</span> —{" "}
                  <span className="font-black">{dashTotal}</span> enrolled student{dashTotal === 1 ? "" : "s"}
                </p>
              )}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
                <Card className="p-4 border-none shadow-elegant bg-white">
                  <p className="text-[10px] font-black uppercase text-slate-400">Total students</p>
                  <p className="text-2xl md:text-3xl font-black text-emerald-700 mt-1">
                    {collegeFilter === "all" ? allScopeTotal : dashTotal}
                  </p>
                </Card>
                <Card className="p-4 border-none shadow-elegant bg-white">
                  <p className="text-[10px] font-black uppercase text-slate-400">Male</p>
                  <p className="text-2xl md:text-3xl font-black text-sky-600 mt-1">{maleN}</p>
                </Card>
                <Card className="p-4 border-none shadow-elegant bg-white">
                  <p className="text-[10px] font-black uppercase text-slate-400">Female</p>
                  <p className="text-2xl md:text-3xl font-black text-pink-600 mt-1">{femaleN}</p>
                </Card>
                <Card className="p-4 border-none shadow-elegant bg-white">
                  <p className="text-[10px] font-black uppercase text-slate-400">Other / not set</p>
                  <p className="text-2xl md:text-3xl font-black text-slate-500 mt-1">{otherGenderN}</p>
                </Card>
              </div>

              <div className="grid lg:grid-cols-2 gap-6">
                <Card className="p-4 md:p-6 border-none shadow-elegant bg-white">
                  <h2 className="text-xs font-black uppercase tracking-widest text-slate-500 mb-4">Gender</h2>
                  <div className="h-[260px] w-full flex items-center justify-center">
                    {statsLoading ? (
                      <Loader2 className="size-8 animate-spin text-emerald-600" />
                    ) : genderData.length === 0 || dashTotal === 0 ? (
                      <p className="text-sm text-slate-500 py-12 text-center w-full">No data yet</p>
                    ) : (
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={genderData}
                            dataKey="value"
                            nameKey="name"
                            cx="50%"
                            cy="50%"
                            innerRadius={52}
                            outerRadius={88}
                            paddingAngle={2}
                          >
                            {genderData.map((e) => (
                              <Cell key={e.name} fill={GENDER_COLORS[e.name] || "#94a3b8"} />
                            ))}
                          </Pie>
                          <Tooltip formatter={(v: number) => [`${v} students`, "Count"]} />
                          <Legend />
                        </PieChart>
                      </ResponsiveContainer>
                    )}
                  </div>
                </Card>

                <Card className="p-4 md:p-6 border-none shadow-elegant bg-white">
                  <h2 className="text-xs font-black uppercase tracking-widest text-slate-500 mb-4">
                    Program (B.Com / B.Sc / B.A)
                  </h2>
                  <div className="h-[260px] w-full flex items-center justify-center">
                    {statsLoading ? (
                      <Loader2 className="size-8 animate-spin text-emerald-600" />
                    ) : streamData.length === 0 || dashTotal === 0 ? (
                      <p className="text-sm text-slate-500 py-12 text-center w-full">No data yet</p>
                    ) : (
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={streamData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" className="stroke-slate-100" />
                          <XAxis dataKey="name" tick={{ fontSize: 11, fontWeight: 700 }} />
                          <YAxis allowDecimals={false} tick={{ fontSize: 11 }} width={36} />
                          <Tooltip formatter={(v: number) => [`${v}`, "Students"]} />
                          <Bar dataKey="value" radius={[6, 6, 0, 0]} name="Students">
                            {streamData.map((e) => (
                              <Cell key={e.name} fill={STREAM_COLORS[e.name] || "#94a3b8"} />
                            ))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    )}
                  </div>
                </Card>
              </div>
            </div>
          )}

          {/* ── Students tab (server-side paginated) ── */}
          {section === "students" && (
            <div className="max-w-6xl mx-auto space-y-4">
              {assignedColleges.length > 1 && (
                <Card className="p-4 border-none shadow-elegant bg-white">
                  <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                    <Label className="text-xs font-black uppercase text-slate-500 shrink-0">
                      College
                    </Label>
                    <Select value={collegeFilter} onValueChange={setCollegeFilter}>
                      <SelectTrigger className="h-10 max-w-md bg-slate-50 font-semibold">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All colleges ({allScopeTotal})</SelectItem>
                        {directoryCollegeFilters.map(({ directoryName, count }) => (
                          <SelectItem key={directoryName} value={directoryName}>
                            {displayCollegeName(directoryName) || directoryName} ({count})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </Card>
              )}

              <Card className="p-4 md:p-6 border-none shadow-elegant bg-white">
                <div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between mb-4">
                  <div className="relative flex-1 max-w-md">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-slate-400" />
                    <Input
                      placeholder="Search name, email, phone, course…"
                      className="pl-10 h-10 bg-slate-50 border-slate-200"
                      value={search}
                      onChange={(e) => handleSearchChange(e.target.value)}
                    />
                  </div>
                  <p className="text-xs font-bold text-slate-500 uppercase tracking-wider whitespace-nowrap">
                    {pageTotal} match{pageTotal === 1 ? "" : "es"} · Page {page + 1} / {pageCount}
                  </p>
                </div>

                <div className="rounded-lg border border-slate-100 overflow-x-auto relative">
                  {/* Page loading overlay */}
                  {pageLoading && (
                    <div className="absolute inset-0 bg-white/70 flex items-center justify-center z-10 rounded-lg">
                      <Loader2 className="size-6 animate-spin text-emerald-600" />
                    </div>
                  )}
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-slate-50/80">
                        <TableHead className="text-[10px] font-black uppercase">Name</TableHead>
                        <TableHead className="text-[10px] font-black uppercase">Gender</TableHead>
                        <TableHead className="text-[10px] font-black uppercase">College</TableHead>
                        <TableHead className="text-[10px] font-black uppercase">Course</TableHead>
                        <TableHead className="text-[10px] font-black uppercase">Program</TableHead>
                        <TableHead className="text-[10px] font-black uppercase">Reg. ID</TableHead>
                        <TableHead className="text-[10px] font-black uppercase w-[80px]" />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {!pageLoading && pageStudents.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={7} className="text-center py-12 text-slate-500 text-sm">
                            No students match your search.
                          </TableCell>
                        </TableRow>
                      ) : (
                        pageStudents.map((s) => (
                          <TableRow
                            key={s.id}
                            className="cursor-pointer hover:bg-emerald-50/40"
                            onClick={() => setDetailStudent(s)}
                          >
                            <TableCell className="font-medium text-sm">{s.full_name || "—"}</TableCell>
                            <TableCell className="text-sm">{genderBucket(s.gender)}</TableCell>
                            <TableCell
                              className="text-sm max-w-[160px] truncate text-slate-700"
                              title={s.college_name}
                            >
                              {displayCollegeName(s.college_name) || "—"}
                            </TableCell>
                            <TableCell className="text-sm max-w-[140px] truncate" title={s.course}>
                              {s.course || "—"}
                            </TableCell>
                            <TableCell className="text-sm">
                              <span className="font-semibold text-emerald-800">{programStream(s)}</span>
                            </TableCell>
                            <TableCell className="text-xs font-mono">{s.registration_id || "—"}</TableCell>
                            <TableCell className="text-right">
                              <Button variant="ghost" size="sm" className="text-emerald-700 font-bold text-xs">
                                View
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>

                {/* ── Pagination controls ── */}
                <div className="flex items-center justify-between gap-4 mt-4 pt-4 border-t border-slate-100">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page <= 0 || pageLoading}
                    onClick={() => setPage((p) => Math.max(0, p - 1))}
                    className="gap-1 font-bold"
                  >
                    <ChevronLeft className="size-4" /> Previous
                  </Button>
                  <span className="text-xs text-slate-500 font-medium">
                    Showing {pageTotal === 0 ? 0 : page * PAGE_SIZE + 1}–
                    {Math.min((page + 1) * PAGE_SIZE, pageTotal)} of {pageTotal}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page >= pageCount - 1 || pageLoading}
                    onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
                    className="gap-1 font-bold"
                  >
                    Next <ChevronRight className="size-4" />
                  </Button>
                </div>
              </Card>
            </div>
          )}

          {section === "profile" && (
            <div className="max-w-3xl mx-auto space-y-6">
              <SharedProfilePanel
                profileId={sessionUser?.id}
                profileEmail={sessionUser?.email}
                profileName="College Admin"
                profileImageUrl={undefined}
                roleLabel="Administrator"
                fields={[
                  { label: "Email Address", value: sessionUser?.email }
                ]}
                isActive={section === "profile"}
              />
            </div>
          )}

          {section === "security" && (
            <div className="max-w-3xl mx-auto">
              <StaffSecurityPanel
                isActive={section === "security"}
              />
            </div>
          )}
        </main>
      </div>

      {/* ── Student detail dialog ── */}
      <Dialog open={!!detailStudent} onOpenChange={(o) => !o && setDetailStudent(null)}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-left">Student details</DialogTitle>
          </DialogHeader>
          {detailStudent && (
            <dl className="grid grid-cols-1 gap-3 text-sm">
              {[
                ["Full name", detailStudent.full_name],
                ["Email", detailStudent.email],
                ["Phone", detailStudent.contact_number],
                ["Gender", genderBucket(detailStudent.gender)],
                ["Parent / guardian", detailStudent.parent_name],
                ["University", detailStudent.university_name],
                ["College", displayCollegeName(detailStudent.college_name) || detailStudent.college_name],
                ["Degree", detailStudent.degree],
                ["Department", detailStudent.department],
                ["Course", detailStudent.course],
                ["Program group", programStream(detailStudent)],
                ["Semester", detailStudent.class_semester],
                ["Session", detailStudent.academic_session],
                ["Roll number", detailStudent.roll_number],
                ["Registration ID", detailStudent.registration_id],
                ["Internship domain", detailStudent.internship_domain],
                ["Status", detailStudent.status],
                ["Emergency contact", detailStudent.emergency_name],
                ["Emergency phone", detailStudent.emergency_contact],
                ["Relation", detailStudent.emergency_relation],
                ["Joined", detailStudent.created_at ? new Date(detailStudent.created_at).toLocaleString() : "—"],
              ].map(([label, val]) => (
                <div key={String(label)} className="flex flex-col sm:flex-row sm:gap-3 border-b border-slate-100 pb-2 last:border-0">
                  <dt className="text-[10px] font-black uppercase text-slate-400 shrink-0 sm:w-36">{label}</dt>
                  <dd className="font-medium text-slate-800 break-words">{val != null && val !== "" ? String(val) : "—"}</dd>
                </div>
              ))}
            </dl>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
