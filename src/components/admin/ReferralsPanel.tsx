import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
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
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import {
  Copy,
  Eye,
  Filter,
  Loader2,
  LogOut,
  Mail,
  MoreHorizontal,
  Pencil,
  Plus,
  Search,
  Share2,
  Users,
} from "lucide-react";
import { assertSendMailOk, getSendMailApiUrl } from "@/lib/sendMailApi";
import {
  generateReferralCode,
  getPublicRegisterUrlWithRef,
  REFERRAL_TYPE_OPTIONS,
  exportReferralStudentsCsv,
  referralPartnerMatchesSearch,
  buildReferralAssignmentRows,
} from "@/lib/referral";
import { fetchAdminReferralOverview, fetchAdminReferralPartnerStudents } from "@/lib/referralApi";
import { buildReferralLoginLink } from "@/lib/authRoutes";
import { createReferralPartnerWithoutServiceRole, generateReferralPartnerLoginCode } from "@/lib/createSubUser";
import { MultiSelectCheckboxGroup } from "@/components/admin/MultiSelectCheckboxGroup";
import {
  collegesForUniversityNames,
  pruneCollegesForUniversities,
} from "@/lib/classLinkTargeting";
import { fetchAllCollegesCatalog, resolveUniversityId } from "@/lib/institutionCatalog";
import { displayCollegeName } from "@/lib/collegeDisplay";
import { ChevronLeft, ChevronRight, Download } from "lucide-react";

const PARTNER_PAGE_SIZE = 20;
const DETAIL_PAGE_SIZE = 20;

type PartnerRow = {
  id: string;
  full_name: string;
  email: string;
  contact_number: string;
  referral_code: string;
  city: string | null;
  college_name: string | null;
  referral_type: string;
  active: boolean;
  created_at: string;
  auth_user_id: string | null;
  partner_login_secret?: string | null;
  signup_count?: number;
  total_clicks?: number;
  approved_students?: number;
  assigned_universities?: string[];
  assigned_colleges?: string[];
};

export const ReferralsPanel = () => {
  const [rows, setRows] = useState<PartnerRow[]>([]);
  const [tableLoading, setTableLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive">("all");

  const [unis, setUnis] = useState<Array<{ id: string; name: string }>>([]);
  const [colleges, setColleges] = useState<Array<{ id: string; name: string; university_id: string }>>([]);

  const [addOpen, setAddOpen] = useState(false);
  const [addName, setAddName] = useState("");
  const [addEmail, setAddEmail] = useState("");
  const [addContact, setAddContact] = useState("");
  const [addCity, setAddCity] = useState("");
  const [addUniversities, setAddUniversities] = useState<string[]>([]);
  const [addColleges, setAddColleges] = useState<string[]>([]);
  const [addReferralType, setAddReferralType] = useState("other");
  const [saving, setSaving] = useState(false);
  const [addCreatePortal, setAddCreatePortal] = useState(false);
  const [addPortalLoginCode, setAddPortalLoginCode] = useState("");
  const [addEmailPortalCreds, setAddEmailPortalCreds] = useState(true);

  const [portalDialogOpen, setPortalDialogOpen] = useState(false);
  const [portalTarget, setPortalTarget] = useState<PartnerRow | null>(null);
  const [portalSecret, setPortalSecret] = useState("");
  const [portalProvisionSaving, setPortalProvisionSaving] = useState(false);

  const [linkOpen, setLinkOpen] = useState(false);
  const [linkUrl, setLinkUrl] = useState("");
  const [linkCode, setLinkCode] = useState("");

  const [detailOpen, setDetailOpen] = useState(false);
  const [detailPartner, setDetailPartner] = useState<PartnerRow | null>(null);
  const [detailStudents, setDetailStudents] = useState<any[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailTotal, setDetailTotal] = useState(0);
  const [detailPage, setDetailPage] = useState(0);
  const [detailSearch, setDetailSearch] = useState("");
  const [partnerPage, setPartnerPage] = useState(0);

  const [editOpen, setEditOpen] = useState(false);
  const [editRow, setEditRow] = useState<PartnerRow | null>(null);
  const [editName, setEditName] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editContact, setEditContact] = useState("");
  const [editCity, setEditCity] = useState("");
  const [editUniversities, setEditUniversities] = useState<string[]>([]);
  const [editColleges, setEditColleges] = useState<string[]>([]);
  const [editReferralType, setEditReferralType] = useState("other");
  const [editActive, setEditActive] = useState(true);

  const addCollegeOptions = useMemo(
    () => collegesForUniversityNames(colleges, unis, addUniversities),
    [colleges, unis, addUniversities]
  );
  const editCollegeOptions = useMemo(
    () => collegesForUniversityNames(colleges, unis, editUniversities),
    [colleges, unis, editUniversities]
  );

  const loadPartners = useCallback(async () => {
    setTableLoading(true);
    try {
      let uniList = unis;
      let collegeList = colleges;
      if (!uniList.length || !collegeList.length) {
        const [{ data: uniData }, collegeRows] = await Promise.all([
          supabase.from("universities").select("id, name").order("name"),
          fetchAllCollegesCatalog(supabase),
        ]);
        uniList = (uniData || []) as Array<{ id: string; name: string }>;
        collegeList = collegeRows;
        setUnis(uniList);
        setColleges(collegeList);
      }

      const resolveAssignments = async (partners: PartnerRow[]): Promise<PartnerRow[]> => {
        if (!partners.length) return partners;
        const { data, error } = await supabase
          .from("referral_partner_assignments")
          .select("partner_id, university_id, college_id")
          .in(
            "partner_id",
            partners.map((p) => p.id)
          );
        if (error) {
          if (error.code !== "42P01" && !error.message?.includes("does not exist")) {
            console.warn("referral_partner_assignments:", error.message);
          }
          return partners.map((p) => ({
            ...p,
            assigned_universities: p.assigned_universities || [],
            assigned_colleges: p.assigned_colleges || [],
          }));
        }
        const uniNameById = new Map(uniList.map((u) => [String(u.id), u.name]));
        const collegeNameById = new Map(collegeList.map((c) => [String(c.id), c.name]));
        const map = new Map<string, { universities: string[]; colleges: string[] }>();
        for (const row of data || []) {
          const pid = String((row as { partner_id: string }).partner_id);
          const entry = map.get(pid) || { universities: [], colleges: [] };
          const uniName = uniNameById.get(String((row as { university_id: string }).university_id));
          if (uniName && !entry.universities.includes(uniName)) entry.universities.push(uniName);
          const cid = (row as { college_id: string | null }).college_id;
          if (cid) {
            const cName = collegeNameById.get(String(cid));
            if (cName && !entry.colleges.includes(cName)) entry.colleges.push(cName);
          }
          map.set(pid, entry);
        }
        return partners.map((p) => {
          const a = map.get(p.id);
          return {
            ...p,
            assigned_universities: a?.universities || [],
            assigned_colleges: a?.colleges || [],
          };
        });
      };

      const overview = await fetchAdminReferralOverview(supabase);
      if (overview.length === 0) {
        const { data, error } = await supabase
          .from("referral_partners")
          .select(
            "id, full_name, email, contact_number, referral_code, city, college_name, referral_type, active, created_at, auth_user_id, partner_login_secret"
          )
          .order("created_at", { ascending: false });
        if (error) {
          if (error.code === "42P01" || error.message?.includes("does not exist")) {
            toast.error("Referral tables not found. Run the latest Supabase migration.");
            setRows([]);
            return;
          }
          throw error;
        }
        const partners = (data || []) as PartnerRow[];
        const enriched = await Promise.all(
          partners.map(async (p) => {
            const code = String(p.referral_code || "").trim();
            if (!code) {
              return {
                ...p,
                total_clicks: 0,
                total_students: 0,
                approved_students: 0,
                signup_count: 0,
              };
            }
            const [clicksRes, studentsRes, approvedRes] = await Promise.all([
              supabase
                .from("referral_clicks")
                .select("*", { count: "exact", head: true })
                .ilike("referral_code", code),
              supabase
                .from("students")
                .select("*", { count: "exact", head: true })
                .ilike("referral_code", code),
              supabase
                .from("students")
                .select("*", { count: "exact", head: true })
                .ilike("referral_code", code)
                .in("status", ["active", "approved", "Active", "Approved"]),
            ]);
            const total_clicks = clicksRes.count ?? 0;
            const total_students = studentsRes.count ?? 0;
            const approved_students = approvedRes.count ?? 0;
            return {
              ...p,
              total_clicks,
              total_students,
              approved_students,
              signup_count: total_students,
            };
          })
        );
        setRows(await resolveAssignments(enriched));
        return;
      }
      setRows(
        await resolveAssignments(
          overview.map((r) => ({
            ...r,
            signup_count: r.total_students,
          }))
        )
      );
    } catch (e: unknown) {
      console.error(e);
      toast.error(e instanceof Error ? e.message : "Failed to load referrals");
    } finally {
      setTableLoading(false);
    }
  }, [unis, colleges]);

  const savePartnerAssignments = async (
    partnerId: string,
    universityNames: string[],
    collegeNames: string[]
  ) => {
    if (!universityNames.length) {
      throw new Error("Assign at least one university");
    }
    const universityIds = universityNames
      .map((n) => resolveUniversityId(unis, n))
      .filter(Boolean);
    if (!universityIds.length) {
      throw new Error("Could not resolve selected universities");
    }
    const collegeIds = colleges
      .filter((c) => {
        const display = displayCollegeName(c.name);
        return collegeNames.includes(display) || collegeNames.includes(c.name);
      })
      .filter((c) => universityIds.includes(String(c.university_id)))
      .map((c) => String(c.id));

    const rowsToInsert = buildReferralAssignmentRows({
      partnerId,
      universityIds,
      collegeIds,
      colleges,
    });

    const { error: delErr } = await supabase
      .from("referral_partner_assignments")
      .delete()
      .eq("partner_id", partnerId);
    if (delErr && delErr.code !== "42P01" && !delErr.message?.includes("does not exist")) {
      throw delErr;
    }
    if (rowsToInsert.length) {
      const { error: insErr } = await supabase.from("referral_partner_assignments").insert(rowsToInsert);
      if (insErr) throw insErr;
    }
  };

  useEffect(() => {
    void (async () => {
      try {
        const [{ data: uniData }, collegeRows] = await Promise.all([
          supabase.from("universities").select("id, name").order("name"),
          fetchAllCollegesCatalog(supabase),
        ]);
        setUnis((uniData || []) as Array<{ id: string; name: string }>);
        setColleges(collegeRows);
      } catch (e) {
        console.warn("Failed to load institution catalog for referrals", e);
      }
    })();
  }, []);

  const loadDetailStudents = useCallback(async (partnerId: string, pageIndex: number, q: string) => {
    setDetailLoading(true);
    try {
      const result = await fetchAdminReferralPartnerStudents(supabase, partnerId, {
        limit: DETAIL_PAGE_SIZE,
        offset: pageIndex * DETAIL_PAGE_SIZE,
        search: q || undefined,
      });
      setDetailStudents(result.rows);
      setDetailTotal(result.total);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to load students");
    } finally {
      setDetailLoading(false);
    }
  }, []);

  useEffect(() => {
    loadPartners();
  }, [loadPartners]);

  useEffect(() => {
    if (!detailOpen || !detailPartner) return;
    const t = window.setTimeout(() => {
      void loadDetailStudents(detailPartner.id, detailPage, detailSearch.trim());
    }, detailSearch ? 350 : 0);
    return () => window.clearTimeout(t);
  }, [detailOpen, detailPartner, detailPage, detailSearch, loadDetailStudents]);

  useEffect(() => {
    if (addOpen) {
      setAddCreatePortal(false);
      setAddPortalLoginCode("");
      setAddEmailPortalCreds(true);
    }
  }, [addOpen]);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (statusFilter === "active" && !r.active) return false;
      if (statusFilter === "inactive" && r.active) return false;
      return referralPartnerMatchesSearch(r, search);
    });
  }, [rows, search, statusFilter]);

  useEffect(() => {
    setPartnerPage(0);
  }, [search, statusFilter]);

  const partnerPageCount = Math.max(1, Math.ceil(filtered.length / PARTNER_PAGE_SIZE));
  const safePartnerPage = Math.min(partnerPage, partnerPageCount - 1);
  const paginatedPartners = filtered.slice(
    safePartnerPage * PARTNER_PAGE_SIZE,
    (safePartnerPage + 1) * PARTNER_PAGE_SIZE
  );

  const openLinkDialog = (code: string) => {
    setLinkCode(code);
    setLinkUrl(getPublicRegisterUrlWithRef(code));
    setLinkOpen(true);
  };

  const copyText = async (text: string, msg = "Copied") => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(msg);
    } catch {
      toast.error("Could not copy to clipboard");
    }
  };

  const sendPortalCredentialsMail = async (opts: {
    to: string;
    name: string;
    loginSecret: string;
    referralCode: string;
  }) => {
    const loginUrl = buildReferralLoginLink();
    const regUrl = getPublicRegisterUrlWithRef(opts.referralCode);
    const toEmail = opts.to.trim().toLowerCase();
    const message = `Hello ${opts.name},

Your EzyIntern referral promoter portal is ready. You can sign in to see students who registered using your referral link.

Promoter sign-in URL:
${loginUrl}

Email (sign-in): ${toEmail}
Promoter Login ID (enter on the sign-in page with your email): ${opts.loginSecret}

Share this registration link with students (or use your referral code during registration):
${regUrl}

Referral code: ${opts.referralCode}

Please keep your Promoter Login ID private. If you need help, contact EzyIntern support.

Thank you,
EzyIntern Team`;

    const res = await fetch(getSendMailApiUrl(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        to: toEmail,
        action: "bulk_custom_mail",
        subject: "EzyIntern — Referral promoter portal access",
        message,
      }),
    });
    await assertSendMailOk(res);
  };

  const handleCreate = async () => {
    const name = addName.trim();
    const email = addEmail.trim().toLowerCase();
    const contact = addContact.trim();
    if (name.length < 2) {
      toast.error("Enter a valid name");
      return;
    }
    if (!email.includes("@")) {
      toast.error("Enter a valid email");
      return;
    }
    if (addUniversities.length === 0) {
      toast.error("Assign at least one university");
      return;
    }
    if (addCreatePortal) {
      const secret = addPortalLoginCode.trim();
      if (secret.length < 6) {
        toast.error("Generate or enter a Promoter Login ID (at least 6 characters).");
        return;
      }
    }
    setSaving(true);
    try {
      let code = generateReferralCode();
      let inserted: { id: string; referral_code: string } | null = null;
      let lastError: { message?: string; code?: string } | null = null;
      for (let attempt = 0; attempt < 10; attempt++) {
        const { data, error } = await supabase
          .from("referral_partners")
          .insert({
            full_name: name,
            email,
            contact_number: contact,
            city: addCity.trim() || null,
            college_name:
              addColleges.length === 1
                ? addColleges[0]
                : addUniversities.length === 1
                  ? addUniversities[0]
                  : null,
            referral_type: addReferralType,
            referral_code: code,
          })
          .select("id, referral_code")
          .single();
        if (!error && data) {
          inserted = data;
          break;
        }
        lastError = error;
        const msg = String(error?.message || "");
        const isCodeCollision =
          error?.code === "23505" && /referral_code/i.test(msg);
        if (isCodeCollision) {
          code = generateReferralCode();
          continue;
        }
        throw error;
      }
      if (!inserted) {
        throw lastError || new Error("Could not allocate a unique referral code");
      }

      try {
        await savePartnerAssignments(inserted.id, addUniversities, addColleges);
      } catch (assignErr) {
        // Partner exists — surface assignment failure clearly.
        toast.error(
          assignErr instanceof Error
            ? `Partner created but assignments failed: ${assignErr.message}`
            : "Partner created but university/college assignment failed"
        );
        await loadPartners();
        openLinkDialog(inserted.referral_code);
        return;
      }

      if (addCreatePortal) {
        try {
          const secret = addPortalLoginCode.trim();
          const { linkedExisting } = await createReferralPartnerWithoutServiceRole(supabase, {
            email,
            loginSecret: secret,
            partnerId: inserted.id,
            fullName: name,
          });
          if (addEmailPortalCreds) {
            await sendPortalCredentialsMail({
              to: email,
              name,
              loginSecret: secret,
              referralCode: inserted.referral_code,
            });
          }
          toast.success(
            linkedExisting
              ? "Referral partner added — existing account linked as promoter portal"
              : "Referral partner added with promoter portal"
          );
        } catch (portalErr) {
          toast.warning(
            portalErr instanceof Error
              ? `Partner saved, but portal failed: ${portalErr.message}`
              : "Partner saved, but promoter portal could not be created"
          );
        }
      } else {
        toast.success("Referral partner added");
      }
      setAddOpen(false);
      setAddName("");
      setAddEmail("");
      setAddContact("");
      setAddCity("");
      setAddUniversities([]);
      setAddColleges([]);
      setAddReferralType("other");
      setAddCreatePortal(false);
      setAddPortalLoginCode("");
      setAddEmailPortalCreds(true);
      await loadPartners();
      openLinkDialog(inserted.referral_code);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Could not create referral");
    } finally {
      setSaving(false);
    }
  };

  const openProvisionPortalDialog = (p: PartnerRow) => {
    if (p.auth_user_id) {
      toast.info("This partner already has portal access.");
      return;
    }
    setPortalTarget(p);
    setPortalSecret(generateReferralPartnerLoginCode());
    setPortalDialogOpen(true);
  };

  const submitProvisionPortal = async () => {
    if (!portalTarget) return;
    const secret = portalSecret.trim();
    if (secret.length < 6) {
      toast.error("Promoter Login ID must be at least 6 characters.");
      return;
    }
    setPortalProvisionSaving(true);
    try {
      const { linkedExisting } = await createReferralPartnerWithoutServiceRole(supabase, {
        email: portalTarget.email.trim().toLowerCase(),
        loginSecret: secret,
        partnerId: portalTarget.id,
        fullName: portalTarget.full_name.trim(),
      });
      await sendPortalCredentialsMail({
        to: portalTarget.email,
        name: portalTarget.full_name,
        loginSecret: secret,
        referralCode: portalTarget.referral_code,
      });
      toast.success(
        linkedExisting
          ? "Existing account linked as promoter portal. New login credentials emailed."
          : "Promoter portal created and credentials emailed."
      );
      setPortalDialogOpen(false);
      setPortalTarget(null);
      await loadPartners();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Could not create portal");
    } finally {
      setPortalProvisionSaving(false);
    }
  };

  const sendPortalEmailForRow = async (p: PartnerRow) => {
    if (!p.auth_user_id) {
      toast.error("Create promoter portal first.");
      return;
    }
    const secret = (p.partner_login_secret || "").trim();
    if (!secret) {
      toast.error(
        "No stored Promoter Login ID on file. Detach portal access and recreate, or reset the password in Supabase Auth."
      );
      return;
    }
    try {
      await sendPortalCredentialsMail({
        to: p.email,
        name: p.full_name,
        loginSecret: secret,
        referralCode: p.referral_code,
      });
      toast.success("Portal credentials emailed");
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to send email");
    }
  };

  const detachPortalForRow = async (p: PartnerRow) => {
    if (!p.auth_user_id) return;
    if (
      !confirm(
        `Remove portal sign-in for ${p.full_name}? They will no longer access the referral promoter dashboard for this partner record.`
      )
    ) {
      return;
    }
    try {
      const { error } = await supabase.rpc("detach_referral_partner_portal", { p_partner_id: p.id });
      if (error) throw error;
      toast.success("Promoter portal access removed");
      await loadPartners();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Detach failed");
    }
  };

  const sendReferralEmail = async (p: PartnerRow) => {
    const url = getPublicRegisterUrlWithRef(p.referral_code);
    const body = `Hello ${p.full_name},\n\nPlease use the link below to register students for the EzyIntern internship program under your referral.\n\n${url}\n\nReferral code: ${p.referral_code}\n\nIf the link does not open, copy the URL into your browser.\n\nThank you,\nEzyIntern Team`;
    try {
      const res = await fetch(getSendMailApiUrl(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to: p.email,
          action: "bulk_custom_mail",
          subject: "Your EzyIntern referral registration link",
          message: body,
        }),
      });
      await assertSendMailOk(res);
      toast.success("Email sent");
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to send email");
    }
  };

  const openDetail = (p: PartnerRow) => {
    setDetailPartner(p);
    setDetailOpen(true);
    setDetailPage(0);
    setDetailSearch("");
    setDetailStudents([]);
    setDetailTotal(0);
  };

  const openEdit = (p: PartnerRow) => {
    setEditRow(p);
    setEditName(p.full_name);
    setEditEmail(p.email);
    setEditContact(p.contact_number);
    setEditCity(p.city || "");
    setEditUniversities(p.assigned_universities || []);
    setEditColleges(p.assigned_colleges || []);
    setEditReferralType(p.referral_type || "other");
    setEditActive(p.active);
    setEditOpen(true);
  };

  const saveEdit = async () => {
    if (!editRow) return;
    const name = editName.trim();
    const email = editEmail.trim().toLowerCase();
    const contact = editContact.trim();
    if (name.length < 2 || !email.includes("@")) {
      toast.error("Check name and email");
      return;
    }
    if (editUniversities.length === 0) {
      toast.error("Assign at least one university");
      return;
    }
    setSaving(true);
    try {
      const { error } = await supabase
        .from("referral_partners")
        .update({
          full_name: name,
          email,
          contact_number: contact,
          city: editCity.trim() || null,
          college_name:
            editColleges.length === 1
              ? editColleges[0]
              : editUniversities.length === 1
                ? editUniversities[0]
                : null,
          referral_type: editReferralType,
          active: editActive,
          updated_at: new Date().toISOString(),
        })
        .eq("id", editRow.id);
      if (error) throw error;
      await savePartnerAssignments(editRow.id, editUniversities, editColleges);
      toast.success("Updated");
      setEditOpen(false);
      setEditRow(null);
      await loadPartners();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Update failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold flex items-center gap-2">
          <Share2 className="size-5 text-primary" /> Referrals
        </h2>
        <Button
          className="gap-2 bg-primary hover:bg-primary/90 text-white rounded-xl font-bold text-xs shadow-sm"
          onClick={() => setAddOpen(true)}
        >
          <Plus className="size-4" /> Add Referral
        </Button>
      </div>

      <Card className="p-6 border-none shadow-elegant mb-6 bg-card/50 backdrop-blur-sm">
        <div className="grid md:grid-cols-3 lg:grid-cols-4 gap-4">
          <div className="relative md:col-span-2 lg:col-span-2">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <Input
              className="pl-9"
              placeholder="Name, email, phone, or code..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as typeof statusFilter)}>
            <SelectTrigger className="gap-2">
              <Filter className="size-4" />
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="inactive">Inactive</SelectItem>
            </SelectContent>
          </Select>

          <Button
            variant="outline"
            className="gap-2"
            onClick={() => {
              setSearch("");
              setStatusFilter("all");
            }}
          >
            <Filter className="size-4" /> Reset Filters
          </Button>
        </div>
      </Card>

      <Card className="overflow-hidden border-none shadow-elegant">
        <Table>
          <TableHeader className="bg-muted/30">
            <TableRow>
              <TableHead>Partner</TableHead>
              <TableHead>Contact</TableHead>
              <TableHead>Referral Code</TableHead>
              <TableHead className="text-right">Clicks</TableHead>
              <TableHead className="text-right">Signups</TableHead>
              <TableHead className="text-right">Approved</TableHead>
              <TableHead>Portal</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Added</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {tableLoading ? (
              <TableRow>
                <TableCell colSpan={10} className="text-center py-20">
                  <Loader2 className="size-8 animate-spin mx-auto text-primary" />
                </TableCell>
              </TableRow>
            ) : paginatedPartners.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={10}
                  className="text-center py-20 text-muted-foreground font-medium italic"
                >
                  No referral partners match your filters.
                </TableCell>
              </TableRow>
            ) : (
              paginatedPartners.map((p) => (
                <TableRow
                  key={p.id}
                  className="group hover:bg-muted/20 cursor-pointer"
                  onClick={() => openDetail(p)}
                >
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <div className="size-8 rounded-full bg-primary/10 flex items-center justify-center font-bold text-primary text-xs">
                        {p.full_name?.charAt(0)?.toUpperCase() || "?"}
                      </div>
                      <div>
                        <div className="font-bold text-sm">{p.full_name}</div>
                        <div className="text-[10px] text-muted-foreground">{p.email}</div>
                        {(p.assigned_universities?.length || p.assigned_colleges?.length) ? (
                          <div className="text-[10px] text-slate-500 mt-0.5 max-w-[220px] truncate">
                            {p.assigned_universities?.length
                              ? `${p.assigned_universities.length} uni`
                              : ""}
                            {p.assigned_colleges?.length
                              ? `${p.assigned_universities?.length ? " · " : ""}${p.assigned_colleges.length} college`
                              : p.assigned_universities?.length
                                ? " · all colleges"
                                : ""}
                          </div>
                        ) : (
                          <div className="text-[10px] text-amber-600 mt-0.5">No campus restriction</div>
                        )}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="text-xs font-medium">{p.contact_number || "—"}</TableCell>
                  <TableCell>
                    <code className="text-[10px] bg-slate-100 px-2 py-0.5 rounded font-bold">
                      {p.referral_code}
                    </code>
                  </TableCell>
                  <TableCell className="text-right font-medium text-slate-600">{p.total_clicks ?? 0}</TableCell>
                  <TableCell className="text-right font-black text-primary">{p.signup_count ?? 0}</TableCell>
                  <TableCell className="text-right font-semibold text-emerald-600">{p.approved_students ?? 0}</TableCell>
                  <TableCell>
                    {p.auth_user_id ? (
                      <Badge
                        variant="secondary"
                        className="text-[9px] uppercase tracking-widest font-bold bg-violet-50 text-violet-700 border border-violet-200"
                      >
                        Linked
                      </Badge>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant="secondary"
                      className={`text-[9px] uppercase tracking-widest font-bold ${
                        p.active
                          ? "bg-emerald-50 text-emerald-600 border border-emerald-200"
                          : "bg-slate-100 text-slate-500 border border-slate-200"
                      }`}
                    >
                      {p.active ? "Active" : "Inactive"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {new Date(p.created_at).toLocaleDateString()}
                  </TableCell>
                  <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="sm" className="size-8 p-0">
                          <MoreHorizontal className="size-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-52 shadow-elegant">
                        <DropdownMenuItem onClick={() => openDetail(p)} className="gap-2">
                          <Eye className="size-4" /> View Signups
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => openEdit(p)} className="gap-2 text-primary">
                          <Pencil className="size-4" /> Edit Details
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => openLinkDialog(p.referral_code)}
                          className="gap-2"
                        >
                          <Copy className="size-4" /> View / Copy Link
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => openProvisionPortalDialog(p)}
                          className="gap-2 text-violet-700"
                          disabled={!!p.auth_user_id}
                        >
                          <Users className="size-4" /> Create promoter portal
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => sendPortalEmailForRow(p)}
                          className="gap-2 text-violet-600"
                          disabled={!p.auth_user_id}
                        >
                          <Mail className="size-4" /> Send portal credentials
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => detachPortalForRow(p)}
                          className="gap-2 text-amber-800"
                          disabled={!p.auth_user_id}
                        >
                          <LogOut className="size-4" /> Detach portal access
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          onClick={() => sendReferralEmail(p)}
                          className="gap-2 text-indigo-600"
                        >
                          <Mail className="size-4" /> Send Link by Email
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
        <div className="flex items-center justify-between gap-4 px-4 py-3 border-t bg-muted/10">
          <Button
            variant="outline"
            size="sm"
            disabled={safePartnerPage <= 0}
            onClick={() => setPartnerPage((p) => Math.max(0, p - 1))}
            className="gap-1"
          >
            <ChevronLeft className="size-4" /> Previous
          </Button>
          <span className="text-xs text-muted-foreground">
            Page {safePartnerPage + 1} / {partnerPageCount} · {filtered.length} partner{filtered.length === 1 ? "" : "s"}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={safePartnerPage >= partnerPageCount - 1}
            onClick={() => setPartnerPage((p) => Math.min(partnerPageCount - 1, p + 1))}
            className="gap-1"
          >
            Next <ChevronRight className="size-4" />
          </Button>
        </div>
      </Card>

      {/* Add */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Add referral partner</DialogTitle>
            <DialogDescription>
              Generate a unique referral code and assign universities/colleges. Students outside those
              institutions can still register via the link, but will not count toward this partner&apos;s
              referrals. Optionally create a promoter portal.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <Label>Name</Label>
              <Input value={addName} onChange={(e) => setAddName(e.target.value)} placeholder="Full name" />
            </div>
            <div className="space-y-1.5">
              <Label>Email</Label>
              <Input
                type="email"
                value={addEmail}
                onChange={(e) => setAddEmail(e.target.value)}
                placeholder="partner@example.com"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Contact number</Label>
              <Input value={addContact} onChange={(e) => setAddContact(e.target.value)} placeholder="Phone" />
            </div>
            <div className="space-y-1.5">
              <Label>City (optional)</Label>
              <Input value={addCity} onChange={(e) => setAddCity(e.target.value)} placeholder="City" />
            </div>
            <MultiSelectCheckboxGroup
              label="University"
              options={unis}
              selectedValues={addUniversities}
              showAllOption={false}
              emptyLabel="Select universities…"
              onChange={(newUnis) => {
                setAddUniversities(newUnis);
                setAddColleges(pruneCollegesForUniversities(colleges, unis, newUnis, addColleges));
              }}
            />
            <MultiSelectCheckboxGroup
              label="College"
              options={addCollegeOptions}
              selectedValues={addColleges}
              showAllOption={false}
              emptyLabel={
                addUniversities.length
                  ? "All colleges in selected universities (or pick specific)"
                  : "Select universities first"
              }
              onChange={setAddColleges}
            />
            <p className="text-[11px] text-muted-foreground -mt-1">
              Leave colleges empty to allow every college under the selected universities. Pick specific
              colleges to restrict credit further.
            </p>
            <div className="space-y-1.5">
              <Label>Referral type</Label>
              <Select value={addReferralType} onValueChange={setAddReferralType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {REFERRAL_TYPE_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-start gap-2 pt-1">
              <Checkbox
                id="ref-add-portal"
                checked={addCreatePortal}
                onCheckedChange={(v) => {
                  const on = !!v;
                  setAddCreatePortal(on);
                  if (on) {
                    setAddPortalLoginCode((c) => (c.trim().length >= 6 ? c : generateReferralPartnerLoginCode()));
                  }
                }}
              />
              <div className="space-y-1">
                <Label htmlFor="ref-add-portal" className="font-normal cursor-pointer leading-snug">
                  Create promoter portal (email + Promoter Login ID at /referral/login)
                </Label>
                <p className="text-[11px] text-muted-foreground">
                  Generates an Auth user linked to this partner. They only see students registered with their referral
                  code.
                </p>
              </div>
            </div>
            {addCreatePortal ? (
              <div className="space-y-3 rounded-lg border border-violet-100 bg-violet-50/40 p-3">
                <div className="space-y-1.5">
                  <Label>Promoter Login ID</Label>
                  <div className="flex gap-2">
                    <Input
                      value={addPortalLoginCode}
                      onChange={(e) => setAddPortalLoginCode(e.target.value)}
                      placeholder="RP-…"
                      className="font-mono text-sm"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      className="shrink-0"
                      onClick={() => setAddPortalLoginCode(generateReferralPartnerLoginCode())}
                    >
                      Generate
                    </Button>
                  </div>
                  <p className="text-[10px] text-muted-foreground">
                    Same value is used as their initial password on the promoter sign-in page.
                  </p>
                </div>
                <div className="flex items-start gap-2">
                  <Checkbox
                    id="ref-add-portal-mail"
                    checked={addEmailPortalCreds}
                    onCheckedChange={(v) => setAddEmailPortalCreds(!!v)}
                  />
                  <Label htmlFor="ref-add-portal-mail" className="font-normal cursor-pointer leading-snug">
                    Email portal credentials after create (same delivery path as other admin emails)
                  </Label>
                </div>
              </div>
            ) : null}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreate} disabled={saving}>
              {saving ? <Loader2 className="size-4 animate-spin mr-2" /> : null}
              Add &amp; generate link
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Link popup */}
      <Dialog open={linkOpen} onOpenChange={setLinkOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Referral registration link</DialogTitle>
            <DialogDescription>Share this URL. Signups must complete registration through this link.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label className="text-xs">Code</Label>
            <code className="block text-sm bg-slate-100 p-2 rounded break-all">{linkCode}</code>
            <Label className="text-xs">URL</Label>
            <Input readOnly value={linkUrl} className="font-mono text-xs" onClick={() => copyText(linkUrl)} />
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => copyText(linkUrl, "Link copied")}>
              <Copy className="size-4 mr-2" />
              Copy link
            </Button>
            <Button onClick={() => setLinkOpen(false)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Detail */}
      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Users className="size-5 text-primary" /> Referral signups
            </DialogTitle>
            <DialogDescription>
              {detailPartner ? (
                <>
                  <span className="font-semibold text-foreground">{detailPartner.full_name}</span> — code{" "}
                  <code className="text-xs bg-muted px-1 rounded">{detailPartner.referral_code}</code> —{" "}
                  {detailTotal} student(s)
                </>
              ) : null}
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col sm:flex-row gap-2 mb-2">
            <Input
              placeholder="Search by name, email, or phone…"
              value={detailSearch}
              onChange={(e) => {
                setDetailSearch(e.target.value);
                setDetailPage(0);
              }}
              className="h-9"
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-2 shrink-0"
              disabled={detailStudents.length === 0}
              onClick={() =>
                exportReferralStudentsCsv(
                  detailStudents,
                  `referral-${detailPartner?.referral_code || "export"}.csv`
                )
              }
            >
              <Download className="size-4" /> Export CSV
            </Button>
          </div>
          {detailLoading ? (
            <div className="flex justify-center py-10">
              <Loader2 className="size-8 animate-spin text-primary" />
            </div>
          ) : (
            <ScrollArea className="max-h-[55vh] pr-3">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">Student</TableHead>
                    <TableHead className="text-xs">Mobile</TableHead>
                    <TableHead className="text-xs">College</TableHead>
                    <TableHead className="text-xs">Status</TableHead>
                    <TableHead className="text-xs">Registered</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {detailStudents.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center text-muted-foreground py-8 text-sm">
                        No students yet from this referral link.
                      </TableCell>
                    </TableRow>
                  ) : (
                    detailStudents.map((s) => (
                      <TableRow key={s.id}>
                        <TableCell>
                          <div className="font-bold text-sm">{s.full_name}</div>
                          <div className="text-xs text-muted-foreground">{s.email}</div>
                        </TableCell>
                        <TableCell className="text-xs">{s.contact_number || "—"}</TableCell>
                        <TableCell className="text-xs max-w-[140px] truncate" title={s.college_name}>
                          {s.college_name || "—"}
                        </TableCell>
                        <TableCell className="text-xs">{s.status || "Applied"}</TableCell>
                        <TableCell className="text-xs whitespace-nowrap">
                          {s.created_at ? new Date(s.created_at).toLocaleDateString() : "—"}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </ScrollArea>
          )}
          {!detailLoading && detailTotal > 0 ? (
            <div className="flex items-center justify-between gap-2 pt-2">
              <Button
                variant="outline"
                size="sm"
                disabled={detailPage <= 0}
                onClick={() => setDetailPage((p) => Math.max(0, p - 1))}
              >
                <ChevronLeft className="size-4" />
              </Button>
              <span className="text-xs text-muted-foreground">
                Page {detailPage + 1} / {Math.max(1, Math.ceil(detailTotal / DETAIL_PAGE_SIZE))}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={detailPage >= Math.ceil(detailTotal / DETAIL_PAGE_SIZE) - 1}
                onClick={() => setDetailPage((p) => p + 1)}
              >
                <ChevronRight className="size-4" />
              </Button>
            </div>
          ) : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => detailPartner && openLinkDialog(detailPartner.referral_code)}>
              View link
            </Button>
            <Button onClick={() => setDetailOpen(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Provision promoter portal (existing row) */}
      <Dialog
        open={portalDialogOpen}
        onOpenChange={(o) => {
          setPortalDialogOpen(o);
          if (!o) setPortalTarget(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create promoter portal</DialogTitle>
            <DialogDescription>
              Creates sign-in at the referral promoter URL and emails the Promoter Login ID and registration link.
              If this email already has an account (e.g. registered as a student), it will be linked instead of showing
              “user already registered”.
            </DialogDescription>
          </DialogHeader>
          {portalTarget ? (
            <div className="space-y-3 py-2">
              <p className="text-sm font-medium">
                {portalTarget.full_name}{" "}
                <span className="text-muted-foreground font-normal">({portalTarget.email})</span>
              </p>
              <div className="space-y-1.5">
                <Label>Promoter Login ID</Label>
                <div className="flex gap-2">
                  <Input
                    className="font-mono text-sm"
                    value={portalSecret}
                    onChange={(e) => setPortalSecret(e.target.value)}
                  />
                  <Button type="button" variant="outline" onClick={() => setPortalSecret(generateReferralPartnerLoginCode())}>
                    Generate
                  </Button>
                </div>
              </div>
              <DialogFooter className="gap-2 sm:gap-0 pt-2">
                <Button type="button" variant="outline" onClick={() => setPortalDialogOpen(false)}>
                  Cancel
                </Button>
                <Button type="button" onClick={submitProvisionPortal} disabled={portalProvisionSaving}>
                  {portalProvisionSaving ? <Loader2 className="size-4 animate-spin mr-2" /> : null}
                  Create &amp; email
                </Button>
              </DialogFooter>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      {/* Edit */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit referral partner</DialogTitle>
            <DialogDescription>
              Referral code cannot be changed. Update university/college assignments to control which
              registrations count as referrals. Toggle inactive to stop new attributions.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <Label>Name</Label>
              <Input value={editName} onChange={(e) => setEditName(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Email</Label>
              <Input type="email" value={editEmail} onChange={(e) => setEditEmail(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Contact</Label>
              <Input value={editContact} onChange={(e) => setEditContact(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>City</Label>
              <Input value={editCity} onChange={(e) => setEditCity(e.target.value)} />
            </div>
            <MultiSelectCheckboxGroup
              label="University"
              options={unis}
              selectedValues={editUniversities}
              showAllOption={false}
              emptyLabel="Select universities…"
              onChange={(newUnis) => {
                setEditUniversities(newUnis);
                setEditColleges(pruneCollegesForUniversities(colleges, unis, newUnis, editColleges));
              }}
            />
            <MultiSelectCheckboxGroup
              label="College"
              options={editCollegeOptions}
              selectedValues={editColleges}
              showAllOption={false}
              emptyLabel={
                editUniversities.length
                  ? "All colleges in selected universities (or pick specific)"
                  : "Select universities first"
              }
              onChange={setEditColleges}
            />
            <div className="space-y-1.5">
              <Label>Referral type</Label>
              <Select value={editReferralType} onValueChange={setEditReferralType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {REFERRAL_TYPE_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2 pt-2">
              <Checkbox id="ref-active" checked={editActive} onCheckedChange={(v) => setEditActive(!!v)} />
              <Label htmlFor="ref-active" className="font-normal cursor-pointer">
                Active (accept new attributions)
              </Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)}>
              Cancel
            </Button>
            <Button onClick={saveEdit} disabled={saving}>
              {saving ? <Loader2 className="size-4 animate-spin mr-2" /> : null}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ReferralsPanel;
