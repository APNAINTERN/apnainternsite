import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
  AlertTriangle,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  Loader2,
  Upload,
  UserPlus,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  BULK_REGISTRATION_HEADERS,
  BULK_REGISTRATION_OPTIONAL_HEADERS,
  BULK_REGISTRATION_REQUIRED_HEADERS,
  downloadBulkRegistrationCsvTemplate,
  downloadBulkRegistrationXlsxTemplate,
  fetchExistingRegistrationEmails,
  parseBulkRegistrationFile,
  processBulkRegistrationRows,
  type BulkRegistrationProcessResult,
  type BulkRegistrationRow,
  type BulkRegistrationValidationError,
  validateBulkRegistrationRows,
} from "@/lib/adminBulkStudentRegistration";

type Props = {
  client: SupabaseClient;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void | Promise<void>;
  onLogAction?: (
    actionType: string,
    entityType: string,
    description: string,
    metadata?: Record<string, unknown>
  ) => Promise<void>;
  portalLabel?: string;
};

function maskPassword(password: string): string {
  if (!password) return "—";
  if (password.length <= 2) return "••";
  return "•".repeat(Math.min(password.length, 8));
}

export function AdminBulkRegistrationUpload({
  client,
  open,
  onOpenChange,
  onSuccess,
  onLogAction,
  portalLabel = "Admin",
}: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState("");
  const [validating, setValidating] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [validationErrors, setValidationErrors] = useState<BulkRegistrationValidationError[]>([]);
  const [previewRows, setPreviewRows] = useState<BulkRegistrationRow[] | null>(null);
  const [results, setResults] = useState<BulkRegistrationProcessResult[] | null>(null);

  const resetState = () => {
    setFileName("");
    setValidationErrors([]);
    setPreviewRows(null);
    setResults(null);
    setProgress({ done: 0, total: 0 });
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleClose = (nextOpen: boolean) => {
    if (uploading) return;
    if (!nextOpen) resetState();
    onOpenChange(nextOpen);
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
      const rows = await parseBulkRegistrationFile(file);
      const existingEmails = await fetchExistingRegistrationEmails(
        client,
        rows.map((row) => row.email)
      );
      const errors = validateBulkRegistrationRows(rows, existingEmails);
      if (errors.length > 0) {
        setValidationErrors(errors);
        toast.error(`Found ${errors.length} issue(s). Fix the file and upload again.`);
        return;
      }

      setPreviewRows(rows);
      toast.success(
        `File extracted successfully — ${rows.length} student${rows.length === 1 ? "" : "s"} ready to review.`
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to read upload file.");
      resetState();
    } finally {
      setValidating(false);
    }
  };

  const handleAddStudents = async () => {
    if (!previewRows?.length || uploading) return;

    setUploading(true);
    setResults(null);
    setProgress({ done: 0, total: previewRows.length });

    try {
      const processResults = await processBulkRegistrationRows(client, previewRows, (done, total) => {
        setProgress({ done, total });
      });

      const successCount = processResults.filter((r) => r.success).length;
      const failCount = processResults.length - successCount;

      setResults(processResults);
      setPreviewRows(null);
      setUploading(false);

      if (failCount === 0) {
        toast.success(`Added ${successCount} student registration(s).`);
      } else if (successCount === 0) {
        toast.error(`All ${failCount} row(s) failed. See details below.`);
      } else {
        toast.warning(`Added ${successCount}; ${failCount} failed. See details below.`);
      }

      void (async () => {
        try {
          if (successCount > 0 && onLogAction) {
            await onLogAction(
              "BULK_CREATE",
              "student",
              `${portalLabel} bulk uploaded ${successCount} student registration(s)`,
              { success_count: successCount, failed_count: failCount, file_name: fileName }
            );
          }
          if (successCount > 0) {
            await onSuccess?.();
          }
        } catch (err) {
          console.error("Bulk upload follow-up error:", err);
        }
      })();
    } catch (err) {
      setUploading(false);
      toast.error(err instanceof Error ? err.message : "Failed to add students.");
    }
  };

  const successCount = results?.filter((r) => r.success).length ?? 0;
  const failCount = results ? results.length - successCount : 0;
  const showPreview = previewRows != null && previewRows.length > 0 && !results;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-3xl max-h-[90vh] rounded-2xl border-none shadow-elegant flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg font-black">
            <Upload className="size-5 text-emerald-600" />
            Bulk Upload Students
          </DialogTitle>
          <DialogDescription>
            Upload a CSV or Excel file, review the extracted list, then click Add to create
            registrations (same fields as Add Registration).
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 min-h-0 flex-1 overflow-hidden flex flex-col">
          <div className="rounded-xl border bg-slate-50 p-4 shrink-0 space-y-2">
            <p className="text-xs font-bold uppercase tracking-wide text-slate-500">
              Columns
            </p>
            <p className="text-sm text-slate-700">
              <span className="font-semibold">Required:</span>{" "}
              {BULK_REGISTRATION_REQUIRED_HEADERS.join(", ")}
            </p>
            <p className="text-sm text-slate-600">
              <span className="font-semibold">Optional:</span>{" "}
              {BULK_REGISTRATION_OPTIONAL_HEADERS.join(", ")}
            </p>
          </div>

          {!showPreview && !results ? (
            <div className="flex flex-wrap gap-3 shrink-0">
              <Button
                type="button"
                variant="outline"
                className="gap-2"
                onClick={downloadBulkRegistrationCsvTemplate}
                disabled={validating || uploading}
              >
                <Download className="size-4" />
                Sample CSV
              </Button>
              <Button
                type="button"
                variant="outline"
                className="gap-2"
                onClick={downloadBulkRegistrationXlsxTemplate}
                disabled={validating || uploading}
              >
                <FileSpreadsheet className="size-4" />
                Sample Excel
              </Button>
              <Button
                type="button"
                className="gap-2 bg-emerald-600 hover:bg-emerald-700 font-bold ml-auto"
                onClick={() => fileInputRef.current?.click()}
                disabled={validating || uploading}
              >
                {validating ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Upload className="size-4" />
                )}
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
            <p className="text-sm text-muted-foreground shrink-0">
              File: <span className="font-semibold text-slate-800">{fileName}</span>
            </p>
          ) : null}

          {validating ? (
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700 shrink-0">
              <div className="flex items-center gap-2 font-semibold">
                <Loader2 className="size-4 animate-spin" />
                Reading and validating file…
              </div>
            </div>
          ) : null}

          {uploading && !results ? (
            <div className="rounded-xl border border-emerald-100 bg-emerald-50/60 p-4 text-sm text-emerald-900 shrink-0">
              <div className="flex items-center gap-2 font-semibold">
                <Loader2 className="size-4 animate-spin" />
                Adding students… {progress.done} / {progress.total}
              </div>
            </div>
          ) : null}

          {validationErrors.length > 0 ? (
            <div className="rounded-xl border border-red-200 bg-red-50/70 p-4 space-y-3 shrink-0">
              <div className="flex items-center gap-2 text-red-800 font-bold text-sm">
                <AlertTriangle className="size-4" />
                Fix these issues and upload again
              </div>
              <ScrollArea className="max-h-48">
                <ul className="space-y-2 pr-3">
                  {validationErrors.map((err) => (
                    <li key={`${err.rowNumber}-${err.message}`} className="text-sm text-red-900">
                      {err.rowNumber > 0 ? (
                        <>
                          <span className="font-bold">Row {err.rowNumber}:</span> {err.message}
                        </>
                      ) : (
                        err.message
                      )}
                    </li>
                  ))}
                </ul>
              </ScrollArea>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="gap-2"
                onClick={() => {
                  resetState();
                  fileInputRef.current?.click();
                }}
              >
                <Upload className="size-4" />
                Choose another file
              </Button>
            </div>
          ) : null}

          {showPreview ? (
            <div className="rounded-xl border bg-white flex flex-col min-h-0 flex-1 gap-3">
              <div className="flex items-center gap-2 p-4 pb-0 text-emerald-800 font-bold text-sm shrink-0">
                <CheckCircle2 className="size-4 text-emerald-600" />
                {previewRows.length} student{previewRows.length === 1 ? "" : "s"} extracted — review
                below, then click Add.
              </div>
              <ScrollArea className="flex-1 min-h-0 max-h-[min(360px,50vh)] mx-4 mb-4 rounded-lg border">
                <Table>
                  <TableHeader className="bg-muted/30 sticky top-0 z-10">
                    <TableRow>
                      <TableHead className="text-[10px] font-black uppercase w-12">#</TableHead>
                      <TableHead className="text-[10px] font-black uppercase">Full Name</TableHead>
                      <TableHead className="text-[10px] font-black uppercase">Email</TableHead>
                      <TableHead className="text-[10px] font-black uppercase">Mobile</TableHead>
                      <TableHead className="text-[10px] font-black uppercase">Password</TableHead>
                      <TableHead className="text-[10px] font-black uppercase">Pay ID</TableHead>
                      <TableHead className="text-[10px] font-black uppercase">University</TableHead>
                      <TableHead className="text-[10px] font-black uppercase">College</TableHead>
                      <TableHead className="text-[10px] font-black uppercase">Course</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {previewRows.map((row) => (
                      <TableRow key={`${row.rowNumber}-${row.email}`}>
                        <TableCell className="text-xs text-muted-foreground">{row.rowNumber}</TableCell>
                        <TableCell className="text-sm font-medium">{row.fullName || "—"}</TableCell>
                        <TableCell className="text-sm">{row.email}</TableCell>
                        <TableCell className="text-sm">{row.mobile}</TableCell>
                        <TableCell className="text-sm font-mono text-muted-foreground">
                          {maskPassword(row.password)}
                        </TableCell>
                        <TableCell className="text-sm">{row.paymentId || "—"}</TableCell>
                        <TableCell className="text-sm max-w-[120px] truncate" title={row.universityName}>
                          {row.universityName || "—"}
                        </TableCell>
                        <TableCell className="text-sm max-w-[120px] truncate" title={row.collegeName}>
                          {row.collegeName || "—"}
                        </TableCell>
                        <TableCell className="text-sm max-w-[120px] truncate" title={row.course}>
                          {row.course || "—"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </ScrollArea>
            </div>
          ) : null}

          {results ? (
            <div className="rounded-xl border bg-white p-4 space-y-4 shrink-0">
              <div className="flex flex-wrap gap-3">
                <Badge className="bg-emerald-50 text-emerald-700 border-none gap-1">
                  <CheckCircle2 className="size-3.5" />
                  {successCount} added
                </Badge>
                {failCount > 0 ? (
                  <Badge className="bg-red-50 text-red-700 border-none gap-1">
                    <XCircle className="size-3.5" />
                    {failCount} failed
                  </Badge>
                ) : null}
              </div>
              {failCount > 0 ? (
                <ScrollArea className="max-h-48">
                  <ul className="space-y-2 pr-3">
                    {results
                      .filter((r) => !r.success)
                      .map((r) => (
                        <li key={`${r.rowNumber}-${r.email}`} className="text-sm text-slate-700">
                          <span className="font-bold">Row {r.rowNumber}</span> ({r.email}):{" "}
                          {r.message || "Failed"}
                        </li>
                      ))}
                  </ul>
                </ScrollArea>
              ) : null}
            </div>
          ) : null}
        </div>

        {showPreview ? (
          <DialogFooter className="gap-2 sm:gap-2 shrink-0 pt-2">
            <Button
              type="button"
              variant="outline"
              disabled={uploading}
              onClick={() => {
                resetState();
                fileInputRef.current?.click();
              }}
            >
              Choose different file
            </Button>
            <Button
              type="button"
              className="gap-2 bg-emerald-600 hover:bg-emerald-700 font-bold"
              disabled={uploading}
              onClick={() => void handleAddStudents()}
            >
              {uploading ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <UserPlus className="size-4" />
              )}
              Add {previewRows.length} student{previewRows.length === 1 ? "" : "s"}
            </Button>
          </DialogFooter>
        ) : null}

        {results ? (
          <DialogFooter className="shrink-0 pt-2">
            <Button type="button" onClick={() => handleClose(false)}>
              Done
            </Button>
          </DialogFooter>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
