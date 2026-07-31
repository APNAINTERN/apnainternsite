import { useCallback, useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  ChevronLeft,
  ChevronRight,
  Loader2,
  Upload,
  UserPlus,
  Mail,
  Phone,
  KeyRound,
  CreditCard,
  User,
  Search,
  RefreshCw,
} from "lucide-react";
import { toast } from "sonner";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  adminCreateMinimalStudentRegistration,
  validateAdminAddRegistrationInput,
} from "@/lib/adminCreateMinimalStudentRegistration";
import { upsertBeuDetails } from "@/lib/beuDetails";
import { ADMIN_ADD_REGISTRATION_SOURCE } from "@/lib/studentRegistrationSource";
import { fetchAdminAddedRegistrationsPage } from "@/lib/adminAddedRegistrations";
import { AdminBulkRegistrationUpload } from "@/components/AdminBulkRegistrationUpload";
import {
  AdminRegistrationAcademicFields,
  EMPTY_ADMIN_REGISTRATION_ACADEMIC,
  type AdminRegistrationAcademicValues,
} from "@/components/AdminRegistrationAcademicFields";

const PAGE_SIZE = 20;

type Props = {
  client: SupabaseClient;
  onSuccess?: () => void | Promise<void>;
  onLogAction?: (
    actionType: string,
    entityType: string,
    description: string,
    metadata?: Record<string, unknown>
  ) => Promise<void>;
  portalLabel?: string;
};

export function AdminAddRegistrationPanel({
  client,
  onSuccess,
  onLogAction,
  portalLabel = "Admin",
}: Props) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [paymentId, setPaymentId] = useState("");
  const [academic, setAcademic] = useState<AdminRegistrationAcademicValues>(
    EMPTY_ADMIN_REGISTRATION_ACADEMIC
  );
  const [submitting, setSubmitting] = useState(false);
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<Awaited<ReturnType<typeof fetchAdminAddedRegistrationsPage>>["rows"]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [searchTerm, setSearchTerm] = useState("");
  const [searchDebounced, setSearchDebounced] = useState("");
  const [page, setPage] = useState(0);
  const [bulkUploadOpen, setBulkUploadOpen] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      const next = searchTerm.trim();
      setSearchDebounced((prev) => {
        if (prev !== next) setPage(0);
        return next;
      });
    }, 350);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  const totalPages = useMemo(
    () => Math.max(1, Math.ceil(totalCount / PAGE_SIZE)),
    [totalCount]
  );

  const loadPage = useCallback(
    async (targetPage: number, search: string) => {
      setLoading(true);
      try {
        const { rows: data, total } = await fetchAdminAddedRegistrationsPage(
          client,
          targetPage,
          PAGE_SIZE,
          search
        );
        setRows(data);
        setTotalCount(total);
        if (targetPage > 0 && data.length === 0 && total > 0) {
          const lastPage = Math.max(0, Math.ceil(total / PAGE_SIZE) - 1);
          setPage(lastPage);
        }
      } catch (err) {
        console.error("[add-registration] load:", err);
        const msg =
          err instanceof Error
            ? err.message
            : "Could not load added registrations.";
        toast.error(msg);
        setRows([]);
        setTotalCount(0);
      } finally {
        setLoading(false);
      }
    },
    [client]
  );

  useEffect(() => {
    void loadPage(page, searchDebounced);
  }, [loadPage, page, searchDebounced]);

  const resetForm = () => {
    setEmail("");
    setPhone("");
    setPassword("");
    setFullName("");
    setPaymentId("");
    setAcademic(EMPTY_ADMIN_REGISTRATION_ACADEMIC);
  };

  const academicInput = () => {
    const beu = academic.beuFormData;
    return {
      universityName: academic.universityName.trim() || undefined,
      collegeName: academic.collegeName.trim() || beu?.collegeName?.trim() || undefined,
      course:
        academic.course.trim() ||
        beu?.internshipDomain?.trim() ||
        undefined,
      degree: academic.degree.trim() || beu?.course?.trim() || undefined,
      department: academic.department.trim() || beu?.branchSubject?.trim() || undefined,
      subject: academic.subject.trim() || beu?.specialization?.trim() || undefined,
    };
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const input = {
      email,
      phone,
      password,
      fullName: fullName.trim() || undefined,
      paymentId: paymentId.trim() || undefined,
      ...academicInput(),
    };
    const validationError = validateAdminAddRegistrationInput(input);
    if (validationError) {
      toast.error(validationError);
      return;
    }

    setSubmitting(true);
    try {
      const result = await adminCreateMinimalStudentRegistration(client, {
        ...input,
        registrationSource: ADMIN_ADD_REGISTRATION_SOURCE,
        hasEngineeringDetails: Boolean(academic.beuFormData),
        studentTrack:
          academic.studentTrack ||
          (academic.beuFormData ? "engineering" : undefined),
      });
      if (academic.beuFormData && result.userId) {
        await upsertBeuDetails(client, result.userId, academic.beuFormData);
      }
      toast.success(`Student registered: ${result.email}`);
      if (onLogAction) {
        await onLogAction(
          "CREATE",
          "student",
          `${portalLabel} added minimal registration for ${result.email}`,
          {
            student_id: result.userId,
            registration_id: result.registrationId,
            payment_id: result.paymentId,
          }
        );
      }
      resetForm();
      setDialogOpen(false);
      setPage(0);
      await loadPage(0, searchDebounced);
      await onSuccess?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to add registration.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-xl font-black flex items-center gap-2 text-slate-900">
            <UserPlus className="size-5 text-emerald-600" />
            Add Registration
          </h2>
          <p className="text-sm text-slate-500 mt-1 max-w-2xl">
            Students recovered here can log in and complete their profile on the dashboard.
          </p>
        </div>
        <div className="flex flex-wrap gap-2 shrink-0 self-start sm:self-auto">
          <Button
            variant="outline"
            className="gap-2 font-bold border-emerald-200 text-emerald-800 hover:bg-emerald-50"
            onClick={() => setBulkUploadOpen(true)}
          >
            <Upload className="size-4" />
            Bulk Upload
          </Button>
          <Button
            className="gap-2 bg-emerald-600 hover:bg-emerald-700 font-bold shadow-md"
            onClick={() => setDialogOpen(true)}
          >
            <UserPlus className="size-4" />
            Add Registration
          </Button>
        </div>
      </div>

      <Card className="p-6 border-none shadow-elegant bg-white">
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-6">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <Input
              className="pl-9 h-10"
              placeholder="Search email, name, phone, reg id..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <Badge className="bg-emerald-50 text-emerald-700 border-none font-bold w-fit">
            {loading ? "Loading…" : `${totalCount} total`}
          </Badge>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-2 w-fit"
            onClick={() => void loadPage(page, searchDebounced)}
            disabled={loading}
          >
            <RefreshCw className={`size-3.5 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>

        <div className="rounded-xl border overflow-hidden">
          <Table>
            <TableHeader className="bg-slate-50">
              <TableRow>
                <TableHead>Student</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead>Reg ID</TableHead>
                <TableHead>Payment</TableHead>
                <TableHead>Added</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-14 text-muted-foreground">
                    <Loader2 className="size-5 animate-spin inline mr-2" />
                    Loading…
                  </TableCell>
                </TableRow>
              ) : rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-14 text-muted-foreground">
                    {searchDebounced
                      ? "No matches for your search."
                      : (
                        <>
                          No registrations added yet. Use <strong>Add Registration</strong> (top right).
                        </>
                        )}
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((row) => {
                  const meta = (row.metadata || {}) as Record<string, unknown>;
                  const payId = String(meta.razorpay_payment_id || "—");
                  return (
                    <TableRow key={row.id}>
                      <TableCell className="font-semibold">
                        {row.full_name || "Student"}
                      </TableCell>
                      <TableCell className="text-sm">{row.email}</TableCell>
                      <TableCell className="text-sm">{row.contact_number || "—"}</TableCell>
                      <TableCell className="text-xs font-mono">{row.registration_id || "—"}</TableCell>
                      <TableCell className="text-xs font-mono max-w-[140px] truncate" title={payId}>
                        {payId}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                        {row.created_at
                          ? new Date(row.created_at).toLocaleString("en-IN", {
                              dateStyle: "medium",
                              timeStyle: "short",
                            })
                          : "—"}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="secondary"
                          className={
                            row.status === "Active"
                              ? "bg-emerald-50 text-emerald-700 border-none"
                              : ""
                          }
                        >
                          {row.status || "Active"}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>

        {!loading && totalCount > 0 ? (
          <div className="mt-4 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-muted-foreground">
            <span className="font-medium tabular-nums">
              Showing {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, totalCount)} of{" "}
              {totalCount}
            </span>
            {totalCount > PAGE_SIZE ? (
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="icon"
                  className="size-8"
                  disabled={page <= 0 || loading}
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                >
                  <ChevronLeft className="size-4" />
                </Button>
                <span className="min-w-[88px] text-center font-medium tabular-nums">
                  Page {page + 1} of {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="icon"
                  className="size-8"
                  disabled={page >= totalPages - 1 || loading}
                  onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                >
                  <ChevronRight className="size-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={page <= 0 || loading}
                  onClick={() => setPage((p) => p - 1)}
                >
                  Previous
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={page >= totalPages - 1 || loading}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Next
                </Button>
              </div>
            ) : null}
          </div>
        ) : null}
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl border-none shadow-elegant">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-lg font-black">
              <UserPlus className="size-5 text-emerald-600" />
              Add Registration
            </DialogTitle>
            <DialogDescription>
              For paid students who missed registration. Creates login + directory row; they can
              edit profile later.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-4 pt-2">
            <div className="space-y-2">
              <Label htmlFor="add-reg-email" className="flex items-center gap-2">
                <Mail className="size-3.5 text-slate-400" /> Email *
              </Label>
              <Input
                id="add-reg-email"
                type="email"
                autoComplete="off"
                placeholder="student@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="add-reg-phone" className="flex items-center gap-2">
                  <Phone className="size-3.5 text-slate-400" /> Mobile *
                </Label>
                <Input
                  id="add-reg-phone"
                  type="tel"
                  placeholder="10-digit"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="add-reg-password" className="flex items-center gap-2">
                  <KeyRound className="size-3.5 text-slate-400" /> Password *
                </Label>
                <Input
                  id="add-reg-password"
                  type="text"
                  autoComplete="new-password"
                  placeholder="Min 5 chars"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="add-reg-name" className="flex items-center gap-2">
                <User className="size-3.5 text-slate-400" /> Full name (optional)
              </Label>
              <Input
                id="add-reg-name"
                placeholder="Student can edit later"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="add-reg-pay" className="flex items-center gap-2">
                <CreditCard className="size-3.5 text-slate-400" /> Razorpay pay id (optional)
              </Label>
              <Input
                id="add-reg-pay"
                placeholder="pay_XXXXX"
                value={paymentId}
                onChange={(e) => setPaymentId(e.target.value)}
              />
            </div>

            <AdminRegistrationAcademicFields
              client={client}
              values={academic}
              onChange={setAcademic}
            />

            <div className="flex gap-3 pt-2">
              <Button
                type="button"
                variant="outline"
                className="flex-1"
                onClick={() => setDialogOpen(false)}
                disabled={submitting}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={submitting}
                className="flex-1 bg-emerald-600 hover:bg-emerald-700 font-bold gap-2"
              >
                {submitting ? <Loader2 className="size-4 animate-spin" /> : <UserPlus className="size-4" />}
                Create &amp; enable login
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <AdminBulkRegistrationUpload
        client={client}
        open={bulkUploadOpen}
        onOpenChange={setBulkUploadOpen}
        portalLabel={portalLabel}
        onLogAction={onLogAction}
        onSuccess={async () => {
          setPage(0);
          await loadPage(0, searchDebounced);
          await onSuccess?.();
        }}
      />
    </div>
  );
}
