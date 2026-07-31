import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Download,
  FileSpreadsheet,
  Loader2,
  Pencil,
  Plus,
  Trash2,
  Upload,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { Checkbox } from "@/components/ui/checkbox";
import {
  beginStudentDataUploadSheet,
  deleteAllStudentDataUploadImports,
  deleteImportedStudentRecord,
  deleteImportedStudentRecords,
  deleteStudentDataUploadSheet,
  downloadFailedStudentDataUploadRows,
  downloadStudentDataUploadCsvTemplate,
  downloadStudentDataUploadSheetXlsx,
  downloadStudentDataUploadXlsxTemplate,
  emptyStudentDataUploadAddForm,
  fetchImportedStudentsFromUpload,
  fetchStudentDataUploadHistory,
  fetchStudentsForUploadSheet,
  getStudentDataUploadPaymentTag,
  parseStudentDataUploadFile,
  processStudentDataUploadRows,
  saveStudentDataUploadHistory,
  STUDENT_DATA_UPLOAD_REQUIRED_HEADERS,
  studentDataUploadAddFormToRow,
  type StudentDataUploadHistoryRow,
  type StudentDataUploadImportedStudent,
  type StudentDataUploadMode,
  type StudentDataUploadProcessResult,
  type StudentDataUploadRow,
  type StudentDataUploadValidationError,
  updateImportedStudentRecord,
  validateStudentDataUploadRows,
} from "@/lib/studentDataUpload";

const PAGE_SIZE = 20;

function PaginationBar({
  page,
  pageCount,
  total,
  onPageChange,
  label,
}: {
  page: number;
  pageCount: number;
  total: number;
  onPageChange: (page: number) => void;
  label: string;
}) {
  if (total <= 0) return null;
  const safePage = Math.min(page, Math.max(0, pageCount - 1));
  const from = safePage * PAGE_SIZE + 1;
  const to = Math.min(total, (safePage + 1) * PAGE_SIZE);
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600">
      <span>
        {label}: {from}–{to} of {total}
      </span>
      <div className="ml-auto flex items-center gap-1">
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-8 px-2"
          disabled={safePage <= 0}
          onClick={() => onPageChange(safePage - 1)}
        >
          <ChevronLeft className="size-4" />
        </Button>
        <span className="px-1 font-semibold">
          {safePage + 1}/{Math.max(pageCount, 1)}
        </span>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-8 px-2"
          disabled={safePage >= pageCount - 1}
          onClick={() => onPageChange(safePage + 1)}
        >
          <ChevronRight className="size-4" />
        </Button>
      </div>
    </div>
  );
}

type Props = {
  client: SupabaseClient;
  onLogAction?: (
    actionType: string,
    entityType: string,
    description: string,
    metadata?: Record<string, unknown>
  ) => Promise<void>;
  onSuccess?: () => void | Promise<void>;
};

export function StudentDataUploadPanel({ client, onLogAction, onSuccess }: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [mode, setMode] = useState<StudentDataUploadMode>("paid");
  const [fileName, setFileName] = useState("");
  const [validating, setValidating] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [validationErrors, setValidationErrors] = useState<StudentDataUploadValidationError[]>([]);
  const [previewRows, setPreviewRows] = useState<StudentDataUploadRow[] | null>(null);
  const [results, setResults] = useState<StudentDataUploadProcessResult[] | null>(null);
  const [history, setHistory] = useState<StudentDataUploadHistoryRow[]>([]);
  const [imported, setImported] = useState<StudentDataUploadImportedStudent[]>([]);
  const [loadingMeta, setLoadingMeta] = useState(false);
  const [editTarget, setEditTarget] = useState<StudentDataUploadImportedStudent | null>(null);
  const [editForm, setEditForm] = useState<Record<string, string>>({});
  const [savingEdit, setSavingEdit] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deletingSheetId, setDeletingSheetId] = useState<string | null>(null);
  const [downloadingSheetId, setDownloadingSheetId] = useState<string | null>(null);
  const [deletingAllImported, setDeletingAllImported] = useState(false);
  const [selectedImportedIds, setSelectedImportedIds] = useState<Set<string>>(new Set());
  const [deletingSelected, setDeletingSelected] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [addForm, setAddForm] = useState<Record<string, string>>(() => emptyStudentDataUploadAddForm());
  const [addingStudent, setAddingStudent] = useState(false);
  const [previewPage, setPreviewPage] = useState(0);
  const [resultsPage, setResultsPage] = useState(0);
  const [historyPage, setHistoryPage] = useState(0);
  const [importedPage, setImportedPage] = useState(0);
  const [importedSearch, setImportedSearch] = useState("");

  const reloadMeta = useCallback(async () => {
    setLoadingMeta(true);
    try {
      const h = await fetchStudentDataUploadHistory(client).catch((err) => {
        console.warn("[student-data-upload] history load:", err);
        return null;
      });
      const students = await fetchImportedStudentsFromUpload(client).catch((err) => {
        console.warn("[student-data-upload] imported load:", err);
        return null;
      });
      if (h) {
        setHistory(h);
        setHistoryPage(0);
      }
      if (students) {
        setImported(students);
        setSelectedImportedIds(new Set());
        setImportedPage(0);
      }
    } finally {
      setLoadingMeta(false);
    }
  }, [client]);

  useEffect(() => {
    void reloadMeta();
  }, [reloadMeta]);

  const resetUploadState = () => {
    setFileName("");
    setValidationErrors([]);
    setPreviewRows(null);
    setResults(null);
    setProgress({ done: 0, total: 0 });
    setPreviewPage(0);
    setResultsPage(0);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setValidating(true);
    setValidationErrors([]);
    setPreviewRows(null);
    setResults(null);
    setFileName(file.name);

    try {
      const rows = await parseStudentDataUploadFile(file);
      const errors = validateStudentDataUploadRows(rows);
      if (errors.length > 0) {
        setValidationErrors(errors);
        toast.error(`Found ${errors.length} validation issue(s). Fix the file and upload again.`);
        return;
      }
      setPreviewRows(rows);
      setPreviewPage(0);
      toast.success(`Ready to import ${rows.length} student${rows.length === 1 ? "" : "s"}.`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to read upload file.");
      resetUploadState();
    } finally {
      setValidating(false);
    }
  };

  const handleImport = async () => {
    if (!previewRows?.length || uploading) return;
    setUploading(true);
    setResults(null);
    setProgress({ done: 0, total: previewRows.length });

    const uploadId =
      typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(16).slice(2)}`;

    try {
      const {
        data: { user },
      } = await client.auth.getUser();

      await beginStudentDataUploadSheet(client, {
        uploadId,
        mode,
        fileName,
        uploadedBy: user?.id || null,
      });

      const processResults = await processStudentDataUploadRows(
        client,
        previewRows,
        mode,
        (done, total) => setProgress({ done, total }),
        uploadId
      );

      setResults(processResults);
      setResultsPage(0);
      setPreviewRows(null);

      const importedCount = processResults.filter((r) => r.success).length;
      const skippedCount = processResults.filter((r) => !r.success && r.skipped).length;
      const failedCount = processResults.filter((r) => !r.success && !r.skipped).length;

      await saveStudentDataUploadHistory(client, {
        uploadId,
        mode,
        fileName,
        results: processResults,
        uploadedBy: user?.id || null,
      });

      if (failedCount === 0 && skippedCount === 0) {
        toast.success(`Imported ${importedCount} student(s).`);
      } else {
        toast.warning(
          `Imported ${importedCount}; skipped ${skippedCount}; failed ${failedCount}.`
        );
      }

      if (importedCount > 0) {
        await onLogAction?.(
          "STUDENT_DATA_UPLOAD",
          "student",
          `Admin ${mode} student data upload: ${importedCount} imported`,
          {
            mode,
            imported: importedCount,
            skipped: skippedCount,
            failed: failedCount,
            file_name: fileName,
            upload_id: uploadId,
          }
        );
        await onSuccess?.();
      }

      await reloadMeta();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Import failed.");
    } finally {
      setUploading(false);
    }
  };

  const openEdit = (row: StudentDataUploadImportedStudent) => {
    setEditTarget(row);
    setEditForm({
      full_name: row.full_name || "",
      gender: row.gender || "",
      parent_name: row.parent_name || "",
      contact_number: row.contact_number || "",
      email: row.email || "",
      university_name: row.university_name || "",
      college_name: row.college_name || "",
      degree: row.degree || "",
      department: row.department || "",
      academic_session: row.academic_session || "",
      class_semester: row.class_semester || "",
      registration_id: row.registration_id || "",
      roll_number: row.roll_number || "",
      internship_domain: row.internship_domain || "",
      status: row.status || "Active",
    });
  };

  const saveEdit = async () => {
    if (!editTarget) return;
    setSavingEdit(true);
    try {
      await updateImportedStudentRecord(client, editTarget.id, editForm);
      toast.success("Student record updated.");
      setEditTarget(null);
      await reloadMeta();
      await onSuccess?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Update failed.");
    } finally {
      setSavingEdit(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm("Delete this imported student record from the directory?")) return;
    setDeletingId(id);
    try {
      await deleteImportedStudentRecord(client, id);
      setSelectedImportedIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      toast.success("Student record deleted.");
      await reloadMeta();
      await onSuccess?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Delete failed.");
    } finally {
      setDeletingId(null);
    }
  };

  const handleDeleteSelected = async () => {
    const ids = [...selectedImportedIds];
    if (ids.length === 0) return;
    const ok = window.confirm(
      `Delete ${ids.length} selected imported student${ids.length === 1 ? "" : "s"}?`
    );
    if (!ok) return;
    setDeletingSelected(true);
    try {
      const result = await deleteImportedStudentRecords(client, ids);
      toast.success(`Deleted ${result.deletedStudents} selected student(s).`);
      setSelectedImportedIds(new Set());
      await onLogAction?.(
        "STUDENT_DATA_UPLOAD_DELETE_SELECTED",
        "student_data_upload",
        `Deleted ${result.deletedStudents} selected Student Data Upload students`,
        { deleted_students: result.deletedStudents, ids }
      );
      await reloadMeta();
      await onSuccess?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete selected records.");
    } finally {
      setDeletingSelected(false);
    }
  };

  const handleAddSingleStudent = async () => {
    const row = studentDataUploadAddFormToRow(addForm, 1);
    const errors = validateStudentDataUploadRows([row]);
    if (errors.length > 0) {
      toast.error(errors[0]?.message || "Please fill all required fields.");
      return;
    }

    setAddingStudent(true);
    try {
      const {
        data: { user },
      } = await client.auth.getUser();

      const uploadId =
        typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random().toString(16).slice(2)}`;

      await beginStudentDataUploadSheet(client, {
        uploadId,
        mode,
        fileName: "manual-single-add",
        uploadedBy: user?.id || null,
      });

      const processResults = await processStudentDataUploadRows(
        client,
        [row],
        mode,
        undefined,
        uploadId
      );

      await saveStudentDataUploadHistory(client, {
        uploadId,
        mode,
        fileName: "manual-single-add",
        results: processResults,
        uploadedBy: user?.id || null,
      });

      const ok = processResults[0]?.success;
      if (!ok) {
        toast.error(processResults[0]?.message || "Failed to add student.");
        await reloadMeta();
        return;
      }

      toast.success("Student added.");
      setAddOpen(false);
      setAddForm(emptyStudentDataUploadAddForm());
      await onLogAction?.(
        "STUDENT_DATA_UPLOAD_SINGLE_ADD",
        "student",
        `Admin ${mode} single student add: ${row.email}`,
        { mode, upload_id: uploadId, email: row.email, registration: row.registrationNumber }
      );
      await reloadMeta();
      await onSuccess?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to add student.");
    } finally {
      setAddingStudent(false);
    }
  };

  const handleDeleteSheet = async (row: StudentDataUploadHistoryRow) => {
    const count = Number(row.imported_count || 0);
    const ok = window.confirm(
      `Delete this entire uploaded sheet?\n\nFile: ${row.file_name || "—"}\nThis will remove ${count} imported student(s) from this upload and remove the history entry.`
    );
    if (!ok) return;
    setDeletingSheetId(row.id);
    try {
      const result = await deleteStudentDataUploadSheet(client, row.id, {
        knownUserIds: row.imported_user_ids,
      });
      toast.success(
        `Sheet deleted${result.deletedStudents ? ` (${result.deletedStudents} imported student(s) removed)` : " (history cleared)"}.`
      );
      await onLogAction?.(
        "STUDENT_DATA_UPLOAD_DELETE_SHEET",
        "student_data_upload",
        `Deleted student data upload sheet ${row.file_name || row.id}`,
        {
          upload_id: row.id,
          file_name: row.file_name,
          deleted_students: result.deletedStudents,
        }
      );
      await reloadMeta();
      await onSuccess?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete sheet.");
    } finally {
      setDeletingSheetId(null);
    }
  };

  const handleDownloadSheet = async (row: StudentDataUploadHistoryRow) => {
    setDownloadingSheetId(row.id);
    try {
      const students = await fetchStudentsForUploadSheet(client, row.id);
      if (students.length === 0) {
        toast.error("No imported students found for this sheet.");
        return;
      }
      downloadStudentDataUploadSheetXlsx(students, row.file_name);
      toast.success(`Downloaded ${students.length} student(s) from this sheet.`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to download sheet.");
    } finally {
      setDownloadingSheetId(null);
    }
  };

  const handleDeleteAllImported = async () => {
    const ok = window.confirm(
      `Delete ALL Student Data Upload imported records?\n\nThis removes every student created via Student Data Upload (${imported.length} currently listed) and clears upload history.`
    );
    if (!ok) return;
    setDeletingAllImported(true);
    try {
      const result = await deleteAllStudentDataUploadImports(client);
      toast.success(`Removed ${result.deletedStudents} imported student(s).`);
      await onLogAction?.(
        "STUDENT_DATA_UPLOAD_DELETE_ALL",
        "student_data_upload",
        `Deleted all Student Data Upload imported students (${result.deletedStudents})`,
        { deleted_students: result.deletedStudents }
      );
      await reloadMeta();
      await onSuccess?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete imported records.");
    } finally {
      setDeletingAllImported(false);
    }
  };

  const importedCount = results?.filter((r) => r.success).length ?? 0;
  const skippedCount = results?.filter((r) => !r.success && r.skipped).length ?? 0;
  const failedCount = results?.filter((r) => !r.success && !r.skipped).length ?? 0;
  const showPreview = previewRows != null && previewRows.length > 0 && !results;

  const previewPageCount = Math.max(1, Math.ceil((previewRows?.length || 0) / PAGE_SIZE));
  const previewSlice = useMemo(() => {
    if (!previewRows?.length) return [];
    const page = Math.min(previewPage, previewPageCount - 1);
    return previewRows.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  }, [previewRows, previewPage, previewPageCount]);

  const resultsPageCount = Math.max(1, Math.ceil((results?.length || 0) / PAGE_SIZE));
  const resultsSlice = useMemo(() => {
    if (!results?.length) return [];
    const page = Math.min(resultsPage, resultsPageCount - 1);
    return results.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  }, [results, resultsPage, resultsPageCount]);

  const filteredImported = useMemo(() => {
    const q = importedSearch.trim().toLowerCase();
    if (!q) return imported;
    return imported.filter(
      (row) =>
        String(row.full_name || "")
          .toLowerCase()
          .includes(q) ||
        String(row.email || "")
          .toLowerCase()
          .includes(q) ||
        String(row.registration_id || "")
          .toLowerCase()
          .includes(q) ||
        String(row.college_name || "")
          .toLowerCase()
          .includes(q)
    );
  }, [imported, importedSearch]);

  const historyPageCount = Math.max(1, Math.ceil(history.length / PAGE_SIZE));
  const historySlice = useMemo(() => {
    const page = Math.min(historyPage, historyPageCount - 1);
    return history.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  }, [history, historyPage, historyPageCount]);

  const importedPageCount = Math.max(1, Math.ceil(filteredImported.length / PAGE_SIZE));
  const importedSlice = useMemo(() => {
    const page = Math.min(importedPage, importedPageCount - 1);
    return filteredImported.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  }, [filteredImported, importedPage, importedPageCount]);

  const selectedCount = selectedImportedIds.size;
  const pageAllSelected =
    importedSlice.length > 0 && importedSlice.every((row) => selectedImportedIds.has(row.id));
  const pageSomeSelected =
    importedSlice.some((row) => selectedImportedIds.has(row.id)) && !pageAllSelected;

  const toggleSelectAllPage = (checked: boolean) => {
    setSelectedImportedIds((prev) => {
      const next = new Set(prev);
      for (const row of importedSlice) {
        if (checked) next.add(row.id);
        else next.delete(row.id);
      }
      return next;
    });
  };

  const toggleSelectOne = (id: string, checked: boolean) => {
    setSelectedImportedIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  useEffect(() => {
    setImportedPage(0);
  }, [importedSearch]);

  return (
    <div className="space-y-8 animate-fade-in">
      <div className="rounded-2xl border bg-white p-6 shadow-sm space-y-5">
        <div>
          <h2 className="text-xl font-black text-slate-900">Student Data Upload</h2>
          <p className="text-sm text-slate-600 mt-1">
            Admin / Super Admin only. Import paid or unpaid students from Excel/CSV. Registration
            Number must be unique; contact number and email duplicates are allowed.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant={mode === "paid" ? "default" : "outline"}
            className={mode === "paid" ? "bg-emerald-600 hover:bg-emerald-700 font-bold" : ""}
            onClick={() => setMode("paid")}
            disabled={uploading}
          >
            Paid Students
          </Button>
          <Button
            type="button"
            variant={mode === "unpaid" ? "default" : "outline"}
            className={mode === "unpaid" ? "bg-amber-600 hover:bg-amber-700 font-bold" : ""}
            onClick={() => setMode("unpaid")}
            disabled={uploading}
          >
            Unpaid Students
          </Button>
          <Badge variant="outline" className="ml-auto self-center">
            {mode === "paid" ? "Full dashboard after login" : "Payment required after login"}
          </Badge>
        </div>

        <div className="rounded-xl border bg-slate-50 p-4 text-sm text-slate-700">
          <p className="text-xs font-bold uppercase tracking-wide text-slate-500 mb-2">
            Template columns
          </p>
          <p>{STUDENT_DATA_UPLOAD_REQUIRED_HEADERS.join(" · ")}</p>
        </div>

        {!showPreview && !results ? (
          <div className="flex flex-wrap gap-3">
            <Button
              type="button"
              variant="outline"
              className="gap-2"
              onClick={downloadStudentDataUploadCsvTemplate}
              disabled={validating || uploading}
            >
              <Download className="size-4" />
              Sample CSV
            </Button>
            <Button
              type="button"
              variant="outline"
              className="gap-2"
              onClick={downloadStudentDataUploadXlsxTemplate}
              disabled={validating || uploading}
            >
              <FileSpreadsheet className="size-4" />
              Sample Excel
            </Button>
            <Button
              type="button"
              className="gap-2 bg-primary font-bold ml-auto"
              onClick={() => fileInputRef.current?.click()}
              disabled={validating || uploading}
            >
              {validating ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
              Choose file (.csv / .xlsx)
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,.xlsx,.xls,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              className="hidden"
              onChange={(e) => void handleFileChange(e)}
            />
          </div>
        ) : null}

        {fileName ? (
          <p className="text-sm text-muted-foreground">
            File: <span className="font-semibold text-slate-800">{fileName}</span>
          </p>
        ) : null}

        {validationErrors.length > 0 ? (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 space-y-2">
            <div className="flex items-center gap-2 font-semibold text-amber-900">
              <AlertTriangle className="size-4" />
              Fix these rows before import
            </div>
            <ScrollArea className="max-h-40">
              <ul className="text-sm space-y-1">
                {validationErrors.map((e, idx) => (
                  <li key={`${e.rowNumber}-${idx}`}>
                    {e.rowNumber > 0 ? `Row ${e.rowNumber}: ` : ""}
                    {e.message}
                  </li>
                ))}
              </ul>
            </ScrollArea>
            <Button type="button" variant="outline" size="sm" onClick={resetUploadState}>
              Clear &amp; choose another file
            </Button>
          </div>
        ) : null}

        {uploading ? (
          <div className="rounded-xl border border-emerald-100 bg-emerald-50/60 p-4 text-sm">
            <div className="flex items-center gap-2 font-semibold text-emerald-900">
              <Loader2 className="size-4 animate-spin" />
              Importing {progress.done}/{progress.total}…
            </div>
          </div>
        ) : null}

        {showPreview ? (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <p className="font-semibold text-slate-800">
                Preview — {previewRows.length} row{previewRows.length === 1 ? "" : "s"}
              </p>
              <Button
                type="button"
                className="ml-auto gap-2 bg-emerald-600 hover:bg-emerald-700 font-bold"
                onClick={() => void handleImport()}
                disabled={uploading}
              >
                Import {mode === "paid" ? "Paid" : "Unpaid"} Students
              </Button>
              <Button type="button" variant="outline" onClick={resetUploadState} disabled={uploading}>
                Cancel
              </Button>
            </div>
            <ScrollArea className="h-72 rounded-xl border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Row</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Reg. No.</TableHead>
                    <TableHead>College</TableHead>
                    <TableHead>Domain</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {previewSlice.map((row) => (
                    <TableRow key={row.rowNumber}>
                      <TableCell>{row.rowNumber}</TableCell>
                      <TableCell>{row.fullName}</TableCell>
                      <TableCell>{row.email}</TableCell>
                      <TableCell>{row.registrationNumber}</TableCell>
                      <TableCell>{row.college}</TableCell>
                      <TableCell>{row.internshipDomain}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </ScrollArea>
            <PaginationBar
              page={previewPage}
              pageCount={previewPageCount}
              total={previewRows.length}
              onPageChange={setPreviewPage}
              label="Preview"
            />
          </div>
        ) : null}

        {results ? (
          <div className="space-y-3">
            <div className="flex flex-wrap gap-3 items-center">
              <Badge className="bg-emerald-600 gap-1">
                <CheckCircle2 className="size-3" /> Imported {importedCount}
              </Badge>
              <Badge variant="secondary" className="gap-1">
                Skipped {skippedCount}
              </Badge>
              <Badge variant="destructive" className="gap-1">
                <XCircle className="size-3" /> Failed {failedCount}
              </Badge>
              <Badge variant="outline">Total {results.length}</Badge>
              {(skippedCount > 0 || failedCount > 0) && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="gap-2 ml-auto"
                  onClick={() => downloadFailedStudentDataUploadRows(results)}
                >
                  <Download className="size-4" />
                  Download Failed Records
                </Button>
              )}
              <Button type="button" variant="outline" size="sm" onClick={resetUploadState}>
                Upload another file
              </Button>
            </div>
            <ScrollArea className="h-64 rounded-xl border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Row</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Reg. No.</TableHead>
                    <TableHead>Result</TableHead>
                    <TableHead>Message</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {resultsSlice.map((r) => (
                    <TableRow key={`${r.rowNumber}-${r.email}`}>
                      <TableCell>{r.rowNumber}</TableCell>
                      <TableCell>{r.email}</TableCell>
                      <TableCell>{r.registrationNumber}</TableCell>
                      <TableCell>
                        {r.success ? "Imported" : r.skipped ? "Skipped" : "Failed"}
                      </TableCell>
                      <TableCell className="text-slate-600">{r.message || "—"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </ScrollArea>
            <PaginationBar
              page={resultsPage}
              pageCount={resultsPageCount}
              total={results.length}
              onPageChange={setResultsPage}
              label="Results"
            />
          </div>
        ) : null}
      </div>

      <div className="rounded-2xl border bg-white p-6 shadow-sm space-y-4">
        <div className="flex items-center gap-2">
          <h3 className="text-lg font-black">Upload History</h3>
          {loadingMeta ? <Loader2 className="size-4 animate-spin text-slate-400" /> : null}
        </div>
        <p className="text-sm text-slate-600">
          Download a sheet export or delete an uploaded sheet to remove that batch of imported
          students in one action.
        </p>
        {history.length === 0 ? (
          <p className="text-sm text-slate-500">No uploads yet.</p>
        ) : (
          <>
            <p className="text-xs text-slate-500">
              Scroll vertically and horizontally to browse rows and reach Download / Delete.
            </p>
            <div className="max-h-80 w-full overflow-x-scroll overflow-y-auto rounded-xl border border-slate-200 bg-white [scrollbar-gutter:stable]">
              <table className="w-max min-w-[1180px] caption-bottom text-sm">
                <TableHeader>
                  <TableRow>
                    <TableHead className="sticky top-0 z-10 whitespace-nowrap bg-white">When</TableHead>
                    <TableHead className="sticky top-0 z-10 whitespace-nowrap bg-white">Mode</TableHead>
                    <TableHead className="sticky top-0 z-10 min-w-[180px] bg-white">File</TableHead>
                    <TableHead className="sticky top-0 z-10 whitespace-nowrap bg-white">Total</TableHead>
                    <TableHead className="sticky top-0 z-10 whitespace-nowrap bg-white">Imported</TableHead>
                    <TableHead className="sticky top-0 z-10 whitespace-nowrap bg-white">Skipped</TableHead>
                    <TableHead className="sticky top-0 z-10 whitespace-nowrap bg-white">Failed</TableHead>
                    <TableHead className="sticky top-0 right-0 z-20 whitespace-nowrap bg-white text-right shadow-[-6px_0_8px_-6px_rgba(0,0,0,0.12)]">
                      Actions
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {historySlice.map((h) => (
                    <TableRow key={h.id}>
                      <TableCell className="whitespace-nowrap">
                        {new Date(h.created_at).toLocaleString()}
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        {String(h.upload_mode).toLowerCase() === "unpaid" ? (
                          <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100 border-amber-200">
                            Unpaid
                          </Badge>
                        ) : (
                          <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100 border-emerald-200">
                            Paid
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="min-w-[220px] max-w-[320px]" title={h.file_name || undefined}>
                        <span className="block truncate">{h.file_name || "—"}</span>
                      </TableCell>
                      <TableCell className="whitespace-nowrap">{h.total_rows}</TableCell>
                      <TableCell className="whitespace-nowrap">{h.imported_count}</TableCell>
                      <TableCell className="whitespace-nowrap">{h.skipped_count}</TableCell>
                      <TableCell className="whitespace-nowrap">{h.failed_count}</TableCell>
                      <TableCell className="sticky right-0 z-10 whitespace-nowrap bg-white text-right shadow-[-6px_0_8px_-6px_rgba(0,0,0,0.12)]">
                        <div className="inline-flex flex-nowrap items-center justify-end gap-2">
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="h-8 shrink-0 gap-1"
                            disabled={downloadingSheetId === h.id}
                            onClick={() => void handleDownloadSheet(h)}
                          >
                            {downloadingSheetId === h.id ? (
                              <Loader2 className="size-3 animate-spin" />
                            ) : (
                              <Download className="size-3" />
                            )}
                            Download
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="destructive"
                            className="h-8 shrink-0 gap-1"
                            disabled={deletingSheetId === h.id}
                            onClick={() => void handleDeleteSheet(h)}
                          >
                            {deletingSheetId === h.id ? (
                              <Loader2 className="size-3 animate-spin" />
                            ) : (
                              <Trash2 className="size-3" />
                            )}
                            Delete sheet
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </table>
            </div>
            <PaginationBar
              page={historyPage}
              pageCount={historyPageCount}
              total={history.length}
              onPageChange={setHistoryPage}
              label="History"
            />
          </>
        )}
      </div>

      <div className="rounded-2xl border bg-white p-6 shadow-sm space-y-4">
        <div className="flex flex-wrap items-start gap-3">
          <div className="min-w-0 flex-1">
            <h3 className="text-lg font-black">Imported Records</h3>
            <p className="text-sm text-slate-600 mt-1">
              Select records to delete, delete one by one, or add a single student. Deleting a sheet
              in Upload History also removes that sheet&apos;s imported students.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="gap-1"
              onClick={() => {
                setAddForm(emptyStudentDataUploadAddForm());
                setAddOpen(true);
              }}
            >
              <Plus className="size-3" />
              Add single student
            </Button>
            {selectedCount > 0 ? (
              <Button
                type="button"
                size="sm"
                variant="destructive"
                className="gap-1"
                disabled={deletingSelected}
                onClick={() => void handleDeleteSelected()}
              >
                {deletingSelected ? (
                  <Loader2 className="size-3 animate-spin" />
                ) : (
                  <Trash2 className="size-3" />
                )}
                Delete selected ({selectedCount})
              </Button>
            ) : null}
            {imported.length > 0 ? (
              <Button
                type="button"
                size="sm"
                variant="destructive"
                className="gap-1"
                disabled={deletingAllImported}
                onClick={() => void handleDeleteAllImported()}
              >
                {deletingAllImported ? (
                  <Loader2 className="size-3 animate-spin" />
                ) : (
                  <Trash2 className="size-3" />
                )}
                Delete all imported
              </Button>
            ) : null}
          </div>
        </div>
        <Input
          value={importedSearch}
          onChange={(e) => setImportedSearch(e.target.value)}
          placeholder="Search name, email, registration no, college…"
          className="max-w-md"
        />
        {filteredImported.length === 0 ? (
          <p className="text-sm text-slate-500">No imported students found.</p>
        ) : (
          <>
            <p className="text-xs text-slate-500">
              Scroll vertically and horizontally to browse rows. Use checkboxes to select, then
              Delete selected — or use Edit / Delete on each row.
            </p>
            <div className="max-h-80 w-full overflow-x-scroll overflow-y-auto rounded-xl border border-slate-200 bg-white [scrollbar-gutter:stable]">
              <table className="w-max min-w-[1180px] caption-bottom text-sm">
                <TableHeader>
                  <TableRow>
                    <TableHead className="sticky top-0 left-0 z-30 w-12 bg-white">
                      <Checkbox
                        checked={pageAllSelected ? true : pageSomeSelected ? "indeterminate" : false}
                        onCheckedChange={(v) => toggleSelectAllPage(v === true)}
                        aria-label="Select all on this page"
                      />
                    </TableHead>
                    <TableHead className="sticky top-0 z-10 whitespace-nowrap bg-white">Name</TableHead>
                    <TableHead className="sticky top-0 z-10 whitespace-nowrap bg-white">Email</TableHead>
                    <TableHead className="sticky top-0 z-10 whitespace-nowrap bg-white">Reg. No.</TableHead>
                    <TableHead className="sticky top-0 z-10 min-w-[180px] bg-white">College</TableHead>
                    <TableHead className="sticky top-0 z-10 whitespace-nowrap bg-white">Payment</TableHead>
                    <TableHead className="sticky top-0 z-10 whitespace-nowrap bg-white">Status</TableHead>
                    <TableHead className="sticky top-0 right-0 z-20 whitespace-nowrap bg-white text-right shadow-[-6px_0_8px_-6px_rgba(0,0,0,0.12)]">
                      Actions
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {importedSlice.map((row) => {
                    const paymentTag = getStudentDataUploadPaymentTag(row.metadata);
                    const checked = selectedImportedIds.has(row.id);
                    return (
                      <TableRow key={row.id} data-state={checked ? "selected" : undefined}>
                        <TableCell className="sticky left-0 z-10 bg-white">
                          <Checkbox
                            checked={checked}
                            onCheckedChange={(v) => toggleSelectOne(row.id, v === true)}
                            aria-label={`Select ${row.full_name || row.email || row.id}`}
                          />
                        </TableCell>
                        <TableCell className="whitespace-nowrap">{row.full_name || "—"}</TableCell>
                        <TableCell className="whitespace-nowrap">{row.email || "—"}</TableCell>
                        <TableCell className="whitespace-nowrap">{row.registration_id || "—"}</TableCell>
                        <TableCell className="min-w-[180px] max-w-[280px]">
                          <span className="block truncate">{row.college_name || "—"}</span>
                        </TableCell>
                        <TableCell className="whitespace-nowrap">
                          {paymentTag === "unpaid" ? (
                            <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100 border-amber-200">
                              Unpaid
                            </Badge>
                          ) : (
                            <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100 border-emerald-200">
                              Paid
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="whitespace-nowrap">{row.status || "—"}</TableCell>
                        <TableCell className="sticky right-0 z-10 whitespace-nowrap bg-white text-right shadow-[-6px_0_8px_-6px_rgba(0,0,0,0.12)]">
                          <div className="inline-flex flex-nowrap items-center justify-end gap-2">
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              className="h-8 shrink-0 gap-1"
                              onClick={() => openEdit(row)}
                            >
                              <Pencil className="size-3" /> Edit
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant="destructive"
                              className="h-8 shrink-0 gap-1"
                              disabled={deletingId === row.id || deletingSelected}
                              onClick={() => void handleDelete(row.id)}
                            >
                              {deletingId === row.id ? (
                                <Loader2 className="size-3 animate-spin" />
                              ) : (
                                <Trash2 className="size-3" />
                              )}
                              Delete
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </table>
            </div>
            <PaginationBar
              page={importedPage}
              pageCount={importedPageCount}
              total={filteredImported.length}
              onPageChange={setImportedPage}
              label="Imported"
            />
          </>
        )}
      </div>

      <Dialog open={!!editTarget} onOpenChange={(open) => !open && setEditTarget(null)}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit imported student</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 py-2">
            {(
              [
                ["full_name", "Full Name"],
                ["gender", "Gender"],
                ["parent_name", "Parent Name"],
                ["contact_number", "Contact Number"],
                ["email", "Email"],
                ["university_name", "University"],
                ["college_name", "College"],
                ["degree", "Degree"],
                ["department", "Department"],
                ["academic_session", "Session"],
                ["class_semester", "Semester"],
                ["registration_id", "Registration Number"],
                ["roll_number", "Roll Number"],
                ["internship_domain", "Internship Domain"],
                ["status", "Status"],
              ] as const
            ).map(([key, label]) => (
              <div key={key} className="space-y-1">
                <Label htmlFor={`edit-${key}`}>{label}</Label>
                <Input
                  id={`edit-${key}`}
                  value={editForm[key] || ""}
                  onChange={(e) => setEditForm((prev) => ({ ...prev, [key]: e.target.value }))}
                />
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setEditTarget(null)}>
              Cancel
            </Button>
            <Button type="button" onClick={() => void saveEdit()} disabled={savingEdit}>
              {savingEdit ? <Loader2 className="size-4 animate-spin" /> : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={addOpen}
        onOpenChange={(open) => {
          if (!addingStudent) setAddOpen(open);
        }}
      >
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Add single student</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-slate-600">
            Uses current mode:{" "}
            <span className="font-semibold">{mode === "paid" ? "Paid" : "Unpaid"}</span>. Email and
            phone duplicates are allowed; registration number must be unique.
          </p>
          <div className="grid gap-3 py-2">
            {(
              [
                ["fullName", "Full Name"],
                ["gender", "Gender"],
                ["parentName", "Parent Name"],
                ["contactNumber", "Contact Number"],
                ["email", "Email Address"],
                ["university", "University"],
                ["college", "College"],
                ["degree", "Degree (UG/PG)"],
                ["department", "Department"],
                ["subject", "Subject"],
                ["session", "Session"],
                ["semester", "Semester"],
                ["registrationNumber", "Registration Number"],
                ["rollNumber", "Roll Number"],
                ["internshipDomain", "Internship Domain"],
                ["mode", "Mode (Online/Offline)"],
                ["password", "Password"],
              ] as const
            ).map(([key, label]) => (
              <div key={key} className="space-y-1">
                <Label htmlFor={`add-${key}`}>{label}</Label>
                <Input
                  id={`add-${key}`}
                  type={key === "password" ? "text" : "text"}
                  value={addForm[key] || ""}
                  onChange={(e) => setAddForm((prev) => ({ ...prev, [key]: e.target.value }))}
                />
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={addingStudent}
              onClick={() => setAddOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              disabled={addingStudent}
              onClick={() => void handleAddSingleStudent()}
            >
              {addingStudent ? <Loader2 className="size-4 animate-spin" /> : "Add student"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
