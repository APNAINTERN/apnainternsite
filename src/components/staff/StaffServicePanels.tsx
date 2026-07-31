import { useModuleStudentsLight } from "@/hooks/useModuleStudentsLight";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { AssignmentManagementPanel } from "@/components/admin/AssignmentManagementPanel";
import { CertificateManagementPanel } from "@/components/admin/CertificateManagementPanel";
import { ClassLinkManagementPanel } from "@/components/admin/ClassLinkManagementPanel";
import { EngineeringDirectoryPanel } from "@/components/admin/EngineeringDirectoryPanel";
import { NotificationManagementPanel } from "@/components/admin/NotificationManagementPanel";
import { IdCardManagementPanel } from "@/components/admin/IdCardManagementPanel";
import { LearningMaterialsPanel } from "@/components/admin/LearningMaterialsPanel";
import { FeesManagementPanel } from "@/components/admin/FeesManagementPanel";
import { CourseManagementPanel } from "@/components/admin/CourseManagementPanel";
import { ReferralsPanel } from "@/components/admin/ReferralsPanel";
import { CollegeRostersPanel } from "@/components/admin/CollegeRostersPanel";
import { EmployeeAttendancePanel, type StaffEmployeeOption } from "@/components/admin/EmployeeAttendancePanel";
import { StudentAttendancePanel } from "@/components/admin/StudentAttendancePanel";
import type { StudentDirectoryStudent } from "@/components/admin/StudentDirectoryActionsMenu";
import EngineeringManagement from "@/pages/EngineeringManagement";
import NonEngineeringManagement from "@/pages/NonEngineeringManagement";
import { fetchAllCollegesCatalog } from "@/lib/institutionCatalog";
import {
  fetchAllAttendanceCountsMap,
} from "@/lib/attendanceAdmin";
import {
  calcAttendancePercentage,
  getStudentRecordId,
  normalizeStudentId,
} from "@/lib/attendanceStats";
import { programmeAttendanceDayBasis } from "@/lib/internshipProgramme";
import type { ClassLinkRow } from "@/lib/classLinkTargeting";
import { Badge } from "@/components/ui/badge";
import { StudentProfileViewDialog } from "@/components/admin/StudentProfileViewDialog";
import { enrichStudentProfileForDisplay, studentMetadataOf } from "@/lib/studentProfileDisplay";
import { parseJsonField } from "@/lib/parseJsonField";
import { Building2, Loader2, Mail, Settings, Store, Users } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { sendBulkCustomMail } from "@/lib/bulkCustomMailSend";

type Catalog = {
  unis: { id: string; name: string }[];
  colleges: { id: string; name: string; university_id: string }[];
  domains: { id: string; name: string }[];
};

async function loadCatalog(): Promise<Catalog> {
  const [{ data: unis }, colleges, { data: domains }] = await Promise.all([
    supabase.from("universities").select("id,name").order("name"),
    fetchAllCollegesCatalog(supabase),
    supabase.from("internship_domains").select("id,name").order("name"),
  ]);
  return {
    unis: (unis || []) as Catalog["unis"],
    colleges: (colleges || []) as Catalog["colleges"],
    domains: (domains || []) as Catalog["domains"],
  };
}

function useStaffCatalog(active: boolean) {
  const [catalog, setCatalog] = useState<Catalog>({ unis: [], colleges: [], domains: [] });
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    (async () => {
      try {
        const c = await loadCatalog();
        if (!cancelled) {
          setCatalog(c);
          setReady(true);
        }
      } catch (e: any) {
        if (!cancelled) toast.error(e?.message || "Failed to load catalog");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [active]);

  return { catalog, ready };
}

export function StaffAssignmentsPanel({
  currentUserId,
  isActive,
}: {
  currentUserId: string | null;
  isActive: boolean;
}) {
  const { catalog, ready } = useStaffCatalog(isActive);
  const [assignments, setAssignments] = useState<any[]>([]);

  const refresh = useCallback(async () => {
    const { data, error } = await supabase
      .from("assignments")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throw error;
    setAssignments(data || []);
  }, []);

  useEffect(() => {
    if (isActive) void refresh().catch((e) => toast.error(e.message));
  }, [isActive, refresh]);

  if (!ready) {
    return (
      <div className="py-16 text-center text-muted-foreground">
        <Loader2 className="size-6 animate-spin inline" />
      </div>
    );
  }

  return (
    <AssignmentManagementPanel
      assignments={assignments}
      unis={catalog.unis}
      colleges={catalog.colleges}
      domains={catalog.domains}
      currentUserId={currentUserId || undefined}
      onRefresh={refresh}
      onOpenAiBuilder={() => toast.message("AI builder is available in the full Admin panel")}
      isActive={isActive}
    />
  );
}

export function StaffCertificatesPanel({ isActive }: { isActive: boolean }) {
  const { catalog, ready } = useStaffCatalog(isActive);
  const { students, loading: studentsLoading, reload } = useModuleStudentsLight(supabase, isActive);
  const [certs, setCerts] = useState<any[]>([]);
  const retriedEmptyRef = useRef(false);

  const refreshCerts = useCallback(async () => {
    const { data } = await supabase.from("certificates").select("*").order("created_at", { ascending: false }).limit(500);
    setCerts(data || []);
  }, []);

  useEffect(() => {
    if (!isActive) {
      retriedEmptyRef.current = false;
      return;
    }
    void refreshCerts();
  }, [isActive, refreshCerts]);

  useEffect(() => {
    if (!isActive || studentsLoading || students.length > 0 || retriedEmptyRef.current) return;
    retriedEmptyRef.current = true;
    void reload().catch((err) => {
      toast.error(
        err instanceof Error ? err.message : "Could not load students for certificate generation"
      );
    });
  }, [isActive, students.length, studentsLoading, reload]);

  if (!ready) {
    return (
      <div className="py-16 text-center text-muted-foreground">
        <Loader2 className="size-6 animate-spin inline" />
      </div>
    );
  }

  return (
    <CertificateManagementPanel
      students={students as any[]}
      certificates={certs}
      domains={catalog.domains}
      unis={catalog.unis}
      colleges={catalog.colleges}
      onRefreshCertificates={refreshCerts}
      onLogAction={async () => {}}
      isActive={isActive}
      studentsLoading={studentsLoading}
      onRequestStudents={() =>
        void reload().catch((err) => {
          toast.error(
            err instanceof Error ? err.message : "Could not load students for certificates"
          );
        })
      }
    />
  );
}

export function StaffClassesPanel({
  currentUserId,
  isActive,
}: {
  currentUserId: string | null;
  isActive: boolean;
}) {
  const { catalog, ready } = useStaffCatalog(isActive);
  const { students } = useModuleStudentsLight(supabase, isActive);
  const [classesList, setClassesList] = useState<ClassLinkRow[]>([]);

  const refresh = useCallback(async () => {
    const { data, error } = await supabase.from("classes").select("*").order("created_at", { ascending: false });
    if (error) throw error;
    setClassesList((data || []) as ClassLinkRow[]);
  }, []);

  useEffect(() => {
    if (isActive) void refresh().catch((e) => toast.error(e.message));
  }, [isActive, refresh]);

  if (!ready) {
    return (
      <div className="py-16 text-center text-muted-foreground">
        <Loader2 className="size-6 animate-spin inline" />
      </div>
    );
  }

  return (
    <ClassLinkManagementPanel
      classesList={classesList}
      domains={catalog.domains}
      unis={catalog.unis}
      colleges={catalog.colleges}
      studentsForTargeting={students as any[]}
      currentUserId={currentUserId || undefined}
      onRefresh={refresh}
      onLogAction={async () => {}}
    />
  );
}

export function StaffNotificationsServicePanel({
  currentUserId,
  isActive,
}: {
  currentUserId: string | null;
  isActive: boolean;
}) {
  const { catalog, ready } = useStaffCatalog(isActive);
  const { students } = useModuleStudentsLight(supabase, isActive);
  const [notifications, setNotifications] = useState<any[]>([]);

  const refresh = useCallback(async () => {
    const { data } = await supabase.from("notifications").select("*").order("created_at", { ascending: false }).limit(100);
    setNotifications(data || []);
  }, []);

  useEffect(() => {
    if (isActive) void refresh();
  }, [isActive, refresh]);

  if (!ready) {
    return (
      <div className="py-16 text-center text-muted-foreground">
        <Loader2 className="size-6 animate-spin inline" />
      </div>
    );
  }

  return (
    <NotificationManagementPanel
      notifications={notifications}
      unis={catalog.unis}
      colleges={catalog.colleges}
      domains={catalog.domains}
      studentsForTargeting={students as any[]}
      currentUserId={currentUserId || undefined}
      onRefresh={refresh}
      isActive={isActive}
    />
  );
}

export function StaffEngineeringPanel({
  isActive,
  actions,
}: {
  isActive: boolean;
  actions?: {
    onViewDetails: (student: StudentDirectoryStudent) => void;
    onEditDetails: (student: StudentDirectoryStudent) => void;
    onResetPassword: (student: StudentDirectoryStudent) => void;
    onResendCredentials: (student: StudentDirectoryStudent) => void;
    onViewConsentLetter: (student: StudentDirectoryStudent) => void;
    onUploadConsentLetter: (student: StudentDirectoryStudent) => void;
    onViewLogbook: (student: StudentDirectoryStudent) => void;
    onDownloadAttendanceReport: (student: StudentDirectoryStudent) => void;
    onDownloadOfferLetter: (student: StudentDirectoryStudent) => void;
    onToggleBlock: (student: StudentDirectoryStudent) => void;
    onDelete: (student: StudentDirectoryStudent) => void;
  };
}) {
  const { catalog } = useStaffCatalog(isActive);
  const [viewOpen, setViewOpen] = useState(false);
  const [viewUser, setViewUser] = useState<Record<string, unknown> | null>(null);

  const openStudentViewDialog = async (student: Record<string, unknown>) => {
    if (actions?.onViewDetails) {
      actions.onViewDetails(student as StudentDirectoryStudent);
      return;
    }
    let row: Record<string, unknown> = { ...student };
    const id = String(row.id || "");
    if (id && !id.startsWith("reg-draft-") && !(row as { _isPreview?: boolean })._isPreview) {
      try {
        const { data } = await supabase.from("students").select("*").eq("id", id).maybeSingle();
        if (data) row = data as Record<string, unknown>;
      } catch {
        /* use partial row */
      }
    }
    const enriched = enrichStudentProfileForDisplay(row) || row;
    const meta =
      studentMetadataOf(enriched) ||
      parseJsonField(row.metadata) ||
      parseJsonField((row as { payload?: unknown }).payload);
    setViewUser({ ...enriched, metadata: meta });
    setViewOpen(true);
  };

  const stub = async () => {
    toast.message("Open the Students service for full student actions");
  };
  return (
    <>
      <EngineeringDirectoryPanel
        isActive={isActive}
        unis={catalog.unis}
        colleges={catalog.colleges}
        domains={catalog.domains}
        actions={
          actions || {
            onViewDetails: (s) => {
              void openStudentViewDialog(s as Record<string, unknown>);
            },
            onEditDetails: stub,
            onResetPassword: stub,
            onResendCredentials: stub,
            onViewConsentLetter: stub,
            onUploadConsentLetter: stub,
            onViewLogbook: stub,
            onDownloadAttendanceReport: stub,
            onDownloadOfferLetter: stub,
            onToggleBlock: stub,
            onDelete: stub,
          }
        }
      />
      <StudentProfileViewDialog
        open={viewOpen}
        onOpenChange={setViewOpen}
        selectedUser={viewUser}
      />
    </>
  );
}

export function StaffInstitutionsPanel({ isActive }: { isActive: boolean }) {
  const { catalog, ready } = useStaffCatalog(isActive);

  if (!ready) {
    return (
      <div className="py-16 text-center text-muted-foreground">
        <Loader2 className="size-6 animate-spin inline" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-black flex items-center gap-2">
          <Building2 className="size-5 text-primary" /> Academic Partners
        </h2>
        <p className="text-sm text-muted-foreground mt-1">Universities and colleges in the system.</p>
      </div>
      <div className="grid lg:grid-cols-2 gap-6">
        <Card className="p-4 border-none shadow-elegant overflow-hidden">
          <h3 className="font-bold mb-3">Universities ({catalog.unis.length})</h3>
          <div className="max-h-96 overflow-auto rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {catalog.unis.map((u) => (
                  <TableRow key={u.id}>
                    <TableCell>{u.name}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </Card>
        <Card className="p-4 border-none shadow-elegant overflow-hidden">
          <h3 className="font-bold mb-3">Colleges ({catalog.colleges.length})</h3>
          <div className="max-h-96 overflow-auto rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {catalog.colleges.slice(0, 500).map((c) => (
                  <TableRow key={c.id}>
                    <TableCell>{c.name}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </Card>
      </div>
    </div>
  );
}

export function StaffCommsPanel({ isActive }: { isActive: boolean }) {
  const { catalog, ready } = useStaffCatalog(isActive);
  const { students, loading: studentsLoading } = useModuleStudentsLight(supabase, isActive);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [uniFilter, setUniFilter] = useState("all");
  const [collegeFilter, setCollegeFilter] = useState("all");
  const [domainFilter, setDomainFilter] = useState("all");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [sending, setSending] = useState(false);
  const [progress, setProgress] = useState(0);

  const filtered = useMemo(() => {
    return students.filter((s) => {
      if (uniFilter !== "all" && String(s.university_name || "") !== uniFilter) return false;
      if (collegeFilter !== "all" && String(s.college_name || "") !== collegeFilter) return false;
      if (domainFilter !== "all" && String(s.internship_domain || "") !== domainFilter) return false;
      return Boolean(String(s.email || "").trim());
    });
  }, [students, uniFilter, collegeFilter, domainFilter]);

  if (!isActive) return null;

  if (!ready) {
    return (
      <div className="py-16 text-center text-muted-foreground">
        <Loader2 className="size-6 animate-spin inline" />
      </div>
    );
  }

  const selectAllFiltered = () => {
    setSelectedIds(filtered.map((s) => String(s.id)));
    toast.success(`Selected ${filtered.length} student(s)`);
  };

  const send = async () => {
    const targets = filtered
      .filter((s) => selectedIds.includes(String(s.id)))
      .map((s) => String(s.email || "").trim())
      .filter(Boolean);
    if (!subject.trim() || !body.trim() || !targets.length) {
      toast.error("Subject, message, and at least one selected recipient are required");
      return;
    }
    setSending(true);
    setProgress(0);
    try {
      const result = await sendBulkCustomMail(targets, subject, body, (done) => setProgress(done));
      if (result.rateLimited) {
        toast.error(
          result.sent > 0
            ? `Rate limit after ${result.sent} sent. Wait, then retry remaining.`
            : "Mail rate limit — wait before retrying."
        );
      } else if (result.failed > 0) {
        toast.warning(`Sent ${result.sent} of ${targets.length}. ${result.failed} failed.`);
      } else {
        toast.success(`Sent to ${result.sent} recipients.`);
        setSubject("");
        setBody("");
        setSelectedIds([]);
      }
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Send failed");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="grid lg:grid-cols-3 gap-6">
      <Card className="lg:col-span-2 p-6 border-none shadow-elegant space-y-4">
        <div>
          <h2 className="text-xl font-black flex items-center gap-2">
            <Mail className="size-5 text-primary" /> Communications Center
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Same student pool as Admin ({studentsLoading ? "…" : students.length} enrolled).
          </p>
        </div>
        <div className="space-y-2">
          <Label>Email Subject</Label>
          <Input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Enter email subject" />
        </div>
        <div className="space-y-2">
          <Label>Message Content (text / basic HTML)</Label>
          <Textarea rows={10} value={body} onChange={(e) => setBody(e.target.value)} />
        </div>
        <div className="flex items-center justify-between pt-2 border-t">
          <div className="text-sm">
            <span className="text-muted-foreground">Recipients selected: </span>
            <span className="font-bold text-primary">{selectedIds.length}</span>
            {sending && (
              <span className="text-muted-foreground ml-2">
                Sending {progress}/{selectedIds.length}…
              </span>
            )}
          </div>
          <Button onClick={() => void send()} disabled={sending} className="font-bold">
            {sending && <Loader2 className="size-4 animate-spin mr-2" />}
            Send Bulk Email
          </Button>
        </div>
      </Card>

      <Card className="p-5 border-none shadow-elegant space-y-4">
        <h3 className="font-bold flex items-center gap-2">
          <Users className="size-4 text-primary" /> Target Selection
        </h3>
        <div className="space-y-2">
          <Label className="text-[10px] uppercase font-black text-muted-foreground">University</Label>
          <Select
            value={uniFilter}
            onValueChange={(v) => {
              setUniFilter(v);
              setCollegeFilter("all");
              setSelectedIds([]);
            }}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Universities</SelectItem>
              {catalog.unis.map((u) => (
                <SelectItem key={u.id} value={u.name}>
                  {u.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label className="text-[10px] uppercase font-black text-muted-foreground">College</Label>
          <Select
            value={collegeFilter}
            onValueChange={(v) => {
              setCollegeFilter(v);
              setSelectedIds([]);
            }}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Colleges</SelectItem>
              {catalog.colleges.slice(0, 400).map((c) => (
                <SelectItem key={c.id} value={c.name}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label className="text-[10px] uppercase font-black text-muted-foreground">Domain</Label>
          <Select
            value={domainFilter}
            onValueChange={(v) => {
              setDomainFilter(v);
              setSelectedIds([]);
            }}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Domains</SelectItem>
              {catalog.domains.map((d) => (
                <SelectItem key={d.id} value={d.name}>
                  {d.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <p className="text-xs text-muted-foreground">
          Matching with email: <span className="font-bold text-foreground">{filtered.length}</span>
        </p>
        <div className="flex gap-2">
          <Button type="button" variant="outline" size="sm" className="font-bold" onClick={selectAllFiltered}>
            Select all filtered
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setSelectedIds([])}
          >
            Clear
          </Button>
        </div>
      </Card>
    </div>
  );
}

export function StaffIdCardsPanel({ isActive }: { isActive: boolean }) {
  if (!isActive) return null;
  return <IdCardManagementPanel />;
}

export function StaffUploadsPanel({
  currentUserId,
  isActive,
}: {
  currentUserId: string | null;
  isActive: boolean;
}) {
  const { catalog, ready } = useStaffCatalog(isActive);
  const { students } = useModuleStudentsLight(supabase, isActive);

  if (!ready) {
    return (
      <div className="py-16 text-center text-muted-foreground">
        <Loader2 className="size-6 animate-spin inline" />
      </div>
    );
  }

  return (
    <LearningMaterialsPanel
      unis={catalog.unis}
      colleges={catalog.colleges}
      domains={catalog.domains}
      currentUserId={currentUserId || undefined}
      isActive={isActive}
      studentsForTargeting={students as any[]}
    />
  );
}

export function StaffFeesPanel({ isActive }: { isActive: boolean }) {
  if (!isActive) return null;
  return <FeesManagementPanel onLogAction={async () => {}} />;
}

export function StaffCoursesPanel({ isActive }: { isActive: boolean }) {
  if (!isActive) return null;
  return <CourseManagementPanel onLogAction={async () => {}} />;
}

export function StaffReferralsPanel({ isActive }: { isActive: boolean }) {
  if (!isActive) return null;
  return <ReferralsPanel />;
}

export function StaffCollegeRostersPanel({ isActive }: { isActive: boolean }) {
  if (!isActive) return null;
  return <CollegeRostersPanel />;
}

export function StaffEmployeeAttendanceStandalonePanel({
  currentUserId,
  isActive,
}: {
  currentUserId: string | null;
  isActive: boolean;
}) {
  const [employees, setEmployees] = useState<StaffEmployeeOption[]>([]);

  useEffect(() => {
    if (!isActive) return;
    (async () => {
      try {
        const { data } = await supabase
          .from("admin_staff")
          .select("id,email,full_name")
          .order("full_name");
        setEmployees(
          (data || []).map((s) => ({
            id: s.id,
            email: s.email,
            full_name: s.full_name,
          }))
        );
      } catch {
        /* ignore */
      }
    })();
  }, [isActive]);

  return (
    <EmployeeAttendancePanel
      employees={employees}
      currentUserId={currentUserId}
      isActive={isActive}
    />
  );
}

export function StaffSettingsPanel({ isActive }: { isActive: boolean }) {
  const [config, setConfig] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!isActive) return;
    setLoading(true);
    (async () => {
      try {
        const { data } = await supabase.from("site_config").select("key,value").order("key");
        const map: Record<string, string> = {};
        for (const row of data || []) {
          map[row.key] = String(row.value ?? "");
        }
        setConfig(map);
      } catch {
        /* ignore */
      } finally {
        setLoading(false);
      }
    })();
  }, [isActive]);

  if (!isActive) return null;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-black flex items-center gap-2">
          <Settings className="size-5 text-primary" /> System Settings
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          Read-only view of site configuration. Contact an admin to make changes.
        </p>
      </div>
      <Card className="p-4 border-none shadow-elegant overflow-hidden">
        {loading ? (
          <div className="py-16 text-center text-muted-foreground">
            <Loader2 className="size-6 animate-spin inline" />
          </div>
        ) : Object.keys(config).length === 0 ? (
          <p className="text-sm text-muted-foreground py-8 text-center">No configuration entries found.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Key</TableHead>
                <TableHead>Value</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {Object.entries(config).map(([key, value]) => (
                <TableRow key={key}>
                  <TableCell className="font-mono text-xs font-bold">{key}</TableCell>
                  <TableCell className="text-sm break-all">{value || "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>
    </div>
  );
}

export function StaffEngineeringManagementPanel({ isActive }: { isActive: boolean }) {
  if (!isActive) return null;
  return <EngineeringManagement embedded backTo="/staff-dashboard" />;
}

export function StaffNonEngineeringManagementPanel({ isActive }: { isActive: boolean }) {
  if (!isActive) return null;
  return <NonEngineeringManagement embedded backTo="/staff-dashboard" />;
}

/** Staff attendance uses the same Admin StudentAttendancePanel UI + student light list. */
export function StaffAttendanceTrackingPanel({
  currentUserId,
  isActive,
}: {
  currentUserId: string | null;
  isActive: boolean;
}) {
  return <StudentAttendancePanel currentUserId={currentUserId} isActive={isActive} />;
}

export function StaffCybercafePanel({ isActive }: { isActive: boolean }) {
  const [cafes, setCafes] = useState<
    Array<{ id: string; shop_name: string; email: string; status: string; phone?: string | null }>
  >([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!isActive) return;
    setLoading(true);
    (async () => {
      try {
        const { data, error } = await supabase
          .from("cybercafe_profiles")
          .select("id, shop_name, email, status, phone")
          .order("created_at", { ascending: false })
          .limit(200);
        if (error) throw error;
        setCafes((data || []) as typeof cafes);
      } catch (e: unknown) {
        toast.error(e instanceof Error ? e.message : "Failed to load cyber cafes");
        setCafes([]);
      } finally {
        setLoading(false);
      }
    })();
  }, [isActive]);

  const setStatus = async (id: string, status: string) => {
    try {
      const { error } = await supabase.from("cybercafe_profiles").update({ status }).eq("id", id);
      if (error) throw error;
      setCafes((prev) => prev.map((c) => (c.id === id ? { ...c, status } : c)));
      toast.success(`Marked ${status}`);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Update failed");
    }
  };

  if (!isActive) return null;

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-black flex items-center gap-2">
          <Store className="size-5 text-primary" /> Cyber Cafes
        </h2>
        <p className="text-sm text-muted-foreground mt-1">Review and approve partner cyber café accounts.</p>
      </div>
      <Card className="border-none shadow-elegant overflow-hidden">
        {loading ? (
          <div className="py-16 text-center text-muted-foreground">
            <Loader2 className="size-6 animate-spin inline" />
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Shop</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {cafes.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-center py-12 text-muted-foreground">
                    No cyber cafes found.
                  </TableCell>
                </TableRow>
              ) : (
                cafes.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="font-semibold text-sm">{c.shop_name}</TableCell>
                    <TableCell className="text-xs">{c.email}</TableCell>
                    <TableCell>
                      <Badge variant="secondary" className="capitalize">
                        {c.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right space-x-2">
                      <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => void setStatus(c.id, "approved")}>
                        Approve
                      </Button>
                      <Button size="sm" variant="ghost" className="h-8 text-xs text-destructive" onClick={() => void setStatus(c.id, "rejected")}>
                        Reject
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        )}
      </Card>
    </div>
  );
}

