import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Award,
  Download,
  Loader2,
  Search,
  CheckCircle2,
  ExternalLink,
} from "lucide-react";
import {
  collegesForUniversityNames,
  pruneCollegesForUniversities,
} from "@/lib/classLinkTargeting";
import { InternshipModeFilterSelect } from "@/components/admin/InternshipModeFilterSelect";
import { MultiSelectCheckboxGroup } from "@/components/admin/MultiSelectCheckboxGroup";
import { sendCertificateEmail } from "@/lib/email";
import {
  CertEligibleStudent,
  CertificateAudienceFilters,
  emptyCertificateAudienceFilters,
  fetchAllCertificatesDirectory,
  fetchCertificatesByIds,
  fetchCertificatesByUserIds,
  fetchCertificatesDirectoryPage,
  fetchExistingCertificateUserIds,
  fetchStudentsByIdsForCerts,
  fetchTopAssignmentScoreByStudent,
  filterStudentsForCertTargets,
} from "@/lib/certificateAdmin";
import {
  CERTIFICATE_INTERNSHIP_PERIOD,
  CertificateEditFormState,
  certificateDataFromStudent,
  certificateDisplayFromRecord,
  certificateEditFormFromDisplay,
  certificateOverridesFromEditForm,
  certificateVerifyUrl,
} from "@/lib/certificateFormat";
import { isBnmuStudent } from "@/lib/feeRules";
import { resolveInternshipProgrammeConfig } from "@/lib/internshipProgramme";
import { subjectsFor } from "@/lib/subjectOptions";
import {
  BULK_CERT_DOWNLOAD_MAX,
  BulkCertDownloadProgress,
  certificatePdfFilename,
  downloadAdminCertificatePdf,
  downloadAdminCertificatesZip,
} from "@/lib/adminCertificatePdf";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Pencil } from "lucide-react";

type CertificateRow = {
  id: string;
  user_id: string;
  student_name?: string | null;
  certificate_id?: string | null;
  internship_name?: string | null;
  duration?: string | null;
  status?: string | null;
  created_at?: string | null;
  issue_date?: string | null;
  display_overrides?: Record<string, unknown> | null;
};

const emptyEditForm = (): CertificateEditFormState => ({
  studentName: "",
  universityRollNo: "",
  universityRegistrationNumber: "",
  collegeName: "",
  universityName: "",
  academicSession: "",
  degree: "",
  department: "",
  subject: "",
  internshipDomain: "",
  internshipDuration: CERTIFICATE_INTERNSHIP_PERIOD,
  internshipMode: "Online",
  totalHours: "",
  creditsRecommended: "",
  marksPercent: "",
  assessmentRows: [],
});

type Props = {
  students: CertEligibleStudent[];
  certificates: CertificateRow[];
  domains: { id: string; name: string }[];
  unis: { id: string; name: string }[];
  colleges: { id: string; name: string; university_id: string }[];
  onRefreshCertificates?: () => void | Promise<void>;
  onLogAction?: (
    action: string,
    entity: string,
    details: string,
    meta?: Record<string, unknown>
  ) => void | Promise<void>;
  isActive?: boolean;
  studentsLoading?: boolean;
  onRequestStudents?: () => void | Promise<void>;
};

const emptyFilters = emptyCertificateAudienceFilters();
const PAGE_SIZE = 50;
const UG_DEPARTMENTS = ["B.A.", "B.Sc", "B.Com"] as const;
const PG_DEPARTMENTS = ["M.A.", "M.Sc", "M.Com"] as const;
const ALL_DEPARTMENT_OPTIONS = [...UG_DEPARTMENTS, ...PG_DEPARTMENTS].map((d) => ({
  id: d,
  name: d,
}));

function subjectOptionsForDepartments(departments: string[]) {
  const depts = departments.length > 0 ? departments : [...UG_DEPARTMENTS, ...PG_DEPARTMENTS];
  const seen = new Set<string>();
  const out: { id: string; name: string }[] = [];
  for (const dept of depts) {
    for (const subject of subjectsFor(dept)) {
      if (!seen.has(subject)) {
        seen.add(subject);
        out.push({ id: subject, name: subject });
      }
    }
  }
  return out;
}

function pruneSubjectsForDepartments(departments: string[], subjects: string[]) {
  const allowed = new Set(subjectOptionsForDepartments(departments).map((o) => o.id));
  return subjects.filter((s) => allowed.has(s));
}
const ACADEMIC_SESSIONS = ["2023-2027", "2024-2028", "2025-2029"];
const INTERNSHIP_MODES = ["Online", "Offline", "Hybrid"] as const;

export function CertificateManagementPanel({
  students,
  certificates,
  domains,
  unis,
  colleges,
  onRefreshCertificates,
  onLogAction,
  isActive = true,
  studentsLoading = false,
  onRequestStudents,
}: Props) {
  const [filters, setFilters] = useState<CertificateAudienceFilters>(emptyFilters);
  const [searchTerm, setSearchTerm] = useState("");
  const [studentPage, setStudentPage] = useState(0);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [programName, setProgramName] = useState("");
  const [generating, setGenerating] = useState(false);
  const [localCerts, setLocalCerts] = useState<CertificateRow[]>([]);
  const [assignmentScores, setAssignmentScores] = useState<Record<string, number>>({});
  const [scoresLoading, setScoresLoading] = useState(false);
  const [downloadSearch, setDownloadSearch] = useState("");
  const [downloadFilters, setDownloadFilters] = useState<CertificateAudienceFilters>(emptyFilters);
  const [downloadPage, setDownloadPage] = useState(0);
  const [downloadCerts, setDownloadCerts] = useState<CertificateRow[]>([]);
  const [downloadTotalCount, setDownloadTotalCount] = useState(0);
  const [downloadLoading, setDownloadLoading] = useState(false);
  const [selectingAllDownloads, setSelectingAllDownloads] = useState(false);
  const [selectedDownloadIds, setSelectedDownloadIds] = useState<string[]>([]);
  const [downloadingCerts, setDownloadingCerts] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState<BulkCertDownloadProgress | null>(null);
  const [downloadingCertId, setDownloadingCertId] = useState<string | null>(null);
  const [certPanelTab, setCertPanelTab] = useState("generate");
  const [editingCert, setEditingCert] = useState<CertificateRow | null>(null);
  const [editForm, setEditForm] = useState<CertificateEditFormState>(emptyEditForm);
  const [savingCertEdit, setSavingCertEdit] = useState(false);
  const scoresLoadRef = useRef(0);
  const certsLoadRef = useRef(0);
  const studentsRequestedRef = useRef(false);
  const [issuedCertsByUserId, setIssuedCertsByUserId] = useState<
    Map<string, CertificateRow>
  >(() => new Map());

  useEffect(() => {
    setLocalCerts([]);
  }, [certificates]);

  const certUserKey = (id: unknown) => String(id ?? "").trim().toLowerCase();

  const certByUserId = useMemo(() => {
    const map = new Map<string, CertificateRow>();
    for (const c of certificates) {
      const key = certUserKey(c.user_id);
      if (key) map.set(key, c);
    }
    for (const c of localCerts) {
      const key = certUserKey(c.user_id);
      if (key) map.set(key, c);
    }
    for (const [uid, c] of issuedCertsByUserId) {
      map.set(uid, c);
    }
    return map;
  }, [certificates, localCerts, issuedCertsByUserId]);

  const scopedStudents = useMemo(
    () => filterStudentsForCertTargets(students, filters, { colleges, unis }),
    [students, filters, colleges, unis]
  );

  const visibleStudents = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    if (!q) return scopedStudents;
    return scopedStudents.filter(
      (s) =>
        s.full_name?.toLowerCase().includes(q) ||
        s.email?.toLowerCase().includes(q) ||
        s.registration_id?.toLowerCase().includes(q)
    );
  }, [scopedStudents, searchTerm]);

  useEffect(() => {
    setStudentPage(0);
    setSelectedIds([]);
  }, [filters, searchTerm]);

  const pageCount = Math.max(1, Math.ceil(visibleStudents.length / PAGE_SIZE));
  const safePage = Math.min(studentPage, pageCount - 1);
  const paginatedStudents = useMemo(
    () =>
      visibleStudents.slice(
        safePage * PAGE_SIZE,
        (safePage + 1) * PAGE_SIZE
      ),
    [visibleStudents, safePage]
  );

  useEffect(() => {
    if (!isActive || (certPanelTab !== "generate" && certPanelTab !== "download")) {
      studentsRequestedRef.current = false;
      return;
    }
    if (students.length > 0 || studentsLoading || !onRequestStudents) return;
    if (studentsRequestedRef.current) return;
    studentsRequestedRef.current = true;
    void onRequestStudents();
  }, [isActive, certPanelTab, students.length, studentsLoading, onRequestStudents]);

  useEffect(() => {
    setDownloadPage(0);
    setSelectedDownloadIds([]);
  }, [downloadSearch, downloadFilters]);

  const paginatedStudentIds = useMemo(
    () => paginatedStudents.map((s) => s.id).join(","),
    [paginatedStudents]
  );

  const loadScoresForPage = useCallback(async (pageStudentIds: string[]) => {
    if (!isActive || pageStudentIds.length === 0) {
      setScoresLoading(false);
      return;
    }
    const loadId = ++scoresLoadRef.current;
    setScoresLoading(true);
    try {
      const scores = await fetchTopAssignmentScoreByStudent(supabase, pageStudentIds);
      if (loadId !== scoresLoadRef.current) return;
      setAssignmentScores((prev) => ({ ...prev, ...scores }));
    } catch (e: unknown) {
      if (loadId !== scoresLoadRef.current) return;
      toast.error(e instanceof Error ? e.message : "Failed to load assignment marks");
    } finally {
      if (loadId === scoresLoadRef.current) {
        setScoresLoading(false);
      }
    }
  }, [isActive]);

  const loadCertsForPage = useCallback(async (pageStudentIds: string[]) => {
    if (!isActive || pageStudentIds.length === 0) return;
    const loadId = ++certsLoadRef.current;
    try {
      const rows = await fetchCertificatesByUserIds(supabase, pageStudentIds);
      if (loadId !== certsLoadRef.current) return;
      setIssuedCertsByUserId((prev) => {
        const next = new Map(prev);
        for (const row of rows) {
          const key = certUserKey(row.user_id);
          if (key) next.set(key, row as CertificateRow);
        }
        return next;
      });
    } catch (e: unknown) {
      if (loadId !== certsLoadRef.current) return;
      console.error("Failed to load certificate status for page:", e);
    }
  }, [isActive]);

  useEffect(() => {
    if (!isActive || !paginatedStudentIds) return;
    const ids = paginatedStudentIds.split(",").filter(Boolean);
    void loadScoresForPage(ids);
    void loadCertsForPage(ids);
  }, [isActive, paginatedStudentIds, loadScoresForPage, loadCertsForPage]);

  useEffect(() => {
    if (!isActive) {
      scoresLoadRef.current += 1;
      certsLoadRef.current += 1;
    }
  }, [isActive]);

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const resolveInternshipName = (student: CertEligibleStudent) =>
    programName.trim() ||
    student.internship_domain ||
    student.course ||
    "Internship";

  const generateForStudents = async (targetStudents: CertEligibleStudent[]) => {
    if (targetStudents.length === 0) return toast.error("No students to issue certificates for");
    setGenerating(true);
    try {
      const ids = targetStudents.map((s) => s.id);
      const existing = await fetchExistingCertificateUserIds(supabase, ids);
      const toIssue = targetStudents.filter((s) => !existing.has(s.id));
      if (toIssue.length === 0) {
        toast.info("All selected students already have certificates");
        return;
      }

      const eligible = toIssue;

      const year = new Date().getFullYear();
      const makeRandomId = (len = 6) => {
        const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
        const bytes = new Uint8Array(len);
        crypto.getRandomValues(bytes);
        return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("");
      };

      // Only registration-based certificate numbers can collide (unique constraint).
      // Preload existing certificate_ids for those candidates.
      const candidateIds = Array.from(
        new Set(
          eligible
            .map((s) => (s.registration_id || "").trim())
            .filter((v) => v.length > 0)
        )
      );
      const usedIds = new Set<string>();
      if (candidateIds.length > 0) {
        const chunkSize = 200;
        for (let i = 0; i < candidateIds.length; i += chunkSize) {
          const chunk = candidateIds.slice(i, i + chunkSize);
          const { data, error } = await supabase
            .from("certificates")
            .select("certificate_id")
            .in("certificate_id", chunk);
          if (error) throw error;
          for (const row of data || []) {
            if (row.certificate_id) usedIds.add(String(row.certificate_id));
          }
        }
      }

      const ensureUniqueCertId = (preferred?: string | null) => {
        const clean = (preferred || "").trim();
        if (clean && !usedIds.has(clean)) {
          usedIds.add(clean);
          return clean;
        }
        for (let attempt = 0; attempt < 10; attempt++) {
          const generated = `EZY/${year}/INT/${makeRandomId(8)}`;
          if (!usedIds.has(generated)) {
            usedIds.add(generated);
            return generated;
          }
        }
        // extremely unlikely fallback
        const fallback = `EZY/${year}/INT/${Date.now()}`;
        usedIds.add(fallback);
        return fallback;
      };

      const rows = eligible.map((s) => ({
        user_id: s.id,
        student_name: s.full_name || "Student",
        internship_name: resolveInternshipName(s),
        duration: resolveInternshipProgrammeConfig(s.university_name).period,
        certificate_id: ensureUniqueCertId(s.registration_id),
        status: "Active",
      }));

      const { data: inserted, error } = await supabase
        .from("certificates")
        .insert(rows)
        .select("*");
      if (error) throw error;

      if (inserted?.length) {
        const insertedRows = inserted as CertificateRow[];
        setLocalCerts((prev) => [...insertedRows, ...prev]);
        setIssuedCertsByUserId((prev) => {
          const next = new Map(prev);
          for (const row of insertedRows) {
            const key = certUserKey(row.user_id);
            if (key) next.set(key, row);
          }
          return next;
        });
      }

      void onLogAction?.(
        "BULK_ACTION",
        "certificate",
        `Issued ${eligible.length} certificate(s)`,
        { count: eligible.length, period: CERTIFICATE_INTERNSHIP_PERIOD }
      );

      for (const row of rows) {
        const student = eligible.find((s) => s.id === row.user_id);
        if (student?.email) {
          sendCertificateEmail({
            to: student.email,
            studentName: row.student_name,
            programme: row.internship_name,
            certificateId: row.certificate_id,
          });
        }
      }

      toast.success(`Generated ${eligible.length} certificate(s)`);
      setSelectedIds([]);
      void onRefreshCertificates?.();
    } catch (e: unknown) {
      const anyErr = e as any;
      const message =
        anyErr?.message ||
        anyErr?.error_description ||
        anyErr?.details ||
        "Certificate generation failed";
      toast.error(message);
    } finally {
      setGenerating(false);
    }
  };

  const handleGenerateSelected = () => {
    const picked = visibleStudents.filter((s) => selectedIds.includes(s.id));
    void generateForStudents(picked);
  };

  const handleGenerateAllFiltered = () => {
    void generateForStudents(scopedStudents);
  };

  const studentById = useMemo(() => {
    const map = new Map<string, CertEligibleStudent>();
    for (const s of students) map.set(s.id, s);
    return map;
  }, [students]);

  const downloadDirectoryFilters = useMemo(
    () => ({
      search: downloadSearch,
      universities: downloadFilters.universities,
      colleges: downloadFilters.colleges,
      departments: downloadFilters.departments,
      subjects: downloadFilters.subjects,
      domain: downloadFilters.domain,
      mode: downloadFilters.mode,
    }),
    [downloadSearch, downloadFilters]
  );

  const loadDownloadPage = useCallback(async () => {
    setDownloadLoading(true);
    try {
      const { rows, total } = await fetchCertificatesDirectoryPage(
        supabase,
        downloadPage,
        PAGE_SIZE,
        downloadDirectoryFilters
      );
      if (downloadPage > 0 && total > 0 && downloadPage * PAGE_SIZE >= total) {
        setDownloadPage(0);
        return;
      }
      setDownloadCerts(rows as CertificateRow[]);
      setDownloadTotalCount(total);
    } catch (e: unknown) {
      console.error(e);
      toast.error(e instanceof Error ? e.message : "Failed to load certificates");
      setDownloadCerts([]);
      setDownloadTotalCount(0);
    } finally {
      setDownloadLoading(false);
    }
  }, [downloadPage, downloadDirectoryFilters]);

  useEffect(() => {
    if (!isActive || certPanelTab !== "download") return;
    const delay = downloadSearch.trim() ? 300 : 0;
    const timer = setTimeout(() => {
      void loadDownloadPage();
    }, delay);
    return () => clearTimeout(timer);
  }, [isActive, certPanelTab, loadDownloadPage, downloadSearch]);

  useEffect(() => {
    if (!isActive || certPanelTab !== "download" || localCerts.length === 0) return;
    void loadDownloadPage();
  }, [localCerts.length, isActive, certPanelTab, loadDownloadPage]);

  const downloadPageCount = Math.max(1, Math.ceil(downloadTotalCount / PAGE_SIZE));
  const safeDownloadPage = Math.min(downloadPage, downloadPageCount - 1);

  const exportCertsXlsx = async () => {
    if (downloadTotalCount === 0) return toast.error("No certificates to export");
    try {
      const filteredCerts = await fetchAllCertificatesDirectory(supabase, downloadDirectoryFilters);
      const studentMap = await fetchStudentsByIdsForCerts(
        supabase,
        filteredCerts.map((c) => String(c.user_id || ""))
      );
      const rows = filteredCerts.map((c) => {
        const student = c.user_id ? studentMap.get(String(c.user_id)) : undefined;
        return {
          "Certificate ID": c.certificate_id || "",
          "Student Name": c.student_name || student?.full_name || "",
          Email: student?.email || "",
          University: student?.university_name || "",
          College: student?.college_name || "",
          Domain: student?.internship_domain || "",
          Program: c.internship_name || "",
          "Internship Period": CERTIFICATE_INTERNSHIP_PERIOD,
          Status: c.status || "",
          Issued: c.created_at ? new Date(c.created_at).toLocaleDateString() : "",
          "Verify URL": c.certificate_id ? certificateVerifyUrl(c.certificate_id) : "",
        };
      });
      const sheet = XLSX.utils.json_to_sheet(rows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, sheet, "Certificates");
      XLSX.writeFile(
        wb,
        `certificates_${new Date().toISOString().split("T")[0]}.xlsx`
      );
      toast.success(`Exported ${filteredCerts.length} certificate(s)`);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Export failed");
    }
  };

  const downloadCollegeOptions = useMemo(
    () => collegesForUniversityNames(colleges, unis, downloadFilters.universities),
    [colleges, unis, downloadFilters.universities]
  );

  const fetchStudentProfileIfMissing = useCallback(
    async (userId: string): Promise<Record<string, unknown> | null> => {
      const cached = studentById.get(userId);
      if (cached) return cached as Record<string, unknown>;
      const { data, error } = await supabase.from("students").select("*").eq("id", userId).maybeSingle();
      if (error) throw error;
      return data;
    },
    [studentById]
  );

  const prepareCertDownloadItems = useCallback(
    async (certsToDownload: CertificateRow[]) => {
      const missingUserIds = Array.from(
        new Set(
          certsToDownload
            .map((c) => String(c.user_id || "").trim())
            .filter((id) => id && !studentById.has(id))
        )
      );
      const fetchedStudents =
        missingUserIds.length > 0
          ? await fetchStudentsByIdsForCerts(supabase, missingUserIds)
          : new Map<string, CertEligibleStudent>();

      const items: Array<{ data: ReturnType<typeof certificateDataFromStudent>; filename: string }> = [];
      for (const cert of certsToDownload) {
        const userId = String(cert.user_id || "").trim();
        let student = userId ? studentById.get(userId) : undefined;
        if (!student && userId) {
          student = fetchedStudents.get(userId);
        }
        const data = certificateDisplayFromRecord(student, cert, {
          useSavedProfileOverrides: true,
        });
        items.push({
          data,
          filename: certificatePdfFilename(cert.certificate_id, cert.student_name || student?.full_name),
        });
      }
      return items;
    },
    [studentById]
  );

  const openEditCert = async (cert: CertificateRow) => {
    setEditingCert(cert);
    let student = studentById.get(String(cert.user_id));
    if (!student && cert.user_id) {
      const row = await fetchStudentProfileIfMissing(String(cert.user_id));
      if (row) student = row as CertEligibleStudent;
    }
    const display = certificateDisplayFromRecord(student, cert, {
      useSavedProfileOverrides: true,
    });
    setEditForm(certificateEditFormFromDisplay(display));
  };

  const patchEditForm = (patch: Partial<CertificateEditFormState>) => {
    setEditForm((prev) => ({ ...prev, ...patch }));
  };

  const editDepartmentOptions = useMemo(() => {
    if (editForm.degree === "PG") return [...PG_DEPARTMENTS];
    if (editForm.degree === "UG") return [...UG_DEPARTMENTS];
    return [...UG_DEPARTMENTS, ...PG_DEPARTMENTS];
  }, [editForm.degree]);

  const editSubjectOptions = useMemo(
    () => subjectsFor(editForm.department),
    [editForm.department]
  );

  const editCollegesForUniversity = useMemo(() => {
    const uni = unis.find((u) => u.name === editForm.universityName);
    if (!uni) return colleges;
    return colleges.filter((c) => c.university_id === uni.id);
  }, [colleges, unis, editForm.universityName]);

  const toggleDownloadSelect = (certId: string) => {
    setSelectedDownloadIds((prev) =>
      prev.includes(certId) ? prev.filter((id) => id !== certId) : [...prev, certId]
    );
  };

  const toggleDownloadPageSelection = () => {
    const pageIds = downloadCerts.map((c) => c.id);
    const allOnPage =
      pageIds.length > 0 && pageIds.every((id) => selectedDownloadIds.includes(id));
    if (allOnPage) {
      setSelectedDownloadIds((prev) => prev.filter((id) => !pageIds.includes(id)));
    } else {
      setSelectedDownloadIds((prev) => Array.from(new Set([...prev, ...pageIds])));
    }
  };

  const toggleSelectAllFilteredDownloads = async () => {
    if (
      downloadTotalCount > 0 &&
      selectedDownloadIds.length === downloadTotalCount
    ) {
      setSelectedDownloadIds([]);
      return;
    }
    setSelectingAllDownloads(true);
    try {
      const all = await fetchAllCertificatesDirectory(supabase, downloadDirectoryFilters);
      setSelectedDownloadIds(all.map((c) => c.id));
      toast.success(`Selected ${all.length} certificate(s)`);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Could not select all certificates");
    } finally {
      setSelectingAllDownloads(false);
    }
  };

  const handleDownloadOneCert = async (cert: CertificateRow) => {
    setDownloadingCertId(cert.id);
    try {
      const [item] = await prepareCertDownloadItems([cert]);
      await downloadAdminCertificatePdf(item.data, item.filename);
      toast.success("Certificate PDF downloaded (unsigned admin copy)");
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "PDF download failed");
    } finally {
      setDownloadingCertId(null);
    }
  };

  const runBulkCertDownload = async (certsToDownload: CertificateRow[]) => {
    if (certsToDownload.length === 0) {
      toast.error("No certificates to download");
      return;
    }
    if (certsToDownload.length > BULK_CERT_DOWNLOAD_MAX) {
      toast.error(`Download at most ${BULK_CERT_DOWNLOAD_MAX} certificates at a time`);
      return;
    }

    setDownloadingCerts(true);
    setDownloadProgress({ done: 0, total: certsToDownload.length, phase: "rendering" });
    try {
      const items = await prepareCertDownloadItems(certsToDownload);
      if (items.length === 0) {
        toast.error("Could not prepare any certificate PDFs");
        return;
      }
      if (items.length === 1) {
        await downloadAdminCertificatePdf(items[0].data, items[0].filename);
        toast.success("Certificate PDF downloaded (unsigned admin copy)");
      } else {
        await downloadAdminCertificatesZip(items, {
          concurrency: 2,
          onProgress: setDownloadProgress,
        });
        toast.success(
          `Downloaded ${items.length} certificate PDFs as ZIP (unsigned admin copies)`
        );
      }
      setSelectedDownloadIds([]);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Bulk PDF download failed");
    } finally {
      setDownloadingCerts(false);
      setDownloadProgress(null);
    }
  };

  const handleDownloadSelectedCerts = async () => {
    if (selectedDownloadIds.length === 0) return toast.error("Select at least one certificate");
    if (selectedDownloadIds.length > BULK_CERT_DOWNLOAD_MAX) {
      return toast.error(`Select at most ${BULK_CERT_DOWNLOAD_MAX} certificates per download`);
    }
    try {
      const picked = await fetchCertificatesByIds(supabase, selectedDownloadIds);
      if (picked.length === 0) {
        toast.error("Selected certificates could not be loaded");
        return;
      }
      await runBulkCertDownload(picked as CertificateRow[]);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Could not load selected certificates");
    }
  };

  const handleDownloadAllFiltered = async () => {
    if (downloadTotalCount === 0) return toast.error("No certificates match the current filters");
    if (downloadTotalCount > BULK_CERT_DOWNLOAD_MAX) {
      toast.info(
        `Downloading first ${BULK_CERT_DOWNLOAD_MAX} of ${downloadTotalCount.toLocaleString()} matching certificates. Use filters or page selection for more batches.`
      );
    }
    try {
      const picked = await fetchAllCertificatesDirectory(
        supabase,
        downloadDirectoryFilters,
        BULK_CERT_DOWNLOAD_MAX
      );
      await runBulkCertDownload(picked as CertificateRow[]);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Bulk PDF download failed");
    }
  };

  const saveCertEdit = async () => {
    if (!editingCert) return;
    setSavingCertEdit(true);
    try {
      const { error } = await supabase
        .from("certificates")
        .update({
          student_name: editForm.studentName.trim(),
          internship_name: editForm.internshipDomain.trim(),
          duration: editForm.internshipDuration.trim() || CERTIFICATE_INTERNSHIP_PERIOD,
          display_overrides: certificateOverridesFromEditForm(editForm),
        })
        .eq("id", editingCert.id);
      if (error) throw error;
      setLocalCerts((prev) =>
        prev.map((row) =>
          row.id === editingCert.id
            ? {
                ...row,
                student_name: editForm.studentName.trim(),
                internship_name: editForm.internshipDomain.trim(),
                duration: editForm.internshipDuration.trim() || CERTIFICATE_INTERNSHIP_PERIOD,
                display_overrides: certificateOverridesFromEditForm(editForm),
              }
            : row
        )
      );
      void onLogAction?.(
        "UPDATE",
        "certificate",
        `Edited certificate ${editingCert.certificate_id}`,
        { certificate_id: editingCert.certificate_id }
      );
      toast.success("Certificate updated");
      setEditingCert(null);
      void onRefreshCertificates?.();
      void loadDownloadPage();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Could not save certificate");
    } finally {
      setSavingCertEdit(false);
    }
  };

  const collegeOptions = useMemo(
    () => collegesForUniversityNames(colleges, unis, filters.universities),
    [colleges, unis, filters.universities]
  );
  const generateSubjectOptions = useMemo(
    () => subjectOptionsForDepartments(filters.departments),
    [filters.departments]
  );
  const downloadSubjectOptions = useMemo(
    () => subjectOptionsForDepartments(downloadFilters.departments),
    [downloadFilters.departments]
  );

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold flex items-center gap-2">
          <Award className="size-6 text-primary" />
          Certificate management
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          Filter by university, college, department, subject, domain, and mode. Generate certificates in bulk, or download unsigned PDF copies from Download & verify.
        </p>
      </div>

      <Tabs defaultValue="generate" onValueChange={setCertPanelTab} className="space-y-6">
        <TabsList>
          <TabsTrigger value="generate">Generate</TabsTrigger>
          <TabsTrigger value="download">Download & verify</TabsTrigger>
        </TabsList>

        <TabsContent value="generate" className="space-y-6 mt-0">
          <Card className="p-6 border-none shadow-elegant space-y-4">
            <h3 className="font-bold text-sm text-muted-foreground uppercase tracking-wide">
              Target audience
            </h3>
            <div className="grid md:grid-cols-2 gap-6">
              <MultiSelectCheckboxGroup
                label="Universities"
                options={unis}
                selectedValues={filters.universities}
                onChange={(universities) =>
                  setFilters((f) => ({
                    ...f,
                    universities,
                    colleges: pruneCollegesForUniversities(colleges, unis, universities, f.colleges),
                  }))
                }
              />
              <MultiSelectCheckboxGroup
                label="Colleges"
                options={collegeOptions}
                selectedValues={filters.colleges}
                onChange={(collegesSelected) =>
                  setFilters((f) => ({ ...f, colleges: collegesSelected }))
                }
              />
              <MultiSelectCheckboxGroup
                label="Departments"
                options={ALL_DEPARTMENT_OPTIONS}
                selectedValues={filters.departments}
                onChange={(departments) =>
                  setFilters((f) => ({
                    ...f,
                    departments,
                    subjects: pruneSubjectsForDepartments(departments, f.subjects),
                  }))
                }
              />
              <MultiSelectCheckboxGroup
                label="Subjects"
                options={generateSubjectOptions}
                selectedValues={filters.subjects}
                onChange={(subjects) => setFilters((f) => ({ ...f, subjects }))}
              />
              <div className="space-y-2">
                <Label>Domain</Label>
                <Select
                  value={filters.domain}
                  onValueChange={(domain) => setFilters((f) => ({ ...f, domain }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All domains</SelectItem>
                    {domains.map((d) => (
                      <SelectItem key={d.id} value={d.name}>
                        {d.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Mode</Label>
                <InternshipModeFilterSelect
                  value={filters.mode}
                  onValueChange={(mode) => setFilters((f) => ({ ...f, mode }))}
                />
              </div>
            </div>
            <div className="grid md:grid-cols-1 gap-4 pt-4 border-t">
              <div className="space-y-2">
                <Label>Program name on certificate (optional)</Label>
                <Input
                  value={programName}
                  onChange={(e) => setProgramName(e.target.value)}
                  placeholder="Defaults to each student's domain"
                />
              </div>
              <p className="text-xs text-muted-foreground">
                Internship period on all certificates:{" "}
                <span className="font-bold text-slate-800">{CERTIFICATE_INTERNSHIP_PERIOD}</span>
              </p>
            </div>
          </Card>

          <Card className="border-none shadow-elegant overflow-hidden">
            <div className="p-4 border-b bg-muted/20 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold">{scopedStudents.length} in scope</span>
                {studentsLoading ? (
                  <span className="text-xs text-muted-foreground inline-flex items-center gap-1">
                    <Loader2 className="size-3 animate-spin" /> Loading students…
                  </span>
                ) : null}
              </div>
              <div className="relative w-64">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-3 text-muted-foreground" />
                <Input
                  className="pl-8 h-9 text-xs"
                  placeholder="Search students..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
            </div>
            <ScrollArea className="h-[380px]">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">
                      <Checkbox
                        checked={
                          paginatedStudents.length > 0 &&
                          paginatedStudents.every((s) => selectedIds.includes(s.id))
                        }
                        onCheckedChange={() => {
                          const pageIds = paginatedStudents.map((s) => s.id);
                          const allOnPage =
                            pageIds.length > 0 &&
                            pageIds.every((id) => selectedIds.includes(id));
                          if (allOnPage) {
                            setSelectedIds((prev) => prev.filter((id) => !pageIds.includes(id)));
                          } else {
                            setSelectedIds((prev) => Array.from(new Set([...prev, ...pageIds])));
                          }
                        }}
                      />
                    </TableHead>
                    <TableHead>Student</TableHead>
                    <TableHead>Attendance</TableHead>
                    <TableHead>Top assignment</TableHead>
                    <TableHead>Certificate</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {studentsLoading && visibleStudents.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center py-12 text-muted-foreground">
                        <Loader2 className="size-6 animate-spin mx-auto mb-2 text-primary" />
                        Loading students…
                      </TableCell>
                    </TableRow>
                  ) : (
                    paginatedStudents.map((s) => {
                      const cert = certByUserId.get(certUserKey(s.id));
                      const topScore = assignmentScores[s.id];
                      return (
                        <TableRow key={s.id} className={selectedIds.includes(s.id) ? "bg-primary/5" : ""}>
                          <TableCell>
                            <Checkbox
                              checked={selectedIds.includes(s.id)}
                              onCheckedChange={() => toggleSelect(s.id)}
                            />
                          </TableCell>
                          <TableCell>
                            <div className="font-medium text-xs">{s.full_name}</div>
                            <div className="text-[10px] text-muted-foreground">{s.internship_domain || "—"}</div>
                          </TableCell>
                          <TableCell className="text-xs">
                            {s.percentage != null ? `${Number(s.percentage).toFixed(1)}%` : "—"}
                            {s.isEligible ? (
                              <Badge className="ml-1 text-[8px] bg-green-600">Eligible</Badge>
                            ) : null}
                          </TableCell>
                          <TableCell className="text-xs font-bold">
                            {topScore != null ? `${Math.round(topScore)}%` : scoresLoading ? "…" : "—"}
                          </TableCell>
                          <TableCell>
                            {cert ? (
                              <Badge variant="secondary" className="text-[9px]">
                                {cert.certificate_id}
                              </Badge>
                            ) : (
                              <span className="text-[10px] text-muted-foreground">Not issued</span>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                  {!studentsLoading && visibleStudents.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center py-12 text-muted-foreground">
                        No students match these filters.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </ScrollArea>
            {visibleStudents.length > 0 && (
              <div className="p-3 border-t bg-muted/10 flex flex-wrap items-center justify-between gap-3 text-xs">
                <span>
                  Page {safePage + 1} of {pageCount} · showing{" "}
                  {visibleStudents.length === 0
                    ? 0
                    : safePage * PAGE_SIZE + 1}
                  –
                  {Math.min(visibleStudents.length, (safePage + 1) * PAGE_SIZE)} of{" "}
                  {visibleStudents.length}
                </span>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={safePage === 0}
                    onClick={() => setStudentPage((p) => Math.max(0, p - 1))}
                  >
                    Previous
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={safePage >= pageCount - 1}
                    onClick={() => setStudentPage((p) => p + 1)}
                  >
                    Next
                  </Button>
                </div>
              </div>
            )}
            <div className="p-4 border-t flex flex-wrap items-center justify-between gap-3 bg-primary/5">
              <p className="text-sm font-bold">{selectedIds.length} selected</p>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  disabled={generating || scopedStudents.length === 0}
                  onClick={handleGenerateAllFiltered}
                >
                  Generate all in filter ({scopedStudents.length})
                </Button>
                <Button
                  variant="hero"
                  className="gap-2"
                  disabled={generating || selectedIds.length === 0}
                  onClick={handleGenerateSelected}
                >
                  {generating ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <CheckCircle2 className="size-4" />
                  )}
                  Generate selected
                </Button>
              </div>
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="download" className="space-y-4 mt-0">
          <Card className="p-4 border-none shadow-elegant space-y-4">
            <div className="flex flex-wrap items-end gap-3">
              <div className="relative flex-1 min-w-[200px]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-3 text-muted-foreground" />
                <Input
                  className="pl-8 h-9"
                  placeholder="Search name, cert ID, reg no., roll no..."
                  value={downloadSearch}
                  onChange={(e) => setDownloadSearch(e.target.value)}
                />
              </div>
              <Button
                variant="hero"
                className="gap-2"
                disabled={downloadingCerts || selectedDownloadIds.length === 0}
                onClick={() => void handleDownloadSelectedCerts()}
              >
                {downloadingCerts ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Download className="size-4" />
                )}
                Download selected ({selectedDownloadIds.length})
              </Button>
              <Button
                variant="outline"
                className="gap-2"
                disabled={downloadingCerts || downloadTotalCount === 0}
                onClick={() => void handleDownloadAllFiltered()}
              >
                {downloadingCerts ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Download className="size-4" />
                )}
                Download all filtered ({downloadTotalCount.toLocaleString()})
              </Button>
              <Button variant="outline" className="gap-2" onClick={() => void exportCertsXlsx()}>
                <Download className="size-4" />
                Export Excel ({downloadTotalCount.toLocaleString()})
              </Button>
            </div>
            {downloadingCerts && downloadProgress ? (
              <div className="rounded-lg border bg-muted/30 px-4 py-3 text-xs space-y-2">
                <div className="flex items-center justify-between gap-3 font-medium">
                  <span>
                    {downloadProgress.phase === "zipping"
                      ? "Creating ZIP file…"
                      : `Generating PDFs… ${downloadProgress.done} / ${downloadProgress.total}`}
                  </span>
                  <span className="text-muted-foreground">
                    {downloadProgress.phase === "zipping"
                      ? "Almost done"
                      : `${Math.round((downloadProgress.done / Math.max(1, downloadProgress.total)) * 100)}%`}
                  </span>
                </div>
                <div className="h-2 rounded-full bg-slate-200 overflow-hidden">
                  <div
                    className="h-full bg-primary transition-all duration-300"
                    style={{
                      width: `${
                        downloadProgress.phase === "zipping"
                          ? 100
                          : (downloadProgress.done / Math.max(1, downloadProgress.total)) * 100
                      }%`,
                    }}
                  />
                </div>
                <p className="text-[10px] text-muted-foreground">
                  Up to {BULK_CERT_DOWNLOAD_MAX} certificates per download. Keep this tab open until the ZIP saves.
                </p>
              </div>
            ) : null}
            <div className="grid md:grid-cols-2 gap-4 pt-2 border-t">
              <MultiSelectCheckboxGroup
                label="Universities"
                options={unis}
                selectedValues={downloadFilters.universities}
                onChange={(universities) =>
                  setDownloadFilters((f) => ({
                    ...f,
                    universities,
                    colleges: pruneCollegesForUniversities(colleges, unis, universities, f.colleges),
                  }))
                }
              />
              <MultiSelectCheckboxGroup
                label="Colleges"
                options={downloadCollegeOptions}
                selectedValues={downloadFilters.colleges}
                onChange={(collegesSelected) =>
                  setDownloadFilters((f) => ({ ...f, colleges: collegesSelected }))
                }
              />
              <MultiSelectCheckboxGroup
                label="Departments"
                options={ALL_DEPARTMENT_OPTIONS}
                selectedValues={downloadFilters.departments}
                onChange={(departments) =>
                  setDownloadFilters((f) => ({
                    ...f,
                    departments,
                    subjects: pruneSubjectsForDepartments(departments, f.subjects),
                  }))
                }
              />
              <MultiSelectCheckboxGroup
                label="Subjects"
                options={downloadSubjectOptions}
                selectedValues={downloadFilters.subjects}
                onChange={(subjects) => setDownloadFilters((f) => ({ ...f, subjects }))}
              />
              <div className="space-y-2">
                <Label>Domain</Label>
                <Select
                  value={downloadFilters.domain}
                  onValueChange={(domain) => setDownloadFilters((f) => ({ ...f, domain }))}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All domains</SelectItem>
                    {domains.map((d) => (
                      <SelectItem key={d.id} value={d.name}>{d.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Mode</Label>
                <InternshipModeFilterSelect
                  value={downloadFilters.mode}
                  onValueChange={(mode) => setDownloadFilters((f) => ({ ...f, mode }))}
                />
              </div>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="text-xs"
              onClick={() => setDownloadFilters(emptyCertificateAudienceFilters())}
            >
              Clear all filters
            </Button>
          </Card>
          <Card className="border-none shadow-elegant overflow-hidden">
            <div className="p-3 border-b bg-muted/20 flex flex-wrap items-center justify-between gap-2 text-xs">
              <span className="font-bold">
                {downloadTotalCount.toLocaleString()} certificate{downloadTotalCount === 1 ? "" : "s"} found
              </span>
              {downloadLoading ? (
                <span className="text-muted-foreground inline-flex items-center gap-1">
                  <Loader2 className="size-3 animate-spin" /> Loading…
                </span>
              ) : null}
            </div>
            <ScrollArea className="h-[420px]">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">
                      <Checkbox
                        checked={
                          downloadCerts.length > 0 &&
                          downloadCerts.every((c) => selectedDownloadIds.includes(c.id))
                        }
                        onCheckedChange={toggleDownloadPageSelection}
                        aria-label="Select all certificates on this page"
                        disabled={downloadLoading}
                      />
                    </TableHead>
                    <TableHead>Student</TableHead>
                    <TableHead>Certificate ID</TableHead>
                    <TableHead>Issued</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {downloadLoading && downloadCerts.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center py-12 text-muted-foreground">
                        <Loader2 className="size-6 animate-spin mx-auto mb-2 text-primary" />
                        Loading certificates…
                      </TableCell>
                    </TableRow>
                  ) : (
                    downloadCerts.map((c) => (
                    <TableRow
                      key={c.id}
                      className={selectedDownloadIds.includes(c.id) ? "bg-primary/5" : ""}
                    >
                      <TableCell>
                        <Checkbox
                          checked={selectedDownloadIds.includes(c.id)}
                          onCheckedChange={() => toggleDownloadSelect(c.id)}
                          aria-label={`Select ${c.student_name || "certificate"}`}
                        />
                      </TableCell>
                      <TableCell className="font-medium text-sm">{c.student_name}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="font-mono text-[10px]">
                          {c.certificate_id}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {c.created_at ? new Date(c.created_at).toLocaleDateString() : "—"}
                      </TableCell>
                      <TableCell className="text-right space-x-1">
                        <Button
                          variant="outline"
                          size="sm"
                          className="gap-1"
                          disabled={downloadingCertId === c.id || downloadingCerts}
                          onClick={() => void handleDownloadOneCert(c)}
                        >
                          {downloadingCertId === c.id ? (
                            <Loader2 className="size-4 animate-spin" />
                          ) : (
                            <Download className="size-4" />
                          )}
                          PDF
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="gap-1"
                          onClick={() => void openEditCert(c)}
                        >
                          <Pencil className="size-4" />
                          Edit
                        </Button>
                        {c.certificate_id && (
                          <Button variant="ghost" size="sm" className="gap-1" asChild>
                            <a
                              href={certificateVerifyUrl(c.certificate_id)}
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              <ExternalLink className="size-4" />
                              Verify
                            </a>
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                    ))
                  )}
                  {!downloadLoading && downloadCerts.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center py-12 text-muted-foreground">
                        No certificates match your search.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </ScrollArea>
            {downloadTotalCount > 0 && (
              <div className="p-4 bg-muted/10 border-t flex flex-col md:flex-row items-center justify-between gap-4">
                <div className="text-xs text-muted-foreground font-medium">
                  Showing{" "}
                  {downloadTotalCount === 0 ? 0 : safeDownloadPage * PAGE_SIZE + 1} to{" "}
                  {Math.min(downloadTotalCount, (safeDownloadPage + 1) * PAGE_SIZE)} of{" "}
                  {downloadTotalCount.toLocaleString()} certificates
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={safeDownloadPage === 0 || downloadLoading}
                    onClick={() => setDownloadPage((p) => Math.max(0, p - 1))}
                  >
                    Previous
                  </Button>
                  <div className="flex items-center gap-1">
                    {Array.from({ length: downloadPageCount }, (_, i) => i)
                      .filter((pageNum) => {
                        if (downloadPageCount <= 7) return true;
                        return (
                          Math.abs(pageNum - safeDownloadPage) <= 2 ||
                          pageNum === 0 ||
                          pageNum === downloadPageCount - 1
                        );
                      })
                      .map((pageNum, i, arr) => (
                        <div key={pageNum} className="flex items-center gap-1">
                          {i > 0 && pageNum - arr[i - 1] > 1 && (
                            <span className="text-muted-foreground px-1 text-xs">...</span>
                          )}
                          <Button
                            variant={safeDownloadPage === pageNum ? "default" : "outline"}
                            size="sm"
                            className="size-8 p-0"
                            onClick={() => setDownloadPage(pageNum)}
                            disabled={downloadLoading}
                          >
                            {pageNum + 1}
                          </Button>
                        </div>
                      ))}
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={
                      (safeDownloadPage + 1) * PAGE_SIZE >= downloadTotalCount || downloadLoading
                    }
                    onClick={() => setDownloadPage((p) => p + 1)}
                  >
                    Next
                  </Button>
                </div>
              </div>
            )}
            {downloadTotalCount > 0 && (
              <div className="p-4 border-t flex flex-wrap items-center justify-between gap-3 bg-primary/5">
                <p className="text-sm font-bold">{selectedDownloadIds.length} selected</p>
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={selectingAllDownloads || downloadLoading}
                    onClick={() => void toggleSelectAllFilteredDownloads()}
                  >
                    {selectingAllDownloads ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : selectedDownloadIds.length === downloadTotalCount && downloadTotalCount > 0 ? (
                      "Clear selection"
                    ) : (
                      `Select all (${downloadTotalCount.toLocaleString()})`
                    )}
                  </Button>
                  <Button
                    variant="hero"
                    size="sm"
                    className="gap-2"
                    disabled={downloadingCerts || selectedDownloadIds.length === 0}
                    onClick={() => void handleDownloadSelectedCerts()}
                  >
                    {downloadingCerts ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <Download className="size-4" />
                    )}
                    Download selected ({selectedDownloadIds.length})
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-2"
                    disabled={downloadingCerts || downloadTotalCount === 0}
                    onClick={() => void handleDownloadAllFiltered()}
                  >
                    {downloadingCerts ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <Download className="size-4" />
                    )}
                    Download all filtered ({downloadTotalCount.toLocaleString()})
                  </Button>
                </div>
              </div>
            )}
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={!!editingCert} onOpenChange={(open) => !open && setEditingCert(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>Edit certificate</DialogTitle>
            <DialogDescription>
              Edit all certificate fields. Certificate ID{" "}
              <span className="font-mono font-bold">{editingCert?.certificate_id}</span> and issue
              date cannot be changed.
            </DialogDescription>
          </DialogHeader>
          <ScrollArea className="flex-1 pr-4">
            <div className="grid sm:grid-cols-2 gap-4 py-2">
              <div className="space-y-2">
                <Label>Student name</Label>
                <Input
                  value={editForm.studentName}
                  onChange={(e) => patchEditForm({ studentName: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>University roll no.</Label>
                <Input
                  value={editForm.universityRollNo}
                  onChange={(e) => patchEditForm({ universityRollNo: e.target.value })}
                />
              </div>
              {isBnmuStudent(editForm.universityName) ? (
                <div className="space-y-2">
                  <Label>University registration no. (BNMU)</Label>
                  <Input
                    value={editForm.universityRegistrationNumber}
                    onChange={(e) =>
                      patchEditForm({ universityRegistrationNumber: e.target.value })
                    }
                  />
                </div>
              ) : null}
              <div className="space-y-2">
                <Label>University</Label>
                <Select
                  value={editForm.universityName || "__none__"}
                  onValueChange={(v) =>
                    patchEditForm({
                      universityName: v === "__none__" ? "" : v,
                      collegeName: "",
                    })
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select university" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Select university</SelectItem>
                    {editForm.universityName &&
                      !unis.some((u) => u.name === editForm.universityName) && (
                        <SelectItem value={editForm.universityName}>
                          {editForm.universityName}
                        </SelectItem>
                      )}
                    {unis.map((u) => (
                      <SelectItem key={u.id} value={u.name}>
                        {u.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>College / institution</Label>
                <Select
                  value={editForm.collegeName || "__none__"}
                  onValueChange={(v) =>
                    patchEditForm({ collegeName: v === "__none__" ? "" : v })
                  }
                  disabled={!editForm.universityName}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select college" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Select college</SelectItem>
                    {editForm.collegeName &&
                      !editCollegesForUniversity.some((c) => c.name === editForm.collegeName) && (
                        <SelectItem value={editForm.collegeName}>
                          {editForm.collegeName}
                        </SelectItem>
                      )}
                    {editCollegesForUniversity.map((c) => (
                      <SelectItem key={c.id} value={c.name}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Degree</Label>
                <Select
                  value={editForm.degree || "__none__"}
                  onValueChange={(v) =>
                    patchEditForm({
                      degree: v === "__none__" ? "" : v,
                      department: "",
                      subject: "",
                    })
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select degree" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Select degree</SelectItem>
                    <SelectItem value="UG">UG</SelectItem>
                    <SelectItem value="PG">PG</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Department</Label>
                <Select
                  value={editForm.department || "__none__"}
                  onValueChange={(v) =>
                    patchEditForm({
                      department: v === "__none__" ? "" : v,
                      subject: "",
                    })
                  }
                  disabled={!editForm.degree}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select department" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Select department</SelectItem>
                    {editForm.department &&
                      !editDepartmentOptions.some((d) => d === editForm.department) && (
                        <SelectItem value={editForm.department}>{editForm.department}</SelectItem>
                      )}
                    {editDepartmentOptions.map((d) => (
                      <SelectItem key={d} value={d}>
                        {d}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label>Subject / major</Label>
                {editSubjectOptions.length > 0 ? (
                  <Select
                    value={editForm.subject || "__none__"}
                    onValueChange={(v) =>
                      patchEditForm({ subject: v === "__none__" ? "" : v })
                    }
                    disabled={!editForm.department}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select subject" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">Select subject</SelectItem>
                      {editForm.subject && !editSubjectOptions.includes(editForm.subject) && (
                        <SelectItem value={editForm.subject}>{editForm.subject}</SelectItem>
                      )}
                      {editSubjectOptions.map((s) => (
                        <SelectItem key={s} value={s}>
                          {s}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <Input
                    value={editForm.subject}
                    onChange={(e) => patchEditForm({ subject: e.target.value })}
                    placeholder="e.g. Physics, History"
                    disabled={!editForm.department}
                  />
                )}
              </div>
              <div className="space-y-2">
                <Label>Academic session</Label>
                <Select
                  value={editForm.academicSession || "__none__"}
                  onValueChange={(v) =>
                    patchEditForm({ academicSession: v === "__none__" ? "" : v })
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select session" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Select session</SelectItem>
                    {editForm.academicSession &&
                      !ACADEMIC_SESSIONS.includes(editForm.academicSession) && (
                        <SelectItem value={editForm.academicSession}>
                          {editForm.academicSession}
                        </SelectItem>
                      )}
                    {ACADEMIC_SESSIONS.map((s) => (
                      <SelectItem key={s} value={s}>
                        {s}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Internship domain</Label>
                <Select
                  value={editForm.internshipDomain || "__none__"}
                  onValueChange={(v) =>
                    patchEditForm({ internshipDomain: v === "__none__" ? "" : v })
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select domain" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Select domain</SelectItem>
                    {editForm.internshipDomain &&
                      !domains.some((d) => d.name === editForm.internshipDomain) && (
                        <SelectItem value={editForm.internshipDomain}>
                          {editForm.internshipDomain}
                        </SelectItem>
                      )}
                    {domains.map((d) => (
                      <SelectItem key={d.id} value={d.name}>
                        {d.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Internship duration</Label>
                <Input
                  value={editForm.internshipDuration}
                  onChange={(e) => patchEditForm({ internshipDuration: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Mode of internship</Label>
                <Select
                  value={editForm.internshipMode || "Online"}
                  onValueChange={(v) => patchEditForm({ internshipMode: v })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select mode" />
                  </SelectTrigger>
                  <SelectContent>
                    {INTERNSHIP_MODES.map((mode) => (
                      <SelectItem key={mode} value={mode}>
                        {mode}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Total hours completed</Label>
                <Input
                  value={editForm.totalHours}
                  onChange={(e) => patchEditForm({ totalHours: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Credits recommended</Label>
                <Input
                  value={editForm.creditsRecommended}
                  onChange={(e) => patchEditForm({ creditsRecommended: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Marks % (90–100)</Label>
                <Input
                  value={editForm.marksPercent}
                  onChange={(e) => patchEditForm({ marksPercent: e.target.value })}
                />
              </div>
            </div>
          </ScrollArea>
          <DialogFooter className="pt-4">
            <Button variant="outline" onClick={() => setEditingCert(null)}>
              Cancel
            </Button>
            <Button onClick={() => void saveCertEdit()} disabled={savingCertEdit}>
              {savingCertEdit ? <Loader2 className="size-4 animate-spin" /> : "Save changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
