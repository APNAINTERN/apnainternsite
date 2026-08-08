import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Briefcase,
  Building2,
  Calendar,
  Filter,
  GraduationCap,
  Loader2,
  Search,
  Wrench,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import { BEU_BRANCHES, BEU_COURSES } from "@/lib/beuRegistration";
import { fetchEngineeringDirectoryPage, hydrateStudentEditWithEngineeringDetails } from "@/lib/beuDetails";
import {
  aggregateEngineeringCatalogOptions,
  fetchAllEngineeringConfigs,
} from "@/lib/engineeringConfig";
import { InternshipModeFilterSelect } from "@/components/admin/InternshipModeFilterSelect";
import {
  StudentDirectoryActionsMenu,
  type StudentDirectoryStudent,
} from "@/components/admin/StudentDirectoryActionsMenu";
import { isBeuStudent } from "@/lib/feeRules";
import { collegesForUniversity } from "@/lib/institutionCatalog";

const PAGE_SIZE = 50;

const MOCK_PREVIEW_ROW: Record<string, unknown> = {
  id: "00000000-0000-4000-8000-00000000beu1",
  full_name: "Arjun Kumar (Sample Preview)",
  email: "arjun.kumar.mock@beu-demo.ezyintern.in",
  contact_number: "9876543210",
  university_name: "Bihar Engineering University (BEU)",
  college_name: "Government Engineering College, Patna",
  registration_id: "API/INT/2026/00001",
  roll_number: "BEU-CSE-2024-1042",
  created_at: new Date().toISOString(),
  status: "Active",
  beu_course: "B.Tech",
  beu_branch: "Computer Science & Engineering",
  beu_specialization: "Artificial Intelligence",
  beu_section_duration: "6 Weeks",
  beu_domain: "Web Development",
  beu_mode: "Online",
  _isPreview: true,
};

type CatalogItem = { id: string; name: string };
type CollegeItem = { id: string; name: string; university_id: string };

export type EngineeringDirectoryActions = {
  onViewDetails: (student: StudentDirectoryStudent) => void | Promise<void>;
  onEditDetails: (student: StudentDirectoryStudent) => void | Promise<void>;
  onResetPassword: (student: StudentDirectoryStudent) => void | Promise<void>;
  onResendCredentials: (student: StudentDirectoryStudent) => void | Promise<void>;
  onViewConsentLetter: (student: StudentDirectoryStudent) => void | Promise<void>;
  onUploadConsentLetter: (student: StudentDirectoryStudent) => void | Promise<void>;
  onViewLogbook: (student: StudentDirectoryStudent) => void | Promise<void>;
  onDownloadAttendanceReport: (student: StudentDirectoryStudent) => void | Promise<void>;
  onDownloadOfferLetter: (student: StudentDirectoryStudent) => void | Promise<void>;
  onToggleBlock: (student: StudentDirectoryStudent) => void | Promise<void>;
  onDelete: (student: StudentDirectoryStudent) => void | Promise<void>;
};

type Props = {
  isActive?: boolean;
  domains?: CatalogItem[];
  unis?: CatalogItem[];
  colleges?: CollegeItem[];
  actions: EngineeringDirectoryActions;
};

export function EngineeringDirectoryPanel({
  isActive = true,
  domains = [],
  unis = [],
  colleges = [],
  actions,
}: Props) {
  const [search, setSearch] = useState("");
  const [domainFilter, setDomainFilter] = useState("all");
  const [uniFilter, setUniFilter] = useState("all");
  const [collegeFilter, setCollegeFilter] = useState("all");
  const [courseFilter, setCourseFilter] = useState("all");
  const [branchFilter, setBranchFilter] = useState("all");
  const [modeFilter, setModeFilter] = useState("all");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [page, setPage] = useState(0);
  const [rows, setRows] = useState<Array<Record<string, unknown>>>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [engConfigUnis, setEngConfigUnis] = useState<CatalogItem[]>([]);
  const [engCatalog, setEngCatalog] = useState(() =>
    aggregateEngineeringCatalogOptions([])
  );

  useEffect(() => {
    let cancelled = false;
    void fetchAllEngineeringConfigs(supabase)
      .then((configs) => {
        if (cancelled) return;
        const byId = new Map<string, CatalogItem>();
        for (const c of configs) {
          if (c.is_active === false) continue;
          const id = String(c.university_id || "").trim();
          const name = String(c.university_name || "").trim();
          if (id && name) byId.set(id, { id, name });
        }
        setEngConfigUnis([...byId.values()]);
        setEngCatalog(aggregateEngineeringCatalogOptions(configs));
      })
      .catch(() => {
        if (!cancelled) {
          setEngConfigUnis([]);
          setEngCatalog(aggregateEngineeringCatalogOptions([]));
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const engDomainOptions = useMemo(() => {
    if (engCatalog.domains.length > 0) {
      return engCatalog.domains.map((name) => ({ id: name, name }));
    }
    return domains;
  }, [engCatalog.domains, domains]);

  const engCourseOptions = useMemo(
    () => (engCatalog.courses.length ? engCatalog.courses : [...BEU_COURSES]),
    [engCatalog.courses]
  );

  const engBranchOptions = useMemo(() => {
    if (courseFilter !== "all" && engCatalog.branchesByCourse[courseFilter]?.length) {
      return engCatalog.branchesByCourse[courseFilter];
    }
    return engCatalog.branches.length ? engCatalog.branches : [...BEU_BRANCHES];
  }, [courseFilter, engCatalog]);

  /** BEU-pattern universities + every university configured in Eng. Management. */
  const engineeringUnis = useMemo(() => {
    const byId = new Map<string, CatalogItem>();
    for (const u of unis) {
      if (isBeuStudent(u.name)) byId.set(u.id, u);
    }
    for (const u of engConfigUnis) {
      byId.set(u.id, u);
      // Prefer catalog name from Admin `unis` when available.
      const fromAdmin = unis.find((x) => x.id === u.id);
      if (fromAdmin) byId.set(u.id, fromAdmin);
    }
    return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [unis, engConfigUnis]);

  const collegeOptions = useMemo(() => {
    if (uniFilter === "all") {
      const allowed = new Set(engineeringUnis.map((u) => u.id));
      return colleges
        .filter((c) => allowed.has(c.university_id))
        .sort((a, b) => a.name.localeCompare(b.name));
    }
    return collegesForUniversity(colleges, unis.length ? unis : engineeringUnis, uniFilter);
  }, [colleges, uniFilter, unis, engineeringUnis]);

  const directoryFilters = useMemo(
    () => ({
      search,
      domain: domainFilter,
      university: uniFilter,
      college: collegeFilter,
      course: courseFilter,
      branch: branchFilter,
      mode: modeFilter,
      startDate,
      endDate,
    }),
    [search, domainFilter, uniFilter, collegeFilter, courseFilter, branchFilter, modeFilter, startDate, endDate]
  );

  const hasActiveFilters =
    Boolean(search.trim()) ||
    domainFilter !== "all" ||
    uniFilter !== "all" ||
    collegeFilter !== "all" ||
    courseFilter !== "all" ||
    branchFilter !== "all" ||
    modeFilter !== "all" ||
    Boolean(startDate) ||
    Boolean(endDate);

  const showPreviewRow = !loading && rows.length === 0 && !hasActiveFilters;
  const displayRows = showPreviewRow ? [MOCK_PREVIEW_ROW] : rows;
  const displayTotal = showPreviewRow ? 1 : total;

  const loadPage = useCallback(async () => {
    if (!isActive) return;
    setLoading(true);
    try {
      const { rows: nextRows, total: nextTotal } = await fetchEngineeringDirectoryPage(
        supabase,
        page,
        PAGE_SIZE,
        directoryFilters
      );
      setRows(nextRows);
      setTotal(nextTotal);
    } catch (e: unknown) {
      const msg =
        e instanceof Error
          ? e.message
          : e && typeof e === "object" && "message" in e
            ? String((e as { message?: unknown }).message || "")
            : "";
      toast.error(msg || "Failed to load engineering directory");
      setRows([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [isActive, page, directoryFilters]);

  useEffect(() => {
    setPage(0);
  }, [directoryFilters]);

  useEffect(() => {
    const delay = search.trim() ? 300 : 0;
    const timer = setTimeout(() => {
      void loadPage();
    }, delay);
    return () => clearTimeout(timer);
  }, [loadPage, search]);

  const pageCount = Math.max(1, Math.ceil(displayTotal / PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);

  const resolveStudent = useCallback(async (row: Record<string, unknown>): Promise<StudentDirectoryStudent> => {
    const { data } = await supabase.from("students").select("*").eq("id", String(row.id)).maybeSingle();
    const base = (data || row) as Record<string, unknown>;
    // Keep directory beu_* fields if present, then hydrate from beu_details for Edit.
    const merged = {
      ...base,
      beu_course: row.beu_course ?? base.beu_course,
      beu_branch: row.beu_branch ?? base.beu_branch,
      beu_specialization: row.beu_specialization ?? base.beu_specialization,
      beu_section_type: row.beu_section_type ?? base.beu_section_type,
      beu_section_duration: row.beu_section_duration ?? base.beu_section_duration,
      beu_domain: row.beu_domain ?? base.beu_domain,
      beu_mode: row.beu_mode ?? base.beu_mode,
    };
    return (await hydrateStudentEditWithEngineeringDetails(
      supabase,
      merged
    )) as StudentDirectoryStudent;
  }, []);

  const runStudentAction = useCallback(
    async (
      row: Record<string, unknown>,
      handler: (student: StudentDirectoryStudent) => void | Promise<void>,
      refresh = false
    ) => {
      const student = await resolveStudent(row);
      await handler(student);
      if (refresh) void loadPage();
    },
    [loadPage, resolveStudent]
  );

  const resetFilters = () => {
    setSearch("");
    setDomainFilter("all");
    setUniFilter("all");
    setCollegeFilter("all");
    setCourseFilter("all");
    setBranchFilter("all");
    setModeFilter("all");
    setStartDate("");
    setEndDate("");
    setPage(0);
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold flex items-center gap-2">
          <Wrench className="size-6 text-primary" />
          Engineering Directory
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          BEU / Engineering students — filters and edit options use Engineering courses, branches, and domains only.
        </p>
      </div>

      <Card className="p-6 border-none shadow-elegant mb-6 bg-card/50 backdrop-blur-sm">
        <div className="grid md:grid-cols-3 lg:grid-cols-4 gap-4 mb-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <Input
              className="pl-9"
              placeholder="Name or email..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <Select value={domainFilter} onValueChange={setDomainFilter}>
            <SelectTrigger className="gap-2">
              <Briefcase className="size-4" />
              <SelectValue placeholder="All Domains" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Domains</SelectItem>
              {engDomainOptions.map((d) => (
                <SelectItem key={d.id} value={d.name}>
                  {d.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={uniFilter}
            onValueChange={(v) => {
              setUniFilter(v);
              setCollegeFilter("all");
            }}
          >
            <SelectTrigger className="gap-2">
              <Building2 className="size-4" />
              <SelectValue placeholder="All Universities" />
            </SelectTrigger>
            <SelectContent className="max-h-72">
              <SelectItem value="all">
                All Universities
                {engineeringUnis.length ? ` (${engineeringUnis.length})` : ""}
              </SelectItem>
              {engineeringUnis.map((u) => (
                <SelectItem key={u.id} value={u.name}>
                  {u.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={collegeFilter} onValueChange={setCollegeFilter}>
            <SelectTrigger className="gap-2">
              <GraduationCap className="size-4" />
              <SelectValue placeholder="All Colleges" />
            </SelectTrigger>
            <SelectContent className="max-h-72">
              <SelectItem value="all">
                All Colleges
                {uniFilter !== "all" ? ` (${collegeOptions.length})` : ""}
              </SelectItem>
              {collegeOptions.map((c) => (
                <SelectItem key={c.id} value={c.name}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4 items-end">
          <div className="space-y-1.5">
            <Label className="text-[10px] uppercase font-bold text-muted-foreground ml-1">Start Date</Label>
            <div className="relative">
              <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
              <Input
                type="date"
                className="pl-9"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-[10px] uppercase font-bold text-muted-foreground ml-1">End Date</Label>
            <div className="relative">
              <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
              <Input
                type="date"
                className="pl-9"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-[10px] uppercase font-bold text-muted-foreground ml-1">Mode</Label>
            <InternshipModeFilterSelect value={modeFilter} onValueChange={setModeFilter} />
          </div>
          <Button variant="outline" className="gap-2" onClick={resetFilters}>
            <Filter className="size-4" /> Reset Filters
          </Button>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4 items-end mt-4 pt-4 border-t">
          <div className="space-y-1.5">
            <Label className="text-[10px] uppercase font-bold text-muted-foreground ml-1">Course</Label>
            <Select
              value={courseFilter}
              onValueChange={(v) => {
                setCourseFilter(v);
                setBranchFilter("all");
              }}
            >
              <SelectTrigger className="h-9 text-xs">
                <SelectValue placeholder="All courses" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All courses</SelectItem>
                {engCourseOptions.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-[10px] uppercase font-bold text-muted-foreground ml-1">Branch</Label>
            <Select value={branchFilter} onValueChange={setBranchFilter}>
              <SelectTrigger className="h-9 text-xs">
                <SelectValue placeholder="All branches" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All branches</SelectItem>
                {engBranchOptions.map((b) => (
                  <SelectItem key={b} value={b}>
                    {b}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </Card>

      <Card className="border-none shadow-elegant overflow-hidden">
        {showPreviewRow ? (
          <div className="p-3 border-b bg-amber-50 text-amber-900 text-xs">
            Showing a <strong>sample preview row</strong> so you can see the layout. Run{" "}
            <code className="rounded bg-amber-100 px-1">supabase/seed_mock_beu_engineering_student.sql</code> in
            Supabase SQL Editor to add a real mock student with working actions.
          </div>
        ) : null}
        <div className="p-3 border-b bg-muted/20 flex items-center justify-between text-xs">
          <span className="font-bold">{displayTotal.toLocaleString()} engineering student(s)</span>
          {loading ? (
            <span className="inline-flex items-center gap-1 text-muted-foreground">
              <Loader2 className="size-3 animate-spin" /> Loading…
            </span>
          ) : null}
        </div>
        <Table>
          <TableHeader className="bg-muted/30">
            <TableRow>
              <TableHead>Student</TableHead>
              <TableHead>Institution</TableHead>
              <TableHead>Domain</TableHead>
              <TableHead>Joined</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading && rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-12 text-muted-foreground">
                  <Loader2 className="size-6 animate-spin mx-auto mb-2 text-primary" />
                  Loading engineering students…
                </TableCell>
              </TableRow>
            ) : (
              displayRows.map((row) => {
                const isPreview = Boolean(row._isPreview);
                return (
                <TableRow key={String(row.id)} className={isPreview ? "bg-amber-50/40" : undefined}>
                  <TableCell>
                    <div className="font-medium text-sm flex items-center gap-2">
                      {String(row.full_name || "—")}
                      {isPreview ? (
                        <Badge variant="outline" className="text-[9px] uppercase">
                          Sample
                        </Badge>
                      ) : null}
                    </div>
                    <div className="text-[10px] text-muted-foreground">{String(row.email || "")}</div>
                    <div className="text-[10px] text-muted-foreground">
                      {String(row.registration_id || row.roll_number || "")}
                    </div>
                  </TableCell>
                  <TableCell className="text-xs">
                    <div>{String(row.college_name || "—")}</div>
                    <div className="text-[10px] text-muted-foreground">
                      {String(row.university_name || "")}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary" className="text-[9px] uppercase">
                      {String(row.beu_domain || row.internship_domain || row.course || "Unassigned")}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {row.created_at ? new Date(String(row.created_at)).toLocaleDateString() : "—"}
                  </TableCell>
                  <TableCell className="text-right">
                    {isPreview ? (
                      <StudentDirectoryActionsMenu
                        student={row as StudentDirectoryStudent}
                        onViewDetails={() =>
                          toast.message("Sample preview only — run the BEU mock seed SQL for a real student.")
                        }
                        onEditDetails={() =>
                          toast.message("Sample preview only — run the BEU mock seed SQL for a real student.")
                        }
                        onResetPassword={() =>
                          toast.message("Sample preview only — run the BEU mock seed SQL for a real student.")
                        }
                        onResendCredentials={() =>
                          toast.message("Sample preview only — run the BEU mock seed SQL for a real student.")
                        }
                        onViewConsentLetter={() =>
                          toast.message("Sample preview only — run the BEU mock seed SQL for a real student.")
                        }
                        onUploadConsentLetter={() =>
                          toast.message("Sample preview only — run the BEU mock seed SQL for a real student.")
                        }
                        onViewLogbook={() =>
                          toast.message("Sample preview only — run the BEU mock seed SQL for a real student.")
                        }
                        onDownloadAttendanceReport={() =>
                          toast.message("Sample preview only — run the BEU mock seed SQL for a real student.")
                        }
                        onDownloadOfferLetter={() =>
                          toast.message("Sample preview only — run the BEU mock seed SQL for a real student.")
                        }
                        onToggleBlock={() =>
                          toast.message("Sample preview only — run the BEU mock seed SQL for a real student.")
                        }
                        onDelete={() =>
                          toast.message("Sample preview only — run the BEU mock seed SQL for a real student.")
                        }
                      />
                    ) : (
                      <StudentDirectoryActionsMenu
                        student={row as StudentDirectoryStudent}
                        onViewDetails={() => runStudentAction(row, actions.onViewDetails)}
                        onEditDetails={() => runStudentAction(row, actions.onEditDetails)}
                        onResetPassword={() => runStudentAction(row, actions.onResetPassword)}
                        onResendCredentials={() => runStudentAction(row, actions.onResendCredentials, true)}
                        onViewConsentLetter={() => runStudentAction(row, actions.onViewConsentLetter)}
                        onUploadConsentLetter={() => runStudentAction(row, actions.onUploadConsentLetter)}
                        onViewLogbook={() => runStudentAction(row, actions.onViewLogbook)}
                        onDownloadAttendanceReport={() =>
                          runStudentAction(row, actions.onDownloadAttendanceReport)
                        }
                        onDownloadOfferLetter={() => runStudentAction(row, actions.onDownloadOfferLetter)}
                        onToggleBlock={() => runStudentAction(row, actions.onToggleBlock, true)}
                        onDelete={() => runStudentAction(row, actions.onDelete, true)}
                      />
                    )}
                  </TableCell>
                </TableRow>
              );
              })
            )}
            {!loading && rows.length === 0 && hasActiveFilters && (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-12 text-muted-foreground">
                  No engineering students found.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
        {displayTotal > 0 && (
          <div className="p-3 border-t bg-muted/10 flex items-center justify-between text-xs">
            <span>
              Showing {safePage * PAGE_SIZE + 1} to {Math.min(displayTotal, (safePage + 1) * PAGE_SIZE)} of{" "}
              {displayTotal.toLocaleString()}
            </span>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={safePage === 0 || loading}
                onClick={() => setPage((p) => Math.max(0, p - 1))}
              >
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={safePage >= pageCount - 1 || loading}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
              </Button>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
