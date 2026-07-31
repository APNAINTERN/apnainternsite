import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  Calendar,
  Filter,
  Loader2,
  Search,
  UserPlus,
} from "lucide-react";
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
  StudentDirectoryActionsMenu,
  type StudentDirectoryStudent,
} from "@/components/admin/StudentDirectoryActionsMenu";
import { InternshipModeFilterSelect } from "@/components/admin/InternshipModeFilterSelect";
import { StudentLogbookDialog } from "@/components/admin/StudentLogbookDialog";
import { BulkUploadStudentBadge } from "@/components/BulkUploadStudentBadge";
import { parseJsonField } from "@/lib/parseJsonField";
import {
  fetchAdminStudentDirectoryPage,
  fetchSuperAdminUserIds,
} from "@/lib/adminStudentDirectory";
import { displayCollegeName } from "@/lib/collegeDisplay";
import { downloadStudentAttendanceReportPdf } from "@/lib/adminDownloadAttendanceReport";
import {
  getStudentConsentLetterUrl,
  saveAdminStudentConsentLetter,
} from "@/lib/studentDocuments";
import {
  fetchLatestStudentCredentialRow,
  generateTempPassword,
  getStudentDirectoryPassword,
} from "@/lib/studentCredentials";
import { assertSendMailOk, getSendMailApiUrl } from "@/lib/sendMailApi";
import { buildStudentCredentialLoginLink } from "@/lib/authRoutes";
import {
  isEngineeringUniversityName,
  resolveEngineeringUniversityNames,
} from "@/lib/studentTrack";

const PAGE_SIZE = 20;

type CatalogUni = { id: string; name: string };
type CatalogCollege = { id: string; name: string; university_id?: string };
type CatalogDomain = { id: string; name: string };

type Props = {
  isActive: boolean;
  /** Increment to force a directory refetch (e.g. after Add Registration). */
  refreshKey?: number;
  domains: CatalogDomain[];
  unis: CatalogUni[];
  colleges: CatalogCollege[];
  onViewDetails: (student: StudentDirectoryStudent) => void;
  onEditDetails: (student: StudentDirectoryStudent) => void;
  onResetPassword: (student: StudentDirectoryStudent) => void;
  onDownloadOfferLetter: (student: StudentDirectoryStudent) => void;
  onAddStudent?: () => void;
  onLogAction?: (
    action_type: string,
    entity_type: string,
    description: string,
    metadata?: Record<string, unknown>
  ) => Promise<void> | void;
  /** Expose action bag for Engineering directory parity. */
  onActionsReady?: (actions: {
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
  }) => void;
};

export function StaffStudentDirectoryPanel({
  isActive,
  refreshKey = 0,
  domains,
  unis,
  colleges,
  onViewDetails,
  onEditDetails,
  onResetPassword,
  onDownloadOfferLetter,
  onAddStudent,
  onLogAction,
  onActionsReady,
}: Props) {
  const [students, setStudents] = useState<Record<string, unknown>[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [domainFilter, setDomainFilter] = useState("all");
  const [uniFilter, setUniFilter] = useState("all");
  const [collegeFilter, setCollegeFilter] = useState("all");
  const [modeFilter, setModeFilter] = useState("all");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [logbookStudent, setLogbookStudent] = useState<StudentDirectoryStudent | null>(null);
  const [isLogbookOpen, setIsLogbookOpen] = useState(false);
  const consentUploadInputRef = useRef<HTMLInputElement>(null);
  const consentUploadStudentRef = useRef<StudentDirectoryStudent | null>(null);
  const [engineeringUniNames, setEngineeringUniNames] = useState<string[]>([]);

  useEffect(() => {
    let cancelled = false;
    void resolveEngineeringUniversityNames(supabase)
      .then((names) => {
        if (!cancelled) setEngineeringUniNames(names);
      })
      .catch(() => {
        if (!cancelled) setEngineeringUniNames([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const directoryUnis = useMemo(
    () => unis.filter((u) => !isEngineeringUniversityName(u.name, engineeringUniNames)),
    [unis, engineeringUniNames]
  );

  const filteredColleges = useMemo(() => {
    if (uniFilter === "all") {
      const allowed = new Set(directoryUnis.map((u) => u.id));
      return colleges.filter((c) => !c.university_id || allowed.has(c.university_id));
    }
    const uni = directoryUnis.find((u) => u.name === uniFilter);
    if (!uni) return [];
    return colleges.filter((c) => c.university_id === uni.id || !c.university_id);
  }, [colleges, directoryUnis, uniFilter]);

  const fetchStudents = useCallback(async () => {
    setLoading(true);
    try {
      const { rows, total: count } = await fetchAdminStudentDirectoryPage(
        supabase,
        page,
        PAGE_SIZE,
        {
          searchTerm,
          domainFilter,
          uniFilter,
          collegeFilter,
          modeFilter,
          startDate,
          endDate,
        }
      );
      const superAdminIds = await fetchSuperAdminUserIds(supabase);
      setStudents(rows.filter((s) => !superAdminIds.includes(String(s.id))));
      setTotal(count);
    } catch (err) {
      console.error("Staff directory fetch:", err);
      toast.error("Failed to load students");
      setStudents([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [
    page,
    searchTerm,
    domainFilter,
    uniFilter,
    collegeFilter,
    modeFilter,
    startDate,
    endDate,
  ]);

  useEffect(() => {
    if (!isActive) return;
    const t = setTimeout(() => {
      void fetchStudents();
    }, 280);
    return () => clearTimeout(t);
  }, [isActive, fetchStudents, refreshKey]);

  const handleResendCredentials = useCallback(
    async (student: StudentDirectoryStudent) => {
      if (
        !confirm(
          `Resend login details to ${student.full_name}? The email uses the password stored in the student directory. Continue?`
        )
      ) {
        return;
      }
      try {
        const latestData = await fetchLatestStudentCredentialRow(supabase, student.id);
        if (!latestData) throw new Error("Student record not found.");

        let finalPassword = getStudentDirectoryPassword(latestData);
        const finalRegId = latestData.registration_id || student.registration_id;

        if (!finalPassword) {
          const ok = confirm(
            "No password is stored for this student.\n\nGenerate a new temporary password, update their login, save it to the directory, and email it?"
          );
          if (!ok) {
            toast.message("Use Reset Password from the menu when you want to set one manually.");
            return;
          }
          finalPassword = generateTempPassword();
          const { error: rpcErr } = await supabase.rpc("admin_reset_user_password", {
            target_user_id: student.id,
            new_pass: finalPassword,
          });
          if (rpcErr) throw rpcErr;
          const prevMeta =
            typeof latestData.metadata === "object" && latestData.metadata !== null
              ? latestData.metadata
              : {};
          const { error: saveErr } = await supabase
            .from("students")
            .update({ metadata: { ...prevMeta, password: finalPassword } })
            .eq("id", student.id);
          if (saveErr) throw saveErr;
          toast.success("Temporary password generated and saved.");
        }

        const toEmail = String(latestData.email || student.email || "").trim();
        if (!toEmail) throw new Error("Student has no email address — update their profile first.");

        const res = await fetch(getSendMailApiUrl(), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            to: toEmail,
            email: toEmail,
            action: "registration_success",
            data: {
              fullName: latestData.full_name || student.full_name,
              regId: finalRegId || "",
              password: finalPassword,
              loginLink: buildStudentCredentialLoginLink(),
            },
          }),
        });
        await assertSendMailOk(res);
        toast.success("Credentials sent successfully!");
        await onLogAction?.("RESEND_CREDENTIALS", "student", `Resent login credentials to ${student.full_name}`, {
          student_id: student.id,
        });
        await fetchStudents();
      } catch (err: unknown) {
        toast.error(err instanceof Error ? err.message : "Resend failed");
      }
    },
    [fetchStudents, onLogAction]
  );

  const toggleBlock = useCallback(
    async (user: StudentDirectoryStudent) => {
      const newStatus = user.status === "Blocked" ? "Active" : "Blocked";
      const { error } = await supabase.from("students").update({ status: newStatus }).eq("id", user.id);
      if (error) {
        toast.error(error.message);
        return;
      }
      await onLogAction?.(
        "UPDATE",
        "student",
        `${newStatus === "Blocked" ? "Blocked" : "Unblocked"} student ${user.full_name} (Staff)`,
        { student_id: user.id, status: newStatus }
      );
      toast.success(`Student ${newStatus === "Blocked" ? "blocked" : "unblocked"} successfully!`);
      await fetchStudents();
    },
    [fetchStudents, onLogAction]
  );

  const handleDelete = useCallback(
    async (student: StudentDirectoryStudent) => {
      if (!confirm(`Delete ${student.full_name || "this student"}?`)) return;
      const { error } = await supabase.from("students").delete().eq("id", student.id);
      if (error) {
        toast.error(error.message);
        return;
      }
      await onLogAction?.("DELETE", "student", `Deleted student ${student.full_name || student.id} (Staff)`, {
        entity_id: student.id,
        name: student.full_name,
      });
      toast.success("Deleted");
      await fetchStudents();
    },
    [fetchStudents, onLogAction]
  );

  const handleDirectoryConsentUpload = async (file: File | null | undefined) => {
    const student = consentUploadStudentRef.current;
    consentUploadStudentRef.current = null;
    if (!file || !student?.id) return;
    try {
      toast.message(`Uploading consent letter for ${student.full_name || "student"}…`);
      await saveAdminStudentConsentLetter(supabase, student, file);
      toast.success("Consent letter uploaded for this student.");
      await fetchStudents();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Could not upload consent letter.");
    } finally {
      if (consentUploadInputRef.current) consentUploadInputRef.current.value = "";
    }
  };

  const parentCbsRef = useRef({
    onViewDetails,
    onEditDetails,
    onResetPassword,
    onDownloadOfferLetter,
  });
  parentCbsRef.current = {
    onViewDetails,
    onEditDetails,
    onResetPassword,
    onDownloadOfferLetter,
  };

  const actions = useMemo(
    () => ({
      onViewDetails: (student: StudentDirectoryStudent) =>
        parentCbsRef.current.onViewDetails(student),
      onEditDetails: (student: StudentDirectoryStudent) =>
        parentCbsRef.current.onEditDetails(student),
      onResetPassword: (student: StudentDirectoryStudent) =>
        parentCbsRef.current.onResetPassword(student),
      onResendCredentials: handleResendCredentials,
      onViewConsentLetter: (student: StudentDirectoryStudent) => {
        const url = getStudentConsentLetterUrl(student);
        if (url) window.open(url, "_blank", "noopener,noreferrer");
        else toast.error("No consent letter on file for this student.");
      },
      onUploadConsentLetter: (student: StudentDirectoryStudent) => {
        consentUploadStudentRef.current = student;
        if (consentUploadInputRef.current) {
          consentUploadInputRef.current.value = "";
          consentUploadInputRef.current.click();
        }
      },
      onViewLogbook: (student: StudentDirectoryStudent) => {
        setLogbookStudent(student);
        setIsLogbookOpen(true);
      },
      onDownloadAttendanceReport: (student: StudentDirectoryStudent) => {
        void (async () => {
          try {
            toast.message("Generating attendance report…");
            await downloadStudentAttendanceReportPdf(supabase, student as Record<string, unknown>);
            toast.success("Attendance report downloaded.");
          } catch (e: unknown) {
            toast.error(e instanceof Error ? e.message : "Could not generate attendance report.");
          }
        })();
      },
      onDownloadOfferLetter: (student: StudentDirectoryStudent) =>
        parentCbsRef.current.onDownloadOfferLetter(student),
      onToggleBlock: toggleBlock,
      onDelete: handleDelete,
    }),
    [handleResendCredentials, toggleBlock, handleDelete]
  );

  const onActionsReadyRef = useRef(onActionsReady);
  onActionsReadyRef.current = onActionsReady;
  useEffect(() => {
    onActionsReadyRef.current?.(actions);
  }, [actions]);

  if (!isActive) return null;

  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);

  return (
    <>
      <input
        ref={consentUploadInputRef}
        type="file"
        accept=".pdf,image/*"
        className="hidden"
        onChange={(e) => void handleDirectoryConsentUpload(e.target.files?.[0])}
      />

      <Card className="p-6 border-none shadow-elegant bg-white space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-end gap-4 justify-between">
          <div className="flex flex-wrap items-center gap-3 flex-1">
            <div className="relative w-full max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
              <Input
                className="pl-9 h-11"
                placeholder="Name, email, reg ID…"
                value={searchTerm}
                onChange={(e) => {
                  setSearchTerm(e.target.value);
                  setPage(0);
                }}
              />
            </div>
            <Badge className="bg-blue-50 text-blue-700 border-none px-4 py-2 font-black">
              {loading ? "Loading…" : `Total: ${total}`}
            </Badge>
          </div>
          {onAddStudent && (
            <Button className="font-bold gap-2" onClick={onAddStudent}>
              <UserPlus className="size-4" /> Add Student
            </Button>
          )}
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="space-y-1.5">
            <Label className="text-[10px] uppercase font-bold text-muted-foreground">Domain</Label>
            <Select
              value={domainFilter}
              onValueChange={(v) => {
                setDomainFilter(v);
                setPage(0);
              }}
            >
              <SelectTrigger>
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
          </div>
          <div className="space-y-1.5">
            <Label className="text-[10px] uppercase font-bold text-muted-foreground">University</Label>
            <Select
              value={uniFilter}
              onValueChange={(v) => {
                setUniFilter(v);
                setCollegeFilter("all");
                setPage(0);
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="University" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Universities</SelectItem>
                {directoryUnis.map((u) => (
                  <SelectItem key={u.id} value={u.name}>
                    {u.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-[10px] uppercase font-bold text-muted-foreground">College</Label>
            <Select
              value={collegeFilter}
              onValueChange={(v) => {
                setCollegeFilter(v);
                setPage(0);
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="College" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Colleges</SelectItem>
                {filteredColleges.map((c) => (
                  <SelectItem key={c.id} value={c.name}>
                    {displayCollegeName(c.name)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-[10px] uppercase font-bold text-muted-foreground">Mode</Label>
            <InternshipModeFilterSelect
              value={modeFilter}
              onValueChange={(v) => {
                setModeFilter(v);
                setPage(0);
              }}
            />
          </div>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-3 items-end">
          <div className="space-y-1.5">
            <Label className="text-[10px] uppercase font-bold text-muted-foreground">Start Date</Label>
            <div className="relative">
              <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
              <Input
                type="date"
                className="pl-9"
                value={startDate}
                onChange={(e) => {
                  setStartDate(e.target.value);
                  setPage(0);
                }}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-[10px] uppercase font-bold text-muted-foreground">End Date</Label>
            <div className="relative">
              <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
              <Input
                type="date"
                className="pl-9"
                value={endDate}
                onChange={(e) => {
                  setEndDate(e.target.value);
                  setPage(0);
                }}
              />
            </div>
          </div>
          <Button
            variant="outline"
            className="gap-2"
            onClick={() => {
              setSearchTerm("");
              setDomainFilter("all");
              setUniFilter("all");
              setCollegeFilter("all");
              setModeFilter("all");
              setStartDate("");
              setEndDate("");
              setPage(0);
            }}
          >
            <Filter className="size-4" /> Reset Filters
          </Button>
        </div>

        <div className="overflow-hidden rounded-xl border">
          <Table>
            <TableHeader className="bg-slate-50">
              <TableRow>
                <TableHead>Student</TableHead>
                <TableHead>Domain</TableHead>
                <TableHead>Institution</TableHead>
                <TableHead>Joined</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-12 text-muted-foreground">
                    <Loader2 className="size-6 animate-spin inline mr-2" />
                    Loading students…
                  </TableCell>
                </TableRow>
              ) : students.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-12 text-muted-foreground italic">
                    No students match your filters.
                  </TableCell>
                </TableRow>
              ) : (
                students.map((s) => {
                  const student = s as StudentDirectoryStudent;
                  return (
                    <TableRow key={String(s.id)}>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <div className="size-9 rounded-xl bg-slate-100 flex items-center justify-center text-primary font-black text-xs">
                            {String(s.full_name || "?").charAt(0)}
                          </div>
                          <div>
                            <p className="font-bold text-sm flex items-center gap-2 flex-wrap">
                              {String(s.full_name || "")}
                              <BulkUploadStudentBadge
                                metadata={
                                  (typeof s.metadata === "object" && s.metadata
                                    ? (s.metadata as Record<string, unknown>)
                                    : parseJsonField(s.metadata)) || undefined
                                }
                                showAddRegistration
                              />
                            </p>
                            <p className="text-[10px] text-slate-500">{String(s.email || "")}</p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary" className="text-[10px] font-black uppercase">
                          {String(s.internship_domain || "Unassigned")}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="text-xs font-medium">
                          {displayCollegeName(String(s.college_name || "—"))}
                        </div>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {s.created_at ? new Date(String(s.created_at)).toLocaleDateString() : "—"}
                      </TableCell>
                      <TableCell className="text-right">
                        <StudentDirectoryActionsMenu student={student} {...actions} />
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
          <div className="p-4 bg-muted/10 border-t flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="text-xs text-muted-foreground font-medium">
              Showing {total === 0 ? 0 : safePage * PAGE_SIZE + 1} to{" "}
              {Math.min(total, (safePage + 1) * PAGE_SIZE)} of {total} students
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={safePage === 0 || loading}
                onClick={() => setPage((p) => p - 1)}
              >
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={(safePage + 1) * PAGE_SIZE >= total || loading}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
              </Button>
            </div>
          </div>
        </div>
      </Card>

      <StudentLogbookDialog
        open={isLogbookOpen}
        onOpenChange={setIsLogbookOpen}
        student={logbookStudent}
      />
    </>
  );
}
