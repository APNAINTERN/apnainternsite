import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Papa from "papaparse";
import * as XLSX from "xlsx";
import { supabase } from "@/integrations/supabase/client";
import { fetchAllSupabaseRows } from "@/lib/fetchAllSupabaseRows";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import {
  AlertTriangle,
  Building2,
  Download,
  Eye,
  FileSpreadsheet,
  Loader2,
  MoreHorizontal,
  Pencil,
  Plus,
  Search,
  Trash2,
  Upload,
  Users,
} from "lucide-react";
import { normalisePhone } from "@/lib/collegeRoster";

type SummaryRow = {
  college_id: string;
  college_name: string;
  university_id: string | null;
  university_name: string | null;
  total_rows: number;
  claimed_rows: number;
  pending_rows: number;
  last_uploaded_at: string | null;
};

type RosterRow = {
  id: string;
  reference_number: string | null;
  full_name: string | null;
  raw_data: Record<string, string> | null;
  claimed_user_id: string | null;
  claimed_at: string | null;
  created_at: string;
};

type Uni = { id: string; name: string };
type College = { id: string; name: string; university_id: string };

const NEW_COLLEGE_SENTINEL = "__new_college__";
const NEW_UNIVERSITY_SENTINEL = "__new_university__";

export const CollegeRostersPanel = () => {
  const [summaries, setSummaries] = useState<SummaryRow[]>([]);
  const [tableLoading, setTableLoading] = useState(true);
  const [search, setSearch] = useState("");

  const [unis, setUnis] = useState<Uni[]>([]);
  const [colleges, setColleges] = useState<College[]>([]);

  // Add / Re-upload dialog
  const [addOpen, setAddOpen] = useState(false);
  const [addUniId, setAddUniId] = useState("");
  const [addCollegeId, setAddCollegeId] = useState("");
  const [newUniName, setNewUniName] = useState("");
  const [newCollegeName, setNewCollegeName] = useState("");
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [pendingHeaders, setPendingHeaders] = useState<string[]>([]);
  const [pendingRows, setPendingRows] = useState<Record<string, string>[]>([]);
  const [importing, setImporting] = useState(false);
  // When set, the dialog is in "re-upload" mode for this college.
  const [editingCollege, setEditingCollege] = useState<SummaryRow | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Delete confirmation
  const [deleteTarget, setDeleteTarget] = useState<SummaryRow | null>(null);
  const [deleteAlsoClaimed, setDeleteAlsoClaimed] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Detail dialog
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailCollege, setDetailCollege] = useState<SummaryRow | null>(null);
  const [detailRows, setDetailRows] = useState<RosterRow[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailSearch, setDetailSearch] = useState("");

  const loadSummaries = useCallback(async () => {
    setTableLoading(true);
    const { data, error } = await supabase
      .from("college_roster_summary")
      .select("*")
      .order("last_uploaded_at", { ascending: false });
    if (error) toast.error(error.message);
    setSummaries((data || []) as SummaryRow[]);
    setTableLoading(false);
  }, []);

  const loadUnis = useCallback(async () => {
    const { data } = await supabase.from("universities").select("id,name").order("name");
    setUnis((data || []) as Uni[]);
  }, []);

  useEffect(() => {
    loadSummaries();
    loadUnis();
  }, [loadSummaries, loadUnis]);

  useEffect(() => {
    if (!addUniId || addUniId === NEW_UNIVERSITY_SENTINEL) {
      setColleges([]);
      setAddCollegeId("");
      return;
    }
    supabase
      .from("colleges")
      .select("id,name,university_id")
      .eq("university_id", addUniId)
      .order("name")
      .then(({ data }) => setColleges((data || []) as College[]));
  }, [addUniId]);

  // Mapping is no longer required — every row's full content goes to
  // prefilled_students.raw_data regardless of column shape.

  const filteredSummaries = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return summaries;
    return summaries.filter(
      (r) =>
        r.college_name?.toLowerCase().includes(q) ||
        r.university_name?.toLowerCase().includes(q)
    );
  }, [summaries, search]);

  const resetAddDialog = () => {
    setAddUniId("");
    setAddCollegeId("");
    setNewUniName("");
    setNewCollegeName("");
    setPendingFile(null);
    setPendingHeaders([]);
    setPendingRows([]);
    setEditingCollege(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  // Open the Add dialog in "edit / re-upload" mode for a known college.
  const openReupload = (row: SummaryRow) => {
    resetAddDialog();
    setEditingCollege(row);
    if (row.university_id) setAddUniId(row.university_id);
    setAddCollegeId(row.college_id);
    setAddOpen(true);
  };

  const parseCsv = (file: File): Promise<{ headers: string[]; rows: Record<string, string>[] }> =>
    new Promise((resolve, reject) => {
      Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        transformHeader: (h) => h.trim(),
        complete: (results) => {
          const headers = (results.meta.fields || []).map((h) => h.trim());
          const rows = (results.data as Record<string, string>[]).map((row) => {
            const r: Record<string, string> = {};
            for (const h of headers) r[h] = String(row[h] ?? "").trim();
            return r;
          });
          resolve({ headers, rows });
        },
        error: reject,
      });
    });

  const parseXlsx = async (file: File) => {
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, { type: "array" });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rowsAoa: string[][] = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: "" });
    if (!rowsAoa.length) return { headers: [], rows: [] };
    const headers = rowsAoa[0].map((h) => String(h).trim()).filter(Boolean);
    const rows = rowsAoa.slice(1).map((arr) => {
      const r: Record<string, string> = {};
      headers.forEach((h, i) => (r[h] = String(arr[i] ?? "").trim()));
      return r;
    });
    return { headers, rows };
  };

  const handleFile = async (file: File | null) => {
    if (!file) return;
    setPendingFile(file);
    try {
      const isXlsx = /\.(xlsx|xls)$/i.test(file.name);
      const { headers, rows } = isXlsx ? await parseXlsx(file) : await parseCsv(file);
      if (!headers.length) {
        toast.error("Couldn't detect any column headers in this file.");
        setPendingHeaders([]);
        setPendingRows([]);
        return;
      }
      setPendingHeaders(headers);
      setPendingRows(rows);
      toast.success(`Parsed ${rows.length} row${rows.length === 1 ? "" : "s"}`);
    } catch (e: any) {
      toast.error(e?.message || "Failed to parse file");
    }
  };

  const ensureCollege = async (): Promise<{ collegeId: string; universityId: string } | null> => {
    let uniId = addUniId;
    let collegeId = addCollegeId;

    // Create new university if requested.
    if (uniId === NEW_UNIVERSITY_SENTINEL) {
      const name = newUniName.trim();
      if (!name) {
        toast.error("Please enter the new university name");
        return null;
      }
      const { data: existing } = await supabase
        .from("universities")
        .select("id")
        .ilike("name", name)
        .maybeSingle();
      if (existing?.id) {
        uniId = existing.id;
      } else {
        const { data: insUni, error: insUniErr } = await supabase
          .from("universities")
          .insert({ name })
          .select("id")
          .single();
        if (insUniErr) {
          toast.error(insUniErr.message);
          return null;
        }
        uniId = insUni.id;
      }
      setAddUniId(uniId);
      await loadUnis();
    }

    // Create new college if requested.
    if (collegeId === NEW_COLLEGE_SENTINEL || !collegeId) {
      const name = newCollegeName.trim();
      if (!name) {
        toast.error("Please pick a college or enter a new college name");
        return null;
      }
      const { data: existing } = await supabase
        .from("colleges")
        .select("id")
        .eq("university_id", uniId)
        .ilike("name", name)
        .maybeSingle();
      if (existing?.id) {
        collegeId = existing.id;
      } else {
        const { data: insColl, error: insCollErr } = await supabase
          .from("colleges")
          .insert({ name, university_id: uniId })
          .select("id")
          .single();
        if (insCollErr) {
          toast.error(insCollErr.message);
          return null;
        }
        collegeId = insColl.id;
      }
    }

    return { collegeId, universityId: uniId };
  };

  const handleImport = async () => {
    if (!pendingRows.length) {
      toast.error("Upload a CSV / XLSX file first");
      return;
    }

    setImporting(true);
    try {
      const ensured = await ensureCollege();
      if (!ensured) {
        setImporting(false);
        return;
      }
      const { collegeId, universityId: ensuredUniId } = ensured;

      // No-mapping flow: every row's full content is dumped into
      // `prefilled_students.raw_data`. We still need ONE indexable column —
      // the reference / roll / admission number — so we silently auto-detect
      // it by header name. DOB is auto-detected too if present.
      const headers = pendingHeaders;
      const findHeader = (...patterns: RegExp[]) =>
        headers.find((h) => patterns.some((p) => p.test(h))) || "";

      const refColumn = findHeader(
        /reg(\.|istration)?[\s_-]*(no|number|num|id)/i,
        /roll[\s_-]*(no|number|num)/i,
        /enroll?ment[\s_-]*(no|number|id)/i,
        /admission[\s_-]*(no|number|id)/i,
        /^ref(\.|erence)?[\s_-]*(no|number)?$/i,
        /univ[\s_-]*(reg|roll)/i
      );

      if (!refColumn) {
        toast.error(
          "Couldn't auto-detect a reference / roll / admission number column. Make sure the file has one of those headers."
        );
        setImporting(false);
        return;
      }

      const dobColumn = findHeader(/^dob$/i, /date[\s_-]*of[\s_-]*birth/i, /birth[\s_-]*date/i);
      const nameColumn = findHeader(/^name$/i, /full[\s_-]*name/i, /student[\s_-]*name/i, /candidate/i);
      const fatherColumn = findHeader(/father/i, /parent[\s_-]*name/i, /guardian/i);
      const genderColumn = findHeader(/gender/i, /^sex$/i);
      const subjectColumn = findHeader(
        /major[\s_-]*subject/i,
        /honou?rs[\s_-]*subject/i,
        /^subject$/i,
        /subject[\s_-]*name/i,
        /specialisation/i,
        /specialization/i,
        /honou?rs/i,
        /^paper$/i,
      );
      // "Programme Name" / "Course Enrolled" / "Programme" → department
      // (Bachelor of Arts → B.A. via normalizeDepartment).
      const departmentColumn = findHeader(
        /department/i,
        /^dept/i,
        /branch/i,
        /^stream$/i,
        /programme[\s_-]*name/i,
        /^programme$/i,
        /^program$/i,
        /course[\s_-]*enrolled/i,
        /^course$/i,
      );
      const sessionColumn = findHeader(
        /session[\s_-]*year/i,
        /^session$/i,
        /batch/i,
        /academic[\s_-]*year/i,
        /^session\(s\)$/i,
      );
      const semesterColumn = findHeader(
        /sem(ester)?/i,
        /^sem$/i,
        /current[\s_-]*year/i,
        /study[\s_-]*year/i,
        /^year$/i,
        /\byr\b/i,
      );
      // Internship domain: be specific so we don't clash with department.
      const domainColumn = findHeader(
        /internship[\s_-]*domain/i,
        /^domain$/i,
        /internship[\s_-]*course/i,
        /domain[\s_-]*name/i,
      );

      const get = (row: Record<string, string>, col: string) => {
        if (!col) return null;
        const v = String(row[col] ?? "").trim();
        return v.length ? v : null;
      };

      const phoneColumn = findHeader(/phone/i, /mobile/i, /contact[\s_-]*(no|number)?/i, /whats?app/i);
      const emailColumn = findHeader(/^e[\s_-]*mail$/i, /email/i, /mail[\s_-]*id/i);

      // ---- 1. Write the full raw row into prefilled_students (lookup table) -----
      const prefilledRows = pendingRows
        .map((row) => {
          const refRaw = String(row[refColumn] ?? "").trim();
          if (!refRaw) return null;
          return {
            reference_number: refRaw,
            full_name: get(row, nameColumn),
            father_name: get(row, fatherColumn),
            gender: get(row, genderColumn),
            dob: get(row, dobColumn),
            university_id: ensuredUniId,
            university_name: unis.find((u) => u.id === ensuredUniId)?.name || null,
            college_id: collegeId,
            college_name:
              colleges.find((c) => c.id === collegeId)?.name ||
              editingCollege?.college_name ||
              null,
            degree: null,
            department: get(row, departmentColumn),
            subject: get(row, subjectColumn),
            session: get(row, sessionColumn),
            semester: get(row, semesterColumn),
            internship_domain: get(row, domainColumn),
            raw_data: row,
          };
        })
        .filter((r): r is NonNullable<typeof r> => Boolean(r));

      let inserted = 0;
      if (prefilledRows.length) {
        const CHUNK = 500;
        for (let i = 0; i < prefilledRows.length; i += CHUNK) {
          const slice = prefilledRows.slice(i, i + CHUNK);
          const { error } = await supabase
            .from("prefilled_students")
            .upsert(slice, { onConflict: "reference_number", ignoreDuplicates: false });
          if (error) throw error;
          inserted += slice.length;
        }
      }

      // ---- 2. Best-effort mirror into college_student_rosters so the summary
      //         count + "View students" detail view continue to work. Silent
      //         failure is OK — the prefilled write above is the source of truth.
      try {
        const rosterPayload = pendingRows
          .map((row) => {
            const out: Record<string, string> = {};
            const n = get(row, nameColumn);
            const ref = String(row[refColumn] ?? "").trim();
            const eml = get(row, emailColumn);
            const ph = get(row, phoneColumn);
            if (n) out.full_name = n;
            if (ref) out.registration_number = ref;
            if (eml) out.email = eml;
            if (ph) out.phone = normalisePhone(ph);
            const fa = get(row, fatherColumn);
            if (fa) out.parent_name = fa;
            const gn = get(row, genderColumn);
            if (gn) out.gender = gn;
            const dp = get(row, departmentColumn);
            if (dp) out.department = dp;
            const sb = get(row, subjectColumn);
            if (sb) out.subject = sb;
            const sm = get(row, semesterColumn);
            if (sm) out.class_semester = sm;
            const ss = get(row, sessionColumn);
            if (ss) out.academic_session = ss;
            const db = get(row, dobColumn);
            if (db) out.dob = db;
            return out;
          })
          .filter((r) => r.full_name || r.email || r.phone || r.registration_number);

        if (rosterPayload.length) {
          await supabase.rpc("upsert_college_roster_rows", {
            p_college_id: collegeId,
            p_rows: rosterPayload,
            p_source_file: pendingFile?.name || null,
          });
        }
      } catch (rosterErr) {
        // Non-fatal — primary import (prefilled_students) already succeeded.
        console.warn("Mirror to college_student_rosters failed:", rosterErr);
      }

      const skipped = pendingRows.length - prefilledRows.length;
      const bits = [`Imported ${inserted} row${inserted === 1 ? "" : "s"}`];
      if (skipped) bits.push(`${skipped} skipped (blank reference)`);
      toast.success(bits.join(" · "));
      resetAddDialog();
      setAddOpen(false);
      await loadSummaries();
    } catch (e: any) {
      toast.error(e?.message || "Import failed");
    } finally {
      setImporting(false);
    }
  };

  const openDetail = async (row: SummaryRow) => {
    setDetailCollege(row);
    setDetailOpen(true);
    setDetailRows([]);
    setDetailSearch("");
    setDetailLoading(true);
    try {
      const data = await fetchAllSupabaseRows(supabase, "prefilled_students", {
        select: "id,reference_number,full_name,raw_data,claimed_user_id,claimed_at,created_at",
        orderBy: "created_at",
        ascending: false,
        modify: (q) => q.eq("college_id", row.college_id),
      });
      setDetailRows(data as RosterRow[]);
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "Failed to load roster");
    }
    setDetailLoading(false);
  };

  const filteredDetail = useMemo(() => {
    const q = detailSearch.trim().toLowerCase();
    if (!q) return detailRows;
    return detailRows.filter((r) => {
      const flat = [
        r.reference_number,
        r.full_name,
        ...Object.values(r.raw_data || {}),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return flat.includes(q);
    });
  }, [detailRows, detailSearch]);

  const deleteRow = async (id: string) => {
    if (!confirm("Delete this row? This cannot be undone.")) return;
    const { error } = await supabase.from("prefilled_students").delete().eq("id", id);
    if (error) return toast.error(error.message);
    setDetailRows((rs) => rs.filter((r) => r.id !== id));
    loadSummaries();
    toast.success("Row deleted");
  };

  const exportDetailCsv = () => {
    if (!detailRows.length) return;
    // Export every column the original CSV had (taken from raw_data), plus
    // reference / status metadata.
    const rows = filteredDetail.map((r) => ({
      reference_number: r.reference_number || "",
      ...(r.raw_data || {}),
      status: r.claimed_user_id ? "Registered" : "Pending",
    }));
    const csv = Papa.unparse(rows);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${detailCollege?.college_name || "roster"}.csv`.replace(/\s+/g, "_");
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <Card className="p-6 shadow-elegant border-t-4 border-t-primary">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h2 className="text-2xl font-black tracking-tight text-slate-900 flex items-center gap-2">
              <Building2 className="size-6 text-primary" /> College Rosters
            </h2>
            <p className="text-xs text-slate-500 font-medium mt-1">
              Upload pre-approved student lists per college. Students from these colleges only enter
              basic details on the public form — the rest is auto-filled and they jump straight to payment.
            </p>
          </div>
          <Button size="sm" onClick={() => setAddOpen(true)} className="gap-2">
            <Plus className="size-4" /> Add college roster
          </Button>
        </div>

        <div className="mt-5 flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-slate-400" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by college or university name"
              className="pl-9"
            />
          </div>
        </div>
      </Card>

      <Card className="shadow-elegant overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-slate-50">
              <TableHead>College</TableHead>
              <TableHead>University</TableHead>
              <TableHead className="text-right">Total</TableHead>
              <TableHead className="text-right">Registered</TableHead>
              <TableHead className="text-right">Pending</TableHead>
              <TableHead>Last upload</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {tableLoading ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-10">
                  <Loader2 className="size-5 animate-spin inline" />
                </TableCell>
              </TableRow>
            ) : filteredSummaries.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-10 text-slate-400 text-sm">
                  No college roster uploaded yet. Click "Add college roster" to get started.
                </TableCell>
              </TableRow>
            ) : (
              filteredSummaries.map((r) => (
                <TableRow
                  key={r.college_id}
                  className="cursor-pointer hover:bg-slate-50"
                  onClick={() => openDetail(r)}
                >
                  <TableCell className="font-bold text-slate-900">{r.college_name}</TableCell>
                  <TableCell className="text-slate-700">{r.university_name || "—"}</TableCell>
                  <TableCell className="text-right font-bold">{r.total_rows}</TableCell>
                  <TableCell className="text-right">
                    <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100">
                      {r.claimed_rows}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <Badge variant="secondary">{r.pending_rows}</Badge>
                  </TableCell>
                  <TableCell className="text-xs text-slate-500">
                    {r.last_uploaded_at ? new Date(r.last_uploaded_at).toLocaleString() : "—"}
                  </TableCell>
                  <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button size="sm" variant="ghost">
                          <MoreHorizontal className="size-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-52">
                        <DropdownMenuLabel className="text-xs">Roster actions</DropdownMenuLabel>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={() => openDetail(r)} className="gap-2">
                          <Eye className="size-4" /> View students
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => openReupload(r)} className="gap-2">
                          <Pencil className="size-4" /> Edit / re-upload
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          onClick={() => {
                            setDeleteTarget(r);
                            setDeleteAlsoClaimed(false);
                          }}
                          className="gap-2 text-red-600 focus:text-red-700"
                        >
                          <Trash2 className="size-4" /> Delete roster
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>

      {/* Add roster dialog */}
      <Dialog
        open={addOpen}
        onOpenChange={(o) => {
          setAddOpen(o);
          if (!o) resetAddDialog();
        }}
      >
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileSpreadsheet className="size-5 text-primary" />
              {editingCollege ? `Re-upload roster — ${editingCollege.college_name}` : "Add college roster"}
            </DialogTitle>
            <DialogDescription>
              {editingCollege
                ? "Upload a corrected file. Existing students are matched by reference / roll number and updated in place — duplicates are not created."
                : "Pick the college (or create a new one) and upload a CSV or XLSX. Every column in the file is saved as-is — no mapping required."}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-5 max-h-[60vh] overflow-y-auto pr-2">
            {editingCollege ? (
              <div className="rounded-lg border bg-slate-50 p-3 text-sm flex items-center gap-3">
                <Building2 className="size-4 text-primary" />
                <div className="flex-1">
                  <p className="font-bold text-slate-900">{editingCollege.college_name}</p>
                  <p className="text-xs text-slate-500">{editingCollege.university_name || "—"}</p>
                </div>
                <Badge variant="secondary" className="text-[10px]">
                  Existing roster ({editingCollege.total_rows} rows)
                </Badge>
              </div>
            ) : (
              <div className="grid sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-xs font-bold">University *</Label>
                  <Select value={addUniId} onValueChange={setAddUniId}>
                    <SelectTrigger><SelectValue placeholder="Select university" /></SelectTrigger>
                    <SelectContent>
                      {unis.map((u) => (
                        <SelectItem key={u.id} value={u.id}>
                          {u.name}
                        </SelectItem>
                      ))}
                      <SelectItem value={NEW_UNIVERSITY_SENTINEL}>+ Create new university…</SelectItem>
                    </SelectContent>
                  </Select>
                  {addUniId === NEW_UNIVERSITY_SENTINEL && (
                    <Input
                      placeholder="New university name"
                      value={newUniName}
                      onChange={(e) => setNewUniName(e.target.value)}
                      className="mt-2"
                    />
                  )}
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs font-bold">College *</Label>
                  <Select
                    value={addCollegeId}
                    onValueChange={setAddCollegeId}
                    disabled={!addUniId || (addUniId === NEW_UNIVERSITY_SENTINEL && !newUniName)}
                  >
                    <SelectTrigger><SelectValue placeholder="Select college" /></SelectTrigger>
                    <SelectContent>
                      {colleges.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.name}
                        </SelectItem>
                      ))}
                      <SelectItem value={NEW_COLLEGE_SENTINEL}>+ Create new college…</SelectItem>
                    </SelectContent>
                  </Select>
                  {(addCollegeId === NEW_COLLEGE_SENTINEL || addUniId === NEW_UNIVERSITY_SENTINEL) && (
                    <Input
                      placeholder="New college name"
                      value={newCollegeName}
                      onChange={(e) => setNewCollegeName(e.target.value)}
                      className="mt-2"
                    />
                  )}
                </div>
              </div>
            )}

            <div className="space-y-1.5">
              <Label className="text-xs font-bold">Roster file (.csv, .xlsx, .xls) *</Label>
              <div className="flex items-center gap-3">
                <Input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv,.xlsx,.xls,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
                  onChange={(e) => handleFile(e.target.files?.[0] || null)}
                />
                {pendingFile && (
                  <span className="text-xs text-slate-500 truncate max-w-[200px]">
                    {pendingFile.name} — {pendingRows.length} row{pendingRows.length === 1 ? "" : "s"}
                  </span>
                )}
              </div>
            </div>

            {pendingHeaders.length > 0 && (
              <div className="space-y-3">
                <div className="rounded-lg border bg-emerald-50/60 border-emerald-200 p-3">
                  <p className="text-[11px] text-emerald-900 leading-relaxed">
                    <b>{pendingRows.length}</b> row{pendingRows.length === 1 ? "" : "s"} found
                    with <b>{pendingHeaders.length}</b> column{pendingHeaders.length === 1 ? "" : "s"}.
                    Every column is saved verbatim so it can be used to pre-fill the registration
                    form later. No manual mapping needed.
                  </p>
                </div>

                <div className="rounded-lg border bg-white">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 px-3 pt-3">
                    Preview (showing first 50 of {pendingRows.length} · all columns)
                  </p>
                  <div className="overflow-auto max-h-[320px]">
                    <table className="w-full text-[11px]">
                      <thead className="bg-slate-50 sticky top-0 z-10">
                        <tr>
                          {pendingHeaders.map((h) => (
                            <th
                              key={h}
                              className="text-left font-bold text-slate-700 px-2 py-1.5 whitespace-nowrap border-b bg-slate-50"
                            >
                              {h}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {pendingRows.slice(0, 50).map((row, i) => (
                          <tr key={i} className="border-b last:border-b-0 hover:bg-slate-50/40">
                            {pendingHeaders.map((h) => (
                              <td
                                key={h}
                                className="px-2 py-1.5 text-slate-700 font-mono whitespace-nowrap max-w-[220px] truncate"
                              >
                                {row[h] || "—"}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}
          </div>

          <DialogFooter className="gap-2 border-t pt-4 mt-2">
            <Button variant="ghost" onClick={() => setAddOpen(false)} disabled={importing}>
              Cancel
            </Button>
            <Button
              onClick={handleImport}
              disabled={importing || !pendingRows.length}
              className="gap-2 min-w-[180px]"
            >
              {importing ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Upload className="size-4" />
              )}
              {pendingRows.length
                ? `Save & Import ${pendingRows.length} row${pendingRows.length === 1 ? "" : "s"}`
                : "Save & Import"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <Dialog
        open={!!deleteTarget}
        onOpenChange={(o) => {
          if (!o) {
            setDeleteTarget(null);
            setDeleteAlsoClaimed(false);
          }
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600">
              <AlertTriangle className="size-5" /> Delete roster?
            </DialogTitle>
            <DialogDescription>
              This will remove the uploaded student list for{" "}
              <span className="font-bold text-slate-900">{deleteTarget?.college_name}</span>.
              Students who have already registered keep their account; they're only removed from
              this roster.
            </DialogDescription>
          </DialogHeader>

          {deleteTarget && deleteTarget.claimed_rows > 0 && (
            <div className="rounded-lg border-2 border-amber-300 bg-amber-50 p-3 text-xs space-y-2">
              <p className="font-bold text-amber-900">
                {deleteTarget.claimed_rows} student
                {deleteTarget.claimed_rows === 1 ? " has" : "s have"} already registered from this
                roster.
              </p>
              <label className="flex items-start gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={deleteAlsoClaimed}
                  onChange={(e) => setDeleteAlsoClaimed(e.target.checked)}
                  className="mt-0.5"
                />
                <span className="text-amber-900">
                  Yes, delete claimed rows too. Their student accounts and offer letters are not
                  affected — only the roster history.
                </span>
              </label>
            </div>
          )}

          <DialogFooter className="gap-2">
            <Button
              variant="ghost"
              onClick={() => {
                setDeleteTarget(null);
                setDeleteAlsoClaimed(false);
              }}
              disabled={deleting}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={deleting || (!!deleteTarget?.claimed_rows && !deleteAlsoClaimed)}
              onClick={async () => {
                if (!deleteTarget) return;
                setDeleting(true);
                try {
                  let query = supabase
                    .from("college_student_rosters")
                    .delete()
                    .eq("college_id", deleteTarget.college_id);
                  if (!deleteAlsoClaimed) {
                    query = query.is("claimed_user_id", null);
                  }
                  const { error } = await query;
                  if (error) throw error;
                  // Also drop the saved column mapping so a fresh upload re-runs auto-detection.
                  await supabase
                    .from("college_roster_mappings")
                    .delete()
                    .eq("college_id", deleteTarget.college_id);
                  toast.success(`Roster removed for ${deleteTarget.college_name}`);
                  setDeleteTarget(null);
                  setDeleteAlsoClaimed(false);
                  await loadSummaries();
                } catch (e: any) {
                  toast.error(e?.message || "Delete failed");
                } finally {
                  setDeleting(false);
                }
              }}
              className="gap-2"
            >
              {deleting ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
              Delete roster
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Detail dialog */}
      <Dialog
        open={detailOpen}
        onOpenChange={(o) => {
          setDetailOpen(o);
          if (!o) {
            setDetailCollege(null);
            setDetailRows([]);
          }
        }}
      >
        <DialogContent className="max-w-5xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Users className="size-5 text-primary" /> {detailCollege?.college_name}
            </DialogTitle>
            <DialogDescription>
              {detailCollege?.university_name || "—"} — {detailCollege?.total_rows || 0} students
              uploaded ({detailCollege?.claimed_rows || 0} registered, {detailCollege?.pending_rows || 0} pending).
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-slate-400" />
              <Input
                value={detailSearch}
                onChange={(e) => setDetailSearch(e.target.value)}
                placeholder="Search students…"
                className="pl-9"
              />
            </div>
            <Button variant="outline" size="sm" onClick={exportDetailCsv} className="gap-2">
              <Download className="size-4" /> Export CSV
            </Button>
          </div>

          <div className="h-[55vh] border rounded-lg overflow-auto">
            {(() => {
              // Derive the column list dynamically from the union of raw_data
              // keys across all returned rows. This way the table reflects the
              // actual CSV shape, no matter what columns the admin uploaded.
              const dynamicColumns = Array.from(
                filteredDetail.reduce((set, r) => {
                  Object.keys(r.raw_data || {}).forEach((k) => set.add(k));
                  return set;
                }, new Set<string>())
              );
              const totalCols = dynamicColumns.length + 3; // ref + status + actions

              return (
                <Table className="min-w-max">
                  <TableHeader className="bg-slate-50 sticky top-0 z-10">
                    <TableRow>
                      <TableHead className="whitespace-nowrap bg-slate-50">Reference No.</TableHead>
                      {dynamicColumns.map((c) => (
                        <TableHead key={c} className="whitespace-nowrap bg-slate-50">
                          {c}
                        </TableHead>
                      ))}
                      <TableHead className="whitespace-nowrap bg-slate-50">Status</TableHead>
                      <TableHead className="text-right bg-slate-50">—</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {detailLoading ? (
                      <TableRow>
                        <TableCell colSpan={totalCols} className="text-center py-8">
                          <Loader2 className="size-5 animate-spin inline" />
                        </TableCell>
                      </TableRow>
                    ) : filteredDetail.length === 0 ? (
                      <TableRow>
                        <TableCell
                          colSpan={totalCols}
                          className="text-center py-10 text-slate-400 text-sm"
                        >
                          No rows match.
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredDetail.map((r) => (
                        <TableRow key={r.id}>
                          <TableCell className="text-xs font-mono font-bold">
                            {r.reference_number || "—"}
                          </TableCell>
                          {dynamicColumns.map((c) => (
                            <TableCell
                              key={c}
                              className="text-xs whitespace-nowrap max-w-[220px] truncate"
                            >
                              {String((r.raw_data && r.raw_data[c]) ?? "—")}
                            </TableCell>
                          ))}
                          <TableCell>
                            {r.claimed_user_id ? (
                              <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100">
                                Registered
                              </Badge>
                            ) : (
                              <Badge variant="secondary">Pending</Badge>
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => deleteRow(r.id)}
                              disabled={!!r.claimed_user_id}
                              title={
                                r.claimed_user_id
                                  ? "Already registered — cannot delete"
                                  : "Delete row"
                              }
                            >
                              <Trash2 className="size-4 text-red-500" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              );
            })()}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};
