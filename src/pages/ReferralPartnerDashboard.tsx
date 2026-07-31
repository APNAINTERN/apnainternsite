import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { REFERRAL_LOGIN_PATH } from "@/lib/authRoutes";
import {
  buildTelegramShareUrl,
  buildWhatsAppShareUrl,
  getPublicRegisterUrlWithRef,
} from "@/lib/referral";
import {
  fetchReferralPartnerStats,
  fetchReferralPartnerStudents,
  type ReferralPartnerStats,
  type ReferralStudentRow,
} from "@/lib/referralApi";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
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
  Copy,
  Share2,
  MousePointerClick,
  User,
  Shield,
} from "lucide-react";
import { SharedProfilePanel } from "@/components/SharedProfilePanel";
import { StaffSecurityPanel } from "@/components/staff/StaffAccountPanels";
import { toast } from "sonner";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip } from "recharts";

const PAGE_SIZE = 20;

const CHART_BAR = "hsl(208, 74%, 55%)";

function genderBucket(g: string | null | undefined): "Male" | "Female" | "Other" {
  const x = (g || "").trim().toLowerCase();
  if (["m", "male", "man"].includes(x)) return "Male";
  if (["f", "female", "woman"].includes(x)) return "Female";
  if (!x) return "Other";
  return "Other";
}

function statusLabel(status: string | null | undefined): string {
  const s = (status || "").trim().toLowerCase();
  if (!s) return "Applied";
  if (s === "active" || s === "approved") return "Approved";
  return status || "Applied";
}

function statusVariant(status: string | null | undefined): "default" | "secondary" | "outline" {
  const s = (status || "").trim().toLowerCase();
  if (s === "active" || s === "approved") return "default";
  return "secondary";
}

function topByField(
  rows: ReferralStudentRow[],
  field: "college_name" | "university_name" | "department",
  limit = 8
): { name: string; value: number }[] {
  const counts = new Map<string, number>();
  for (const s of rows) {
    const raw = s[field];
    const label = raw != null && String(raw).trim() ? String(raw).trim() : "Not specified";
    counts.set(label, (counts.get(label) || 0) + 1);
  }
  const arr = Array.from(counts.entries())
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value);
  if (arr.length <= limit) return arr;
  const head = arr.slice(0, limit);
  const rest = arr.slice(limit).reduce((sum, x) => sum + x.value, 0);
  if (rest > 0) head.push({ name: "Other", value: rest });
  return head;
}

function chartHeight(rows: number) {
  return Math.min(320, Math.max(160, 36 + rows * 36));
}

type Section = "dashboard" | "referrals" | "profile" | "security";

type PartnerSelf = {
  id: string;
  auth_user_id: string;
  referral_code: string;
  full_name: string | null;
  email: string | null;
  active: boolean | null;
  profile_image_url: string | null;
};

function HorizontalBreakdown({
  title,
  data,
  emptyHint,
}: {
  title: string;
  data: { name: string; value: number }[];
  emptyHint: string;
}) {
  const h = chartHeight(data.length || 1);
  return (
    <Card className="p-4 md:p-5 border border-slate-200/80 shadow-elegant bg-white">
      <h2 className="text-sm font-semibold text-slate-800 mb-3">{title}</h2>
      <BreakdownChart h={h} data={data} emptyHint={emptyHint} />
    </Card>
  );
}

function BreakdownChart({
  h,
  data,
  emptyHint,
}: {
  h: number;
  data: { name: string; value: number }[];
  emptyHint: string;
}) {
  return (
    <div style={{ height: h }} className="w-full">
      {data.length === 0 ? (
        <p className="text-sm text-slate-500 py-8 text-center">{emptyHint}</p>
      ) : (
        <ResponsiveContainer width="100%" height="100%">
          <BarChart layout="vertical" data={data} margin={{ top: 4, right: 12, left: 4, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" horizontal={false} className="stroke-slate-100" />
            <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} />
            <YAxis
              type="category"
              dataKey="name"
              width={118}
              tick={{ fontSize: 11 }}
              tickFormatter={(v: string) => (v.length > 20 ? `${v.slice(0, 20)}…` : v)}
            />
            <Tooltip formatter={(v: number) => [`${v}`, "Students"]} />
            <Bar dataKey="value" fill={CHART_BAR} radius={[0, 6, 6, 0]} name="Count" />
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}

export default function ReferralPartnerDashboard() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [partner, setPartner] = useState<PartnerSelf | null>(null);
  const [sessionUser, setSessionUser] = useState<any>(null);
  const [stats, setStats] = useState<ReferralPartnerStats | null>(null);
  const [students, setStudents] = useState<ReferralStudentRow[]>([]);
  const [studentTotal, setStudentTotal] = useState(0);
  const [studentsLoading, setStudentsLoading] = useState(false);
  const [section, setSection] = useState<Section>("dashboard");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [page, setPage] = useState(0);
  const [detailStudent, setDetailStudent] = useState<ReferralStudentRow | null>(null);
  const [navOpen, setNavOpen] = useState(false);
  const [chartSample, setChartSample] = useState<ReferralStudentRow[]>([]);

  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedSearch(search.trim()), 350);
    return () => window.clearTimeout(t);
  }, [search]);

  useEffect(() => {
    setPage(0);
  }, [debouncedSearch]);

  const loadStudents = useCallback(async (pageIndex: number, q: string) => {
    setStudentsLoading(true);
    try {
      const result = await fetchReferralPartnerStudents(supabase, {
        limit: PAGE_SIZE,
        offset: pageIndex * PAGE_SIZE,
        search: q || undefined,
      });
      if (result.error === "no_partner") {
        setStudents([]);
        setStudentTotal(0);
        return;
      }
      setStudents(result.rows);
      setStudentTotal(result.total);
      if (pageIndex === 0 && !q) {
        setChartSample(result.rows);
        if (result.total > result.rows.length) {
          const sample = await fetchReferralPartnerStudents(supabase, {
            limit: Math.min(500, result.total),
            offset: 0,
          });
          setChartSample(sample.rows);
        }
      }
    } finally {
      setStudentsLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) {
        navigate(REFERRAL_LOGIN_PATH, { replace: true });
        return;
      }
      setSessionUser(session.user);
      const { data: me, error: meErr } = await supabase
        .from("referral_partners")
        .select("id, auth_user_id, referral_code, full_name, email, active, profile_image_url")
        .eq("auth_user_id", session.user.id)
        .maybeSingle();
      if (cancelled) return;
      if (meErr || !me?.referral_code) {
        console.error(meErr);
        setPartner(null);
        setLoading(false);
        return;
      }
      setPartner(me as PartnerSelf);
      const st = await fetchReferralPartnerStats(supabase);
      if (!cancelled) setStats(st);
      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [navigate]);

  useEffect(() => {
    if (!partner?.referral_code) return;
    void loadStudents(page, debouncedSearch);
  }, [partner?.referral_code, page, debouncedSearch, loadStudents]);

  const signOut = async () => {
    await supabase.auth.signOut();
    navigate(REFERRAL_LOGIN_PATH, { replace: true });
  };

  const registerUrl = partner?.referral_code ? getPublicRegisterUrlWithRef(partner.referral_code) : "";

  const copyRegisterLink = async () => {
    if (!registerUrl) return;
    try {
      await navigator.clipboard.writeText(registerUrl);
      toast.success("Registration link copied");
    } catch {
      toast.error("Could not copy");
    }
  };

  const shareMessage = partner?.full_name
    ? `Register for Apna Intern internship program using my referral link:\n${registerUrl}`
    : `Register for Apna Intern:\n${registerUrl}`;

  const collegeChart = useMemo(() => topByField(chartSample, "college_name"), [chartSample]);
  const universityChart = useMemo(() => topByField(chartSample, "university_name"), [chartSample]);
  const departmentChart = useMemo(() => topByField(chartSample, "department"), [chartSample]);

  const pageCount = Math.max(1, Math.ceil(studentTotal / PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);

  const NavLinks = ({ mobile = false }: { mobile?: boolean }) => (
    <nav className={cn("flex flex-col gap-1", mobile ? "p-4" : "p-3")}>
      <button
        type="button"
        onClick={() => {
          setSection("dashboard");
          setNavOpen(false);
        }}
        className={cn(
          "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition-colors text-left",
          section === "dashboard" ? "bg-primary text-primary-foreground shadow-sm" : "text-slate-600 hover:bg-slate-100"
        )}
      >
        <LayoutDashboard className="size-4 shrink-0" />
        Dashboard
      </button>
      <button
        type="button"
        onClick={() => {
          setSection("referrals");
          setNavOpen(false);
        }}
        className={cn(
          "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition-colors text-left",
          section === "referrals" ? "bg-primary text-primary-foreground shadow-sm" : "text-slate-600 hover:bg-slate-100"
        )}
      >
        <Users className="size-4 shrink-0" />
        Referrals
      </button>
      <button
        type="button"
        onClick={() => {
          setSection("profile");
          setNavOpen(false);
        }}
        className={cn(
          "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition-colors text-left",
          section === "profile" ? "bg-primary text-primary-foreground shadow-sm" : "text-slate-600 hover:bg-slate-100"
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
          "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition-colors text-left",
          section === "security" ? "bg-primary text-primary-foreground shadow-sm" : "text-slate-600 hover:bg-slate-100"
        )}
      >
        <Shield className="size-4 shrink-0" />
        Security
      </button>
    </nav>
  );

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <Loader2 className="size-10 animate-spin text-primary" />
      </div>
    );
  }

  if (!partner) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 p-6 text-center gap-4">
        <p className="text-slate-700 font-medium max-w-md text-sm leading-relaxed">
          No referral profile is linked to this account. Ask your Apna Intern contact to enable promoter access for your
          email.
        </p>
        <Button variant="outline" onClick={signOut}>
          Sign out
        </Button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 flex text-slate-900">
      <aside className="hidden md:flex w-52 flex-col border-r border-slate-200 bg-white shrink-0">
        <div className="p-4 border-b border-slate-100">
          <p className="text-xs font-semibold text-primary">Referral</p>
          <p className="text-sm font-bold text-slate-900 mt-0.5">Apna Intern</p>
        </div>
        <NavLinks />
        <div className="mt-auto p-3 border-t border-slate-100">
          <Button variant="outline" size="sm" className="w-full gap-2" onClick={signOut}>
            <LogOut className="size-4" /> Sign out
          </Button>
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-14 border-b border-slate-200 bg-white flex items-center justify-between px-4 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <Sheet open={navOpen} onOpenChange={setNavOpen}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" className="md:hidden shrink-0">
                  <Menu className="size-5" />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="w-60 p-0 flex flex-col">
                <div className="p-4 border-b">
                  <p className="text-xs font-semibold text-primary">Referral</p>
                  <p className="text-sm font-bold">Apna Intern</p>
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
              <h1 className="font-bold text-base truncate text-slate-900 capitalize">
                {section === "dashboard" ? "Dashboard" : section === "referrals" ? "Your referrals" : section}
              </h1>
              <p className="text-xs text-slate-500 truncate hidden sm:block">
                Only students who registered with your referral link
              </p>
            </div>
          </div>
          <Button variant="outline" size="sm" className="gap-2 hidden md:flex" onClick={signOut}>
            <LogOut className="size-4" /> Sign out
          </Button>
        </header>

        <main className="flex-1 overflow-auto p-4 md:p-6">
          {section === "dashboard" && (
            <div className="space-y-5 max-w-5xl mx-auto">
              <Card className="p-4 md:p-5 border border-slate-200/80 shadow-elegant bg-white">
                <p className="text-xs font-medium text-slate-500 mb-1">Your referral code</p>
                <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
                  <code className="text-sm font-mono font-semibold bg-slate-100 text-slate-900 px-3 py-2 rounded-lg border border-slate-200">
                    {partner.referral_code}
                  </code>
                  {partner.active === false ? (
                    <span className="text-xs text-amber-700 font-medium">Inactive — new signups may not count.</span>
                  ) : null}
                </div>
                <p className="text-xs font-medium text-slate-500 mt-3 mb-1">Registration link for students</p>
                <div className="flex flex-col sm:flex-row gap-2">
                  <Input readOnly className="font-mono text-xs bg-slate-50 border-slate-200" value={registerUrl} onClick={copyRegisterLink} />
                  <Button type="button" variant="outline" size="sm" className="gap-2 shrink-0" onClick={copyRegisterLink}>
                    <Copy className="size-4" /> Copy
                  </Button>
                </div>
                <div className="flex flex-wrap gap-2 mt-3">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="gap-2 text-green-700 border-green-200"
                    onClick={() => window.open(buildWhatsAppShareUrl(shareMessage), "_blank", "noopener,noreferrer")}
                  >
                    <Share2 className="size-4" /> WhatsApp
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="gap-2 text-sky-700 border-sky-200"
                    onClick={() =>
                      window.open(buildTelegramShareUrl(registerUrl, "Register for Apna Intern internship"), "_blank", "noopener,noreferrer")
                    }
                  >
                    <Share2 className="size-4" /> Telegram
                  </Button>
                </div>
              </Card>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <Card className="p-4 border border-slate-200/80 shadow-elegant bg-white">
                  <p className="text-xs font-medium text-slate-500 flex items-center gap-1">
                    <MousePointerClick className="size-3.5" /> Link clicks
                  </p>
                  <p className="text-2xl font-bold text-slate-800 mt-1">{stats?.total_clicks ?? 0}</p>
                </Card>
                <Card className="p-4 border border-slate-200/80 shadow-elegant bg-white">
                  <p className="text-xs font-medium text-slate-500">Students referred</p>
                  <p className="text-2xl font-bold text-primary mt-1">{stats?.total_students ?? 0}</p>
                </Card>
                <Card className="p-4 border border-slate-200/80 shadow-elegant bg-white">
                  <p className="text-xs font-medium text-slate-500">Approved</p>
                  <p className="text-2xl font-bold text-emerald-600 mt-1">{stats?.approved_students ?? 0}</p>
                </Card>
                <Card className="p-4 border border-slate-200/80 shadow-elegant bg-white">
                  <p className="text-xs font-medium text-slate-500">Pending</p>
                  <p className="text-2xl font-bold text-amber-600 mt-1">
                    {Math.max(0, (stats?.total_students ?? 0) - (stats?.approved_students ?? 0))}
                  </p>
                </Card>
              </div>

              <div className="grid lg:grid-cols-3 gap-4">
                <HorizontalBreakdown title="By college" data={collegeChart} emptyHint="No signups yet." />
                <HorizontalBreakdown title="By university" data={universityChart} emptyHint="No signups yet." />
                <HorizontalBreakdown title="By department" data={departmentChart} emptyHint="No signups yet." />
              </div>
            </div>
          )}

          {section === "referrals" && (
            <div className="max-w-5xl mx-auto space-y-4">
              <Card className="p-4 md:p-5 border border-slate-200/80 shadow-elegant bg-white">
                <div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between mb-4">
                  <div className="relative flex-1 max-w-md">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-slate-400" />
                    <Input
                      placeholder="Search name, mobile, college…"
                      className="pl-10 h-10 bg-slate-50 border-slate-200"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                    />
                  </div>
                  <p className="text-xs text-slate-500 whitespace-nowrap">
                    {studentTotal} student{studentTotal === 1 ? "" : "s"} · Page {safePage + 1} / {pageCount}
                  </p>
                </div>

                <div className="rounded-lg border border-slate-200 overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-slate-50/80 hover:bg-slate-50/80">
                        <TableHead className="text-xs font-semibold">Student</TableHead>
                        <TableHead className="text-xs font-semibold">Mobile</TableHead>
                        <TableHead className="text-xs font-semibold">College</TableHead>
                        <TableHead className="text-xs font-semibold whitespace-nowrap">Applied</TableHead>
                        <TableHead className="text-xs font-semibold">Status</TableHead>
                        <TableHead className="text-xs font-semibold w-[72px] text-right" />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {studentsLoading ? (
                        <TableRow>
                          <TableCell colSpan={6} className="text-center py-12">
                            <Loader2 className="size-6 animate-spin mx-auto text-primary" />
                          </TableCell>
                        </TableRow>
                      ) : students.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={6} className="text-center py-12 text-slate-500 text-sm">
                            {debouncedSearch
                              ? "No matches for your search."
                              : "No students have registered with your link yet."}
                          </TableCell>
                        </TableRow>
                      ) : (
                        students.map((s) => (
                          <TableRow
                            key={s.id}
                            className="cursor-pointer hover:bg-primary/5"
                            onClick={() => setDetailStudent(s)}
                          >
                            <TableCell>
                              <div className="font-medium text-sm text-slate-900">{s.full_name || "—"}</div>
                              <div className="text-xs text-slate-500 truncate max-w-[200px]" title={s.email || ""}>
                                {s.email || "—"}
                              </div>
                            </TableCell>
                            <TableCell className="text-sm text-slate-700 whitespace-nowrap">{s.contact_number || "—"}</TableCell>
                            <TableCell className="text-sm text-slate-700 max-w-[140px] truncate" title={s.college_name || ""}>
                              {s.college_name || "—"}
                            </TableCell>
                            <TableCell className="text-xs text-slate-600 whitespace-nowrap">
                              {s.created_at ? new Date(s.created_at).toLocaleDateString() : "—"}
                            </TableCell>
                            <TableCell>
                              <Badge variant={statusVariant(s.status)} className="text-[10px]">
                                {statusLabel(s.status)}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-right">
                              <Button variant="ghost" size="sm" className="text-primary font-medium text-xs">
                                View
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>

                <div className="flex items-center justify-between gap-4 mt-4 pt-4 border-t border-slate-100">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={safePage <= 0 || studentsLoading}
                    onClick={() => setPage((p) => Math.max(0, p - 1))}
                    className="gap-1"
                  >
                    <ChevronLeft className="size-4" /> Previous
                  </Button>
                  <span className="text-xs text-slate-500">
                    {studentTotal === 0 ? 0 : safePage * PAGE_SIZE + 1}–{Math.min((safePage + 1) * PAGE_SIZE, studentTotal)} of{" "}
                    {studentTotal}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={safePage >= pageCount - 1 || studentsLoading}
                    onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
                    className="gap-1"
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
                profileId={partner.id}
                profileEmail={partner.email}
                profileName={partner.full_name}
                profileImageUrl={partner.profile_image_url}
                roleLabel="Referral Partner"
                fields={[
                  { label: "Referral Code", value: partner.referral_code },
                  { label: "Full Name", value: partner.full_name },
                  { label: "Email Address", value: partner.email },
                  { label: "Status", value: partner.active ? "Active" : "Inactive" },
                ]}
                isActive={section === "profile"}
                onDatabaseUpdate={async (url) => {
                  await supabase.from("referral_partners").update({ profile_image_url: url }).eq("id", partner.id);
                }}
                onProfileImageUpdated={(url) => setPartner({ ...partner, profile_image_url: url })}
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

      <Dialog open={!!detailStudent} onOpenChange={(o) => !o && setDetailStudent(null)}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto border border-slate-200">
          <DialogHeader>
            <DialogTitle className="text-left text-base font-semibold">Student</DialogTitle>
          </DialogHeader>
          {detailStudent && (
            <dl className="grid grid-cols-1 gap-3 text-sm">
              {[
                ["Full name", detailStudent.full_name],
                ["Email", detailStudent.email],
                ["Phone", detailStudent.contact_number],
                ["Status", statusLabel(detailStudent.status)],
                ["Gender", genderBucket(detailStudent.gender)],
                ["University", detailStudent.university_name],
                ["College", detailStudent.college_name],
                ["Department", detailStudent.department],
                ["Course", detailStudent.course],
                ["Registration ID", detailStudent.registration_id],
                ["Registered", detailStudent.created_at ? new Date(detailStudent.created_at).toLocaleString() : "—"],
              ].map(([label, val]) => (
                <div
                  key={String(label)}
                  className="flex flex-col sm:flex-row sm:gap-3 border-b border-slate-100 pb-2 last:border-0"
                >
                  <dt className="text-xs font-medium text-slate-500 shrink-0 sm:w-32">{label}</dt>
                  <dd className="text-slate-800 break-words">{val != null && val !== "" ? String(val) : "—"}</dd>
                </div>
              ))}
            </dl>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
