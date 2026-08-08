import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Award,
  Ban,
  BarChart3,
  BookOpen,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Eye,
  GraduationCap,
  Loader2,
  Pencil,
  Plus,
  Search,
  Settings,
  Trash2,
  Users,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  createCourse,
  deleteCategory,
  deleteCourse,
  deleteLead,
  deleteReview,
  duplicateCourse,
  enrollStudent,
  findStudentUserIdByEmail,
  formatCoursePrice,
  getCourseById,
  getCourseDashboardStats,
  getCourseSettings,
  issueCourseCertificate,
  listCategories,
  listCourseCertificates,
  listCourses,
  listEnrollments,
  listLeads,
  listReviews,
  removeEnrollment,
  saveCourseCurriculum,
  saveCourseLists,
  setCourseStatus,
  setEnrollmentBlocked,
  setReviewStatus,
  slugify,
  toggleCategoryActive,
  updateCourse,
  updateCourseSettings,
  updateEnrollment,
  uploadCourseImage,
  upsertCategory,
  upsertLead,
  type Category,
  type Course,
  type CourseDashboardStats,
  type CourseSettings,
  type CourseStatus,
  type Enrollment,
  type Lead,
  type ListItem,
  type Review,
} from "@/lib/coursesApi";

function EmptyTableRow({ colSpan, message = "No Data Available" }: { colSpan: number; message?: string }) {
  return (
    <TableRow>
      <TableCell colSpan={colSpan} className="py-10 text-center text-sm text-slate-500">
        {message}
      </TableCell>
    </TableRow>
  );
}

const PAGE_SIZE = 10;

type ModuleDraft = {
  title: string;
  sort_order: number;
  lessons: Array<{
    title: string;
    video_url: string;
    duration_minutes: number;
    sort_order: number;
    notes: string;
  }>;
};

const emptyModule = (): ModuleDraft => ({
  title: "",
  sort_order: 0,
  lessons: [{ title: "", video_url: "", duration_minutes: 0, sort_order: 0, notes: "" }],
});

export function CourseManagementPanel({
  onLogAction,
}: {
  onLogAction?: (
    action: string,
    entity: string,
    description: string,
    metadata?: Record<string, unknown>
  ) => Promise<void>;
}) {
  const [tab, setTab] = useState("dashboard");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [stats, setStats] = useState<CourseDashboardStats | null>(null);
  const [courses, setCourses] = useState<Course[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [enrollments, setEnrollments] = useState<Enrollment[]>([]);
  const [enrollStatusFilter, setEnrollStatusFilter] = useState<Enrollment["status"] | "all">("all");
  const [enrollSearch, setEnrollSearch] = useState("");
  const [reviews, setReviews] = useState<Review[]>([]);
  const [certificates, setCertificates] = useState<Record<string, unknown>[]>([]);
  const [settings, setSettings] = useState<CourseSettings | null>(null);
  const [courseSearch, setCourseSearch] = useState("");
  const [courseStatusFilter, setCourseStatusFilter] = useState<CourseStatus | "all">("all");
  const [coursePage, setCoursePage] = useState(0);
  const [selectedCourseIds, setSelectedCourseIds] = useState<string[]>([]);
  const [editingCourseId, setEditingCourseId] = useState<string | null>(null);

  const [courseForm, setCourseForm] = useState({
    title: "",
    slug: "",
    category_id: "",
    subcategory: "",
    instructor_name: "",
    thumbnail_url: "",
    banner_url: "",
    intro_video_url: "",
    short_description: "",
    full_description: "",
    original_price_paise: 0,
    discount_price_paise: 0,
    is_free: false,
    duration_text: "",
    language: "English",
    difficulty: "" as "" | "beginner" | "intermediate" | "advanced",
    status: "draft" as CourseStatus,
    is_featured: false,
    meta_title: "",
    meta_description: "",
    meta_keywords: "",
  });
  const [learningPoints, setLearningPoints] = useState<ListItem[]>([{ body: "", sort_order: 0 }]);
  const [requirements, setRequirements] = useState<ListItem[]>([{ body: "", sort_order: 0 }]);
  const [includes, setIncludes] = useState<ListItem[]>([{ body: "", sort_order: 0 }]);
  const [targetAudience, setTargetAudience] = useState<ListItem[]>([{ body: "", sort_order: 0 }]);
  const [modules, setModules] = useState<ModuleDraft[]>([emptyModule()]);

  const [enrollEmail, setEnrollEmail] = useState("");
  const [enrollCourseId, setEnrollCourseId] = useState("");
  const [viewEnrollment, setViewEnrollment] = useState<Enrollment | null>(null);
  const [editEnrollment, setEditEnrollment] = useState<Enrollment | null>(null);
  const [editEnrollmentForm, setEditEnrollmentForm] = useState({
    course_id: "",
    status: "active" as Enrollment["status"],
    progress_percent: 0,
  });
  const [categoryForm, setCategoryForm] = useState<Partial<Category>>({ name: "", slug: "", description: "", is_active: true, sort_order: 0 });
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null);
  const [leadDialogOpen, setLeadDialogOpen] = useState(false);
  const [leadForm, setLeadForm] = useState<Partial<Lead>>({ name: "", email: "", phone: "", status: "new", notes: "" });

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      // Load sections one at a time on AWS to stay under Lambda concurrency limits.
      const load = async <T,>(fn: () => Promise<T>, label: string, fallback: T): Promise<T> => {
        try {
          return await fn();
        } catch (err) {
          console.warn(`[courses] ${label} failed:`, err);
          return fallback;
        }
      };

      const stats = await load(() => getCourseDashboardStats(supabase), "stats", null);
      const courseRows = await load(() => listCourses(supabase, { status: "all", sort: "newest" }), "courses", []);
      const categoryRows = await load(() => listCategories(supabase), "categories", []);
      const leadRows = await load(() => listLeads(supabase), "leads", []);
      const enrollmentRows = await load(() => listEnrollments(supabase), "enrollments", []);
      const reviewRows = await load(() => listReviews(supabase, "all"), "reviews", []);
      const certRows = await load(() => listCourseCertificates(supabase), "certificates", []);
      const settingsRow = await load(() => getCourseSettings(supabase), "settings", null);

      setStats(stats);
      setCourses(courseRows);
      setCategories(categoryRows);
      setLeads(leadRows);
      setEnrollments(enrollmentRows);
      setReviews(reviewRows);
      setCertificates(certRows as Record<string, unknown>[]);
      setSettings(settingsRow);

      if (!stats && !courseRows.length && !categoryRows.length) {
        toast.error("Failed to load course data.");
      } else if (!stats || !courseRows.length) {
        toast.message("Some course sections could not be loaded. Showing available data.");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load course data.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  const filteredCourses = useMemo(() => {
    let rows = courses;
    if (courseStatusFilter !== "all") rows = rows.filter((c) => c.status === courseStatusFilter);
    if (courseSearch.trim()) {
      const q = courseSearch.toLowerCase();
      rows = rows.filter(
        (c) =>
          c.title.toLowerCase().includes(q) ||
          c.slug.toLowerCase().includes(q) ||
          (c.instructor_name || "").toLowerCase().includes(q)
      );
    }
    return rows;
  }, [courses, courseSearch, courseStatusFilter]);

  const pagedCourses = filteredCourses.slice(coursePage * PAGE_SIZE, (coursePage + 1) * PAGE_SIZE);
  const totalPages = Math.max(1, Math.ceil(filteredCourses.length / PAGE_SIZE));

  const filteredEnrollments = useMemo(() => {
    let rows = enrollments;
    if (enrollStatusFilter !== "all") rows = rows.filter((e) => e.status === enrollStatusFilter);
    if (enrollSearch.trim()) {
      const q = enrollSearch.toLowerCase();
      rows = rows.filter(
        (e) =>
          (e.student_email || "").toLowerCase().includes(q) ||
          (e.student_name || "").toLowerCase().includes(q) ||
          (e.student_phone || "").toLowerCase().includes(q) ||
          (e.course?.title || "").toLowerCase().includes(q) ||
          e.student_id.toLowerCase().includes(q)
      );
    }
    return rows;
  }, [enrollments, enrollStatusFilter, enrollSearch]);

  const courseTitleById = useMemo(() => {
    const map = new Map<string, string>();
    for (const c of courses) map.set(c.id, c.title);
    return map;
  }, [courses]);

  const resetCourseForm = () => {
    setEditingCourseId(null);
    setCourseForm({
      title: "",
      slug: "",
      category_id: "",
      subcategory: "",
      instructor_name: settings?.default_instructor || "",
      thumbnail_url: settings?.default_thumbnail_url || "",
      banner_url: "",
      intro_video_url: "",
      short_description: "",
      full_description: "",
      original_price_paise: 0,
      discount_price_paise: 0,
      is_free: false,
      duration_text: "",
      language: "English",
      difficulty: "",
      status: "draft",
      is_featured: false,
      meta_title: "",
      meta_description: "",
      meta_keywords: "",
    });
    setLearningPoints([{ body: "", sort_order: 0 }]);
    setRequirements([{ body: "", sort_order: 0 }]);
    setIncludes([{ body: "", sort_order: 0 }]);
    setTargetAudience([{ body: "", sort_order: 0 }]);
    setModules([emptyModule()]);
  };

  const loadCourseForEdit = async (id: string) => {
    setSaving(true);
    try {
      const detail = await getCourseById(supabase, id);
      if (!detail) throw new Error("Course not found");
      setEditingCourseId(id);
      setCourseForm({
        title: detail.title,
        slug: detail.slug,
        category_id: detail.category_id || "",
        subcategory: detail.subcategory || "",
        instructor_name: detail.instructor_name || "",
        thumbnail_url: detail.thumbnail_url || "",
        banner_url: detail.banner_url || "",
        intro_video_url: detail.intro_video_url || "",
        short_description: detail.short_description || "",
        full_description: detail.full_description || "",
        original_price_paise: detail.original_price_paise,
        discount_price_paise: detail.discount_price_paise,
        is_free: detail.is_free,
        duration_text: detail.duration_text || "",
        language: detail.language,
        difficulty: detail.difficulty || "",
        status: detail.status,
        is_featured: detail.is_featured,
        meta_title: detail.meta_title || "",
        meta_description: detail.meta_description || "",
        meta_keywords: detail.meta_keywords || "",
      });
      setLearningPoints(detail.learning_points.length ? detail.learning_points : [{ body: "", sort_order: 0 }]);
      setRequirements(detail.requirements.length ? detail.requirements : [{ body: "", sort_order: 0 }]);
      setIncludes(detail.includes.length ? detail.includes : [{ body: "", sort_order: 0 }]);
      setTargetAudience(detail.target_audience.length ? detail.target_audience : [{ body: "", sort_order: 0 }]);
      setModules(
        detail.modules.length
          ? detail.modules.map((m) => ({
              title: m.title,
              sort_order: m.sort_order,
              lessons: (m.lessons || []).map((l) => ({
                title: l.title,
                video_url: l.video_url || "",
                duration_minutes: l.duration_minutes,
                sort_order: l.sort_order,
                notes: l.notes || "",
              })),
            }))
          : [emptyModule()]
      );
      setTab("editor");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load course.");
    } finally {
      setSaving(false);
    }
  };

  const saveCourse = async () => {
    if (!courseForm.title.trim()) {
      toast.error("Title is required.");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        ...courseForm,
        slug: courseForm.slug || slugify(courseForm.title),
        category_id: courseForm.category_id || null,
        difficulty: courseForm.difficulty || null,
        original_price_paise: Math.round(Number(courseForm.original_price_paise) || 0),
        discount_price_paise: Math.round(Number(courseForm.discount_price_paise) || 0),
      };
      let courseId = editingCourseId;
      if (editingCourseId) {
        await updateCourse(supabase, editingCourseId, payload);
      } else {
        const { data: userData } = await supabase.auth.getUser();
        const created = await createCourse(supabase, payload, userData.user?.id);
        courseId = created.id;
        setEditingCourseId(created.id);
      }
      if (!courseId) throw new Error("Missing course id");
      await saveCourseLists(supabase, courseId, {
        learning_points: learningPoints,
        requirements,
        includes,
        target_audience: targetAudience,
      });
      await saveCourseCurriculum(
        supabase,
        courseId,
        modules.map((m, mi) => ({
          title: m.title,
          sort_order: mi,
          lessons: m.lessons.map((l, li) => ({
            title: l.title,
            video_url: l.video_url || null,
            duration_minutes: Number(l.duration_minutes) || 0,
            sort_order: li,
            notes: l.notes || null,
          })),
        }))
      );
      toast.success(editingCourseId ? "Course updated." : "Course created.");
      await onLogAction?.("update", "course", `Saved course ${payload.title}`, { courseId });
      await loadAll();
      setTab("courses");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed.");
    } finally {
      setSaving(false);
    }
  };

  const handleBulkStatus = async (status: CourseStatus) => {
    if (!selectedCourseIds.length) return;
    setSaving(true);
    try {
      await Promise.all(selectedCourseIds.map((id) => setCourseStatus(supabase, id, status)));
      toast.success(`Updated ${selectedCourseIds.length} course(s).`);
      setSelectedCourseIds([]);
      await loadAll();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Bulk update failed.");
    } finally {
      setSaving(false);
    }
  };

  const handleBulkDelete = async () => {
    if (!selectedCourseIds.length || !confirm(`Delete ${selectedCourseIds.length} course(s)?`)) return;
    setSaving(true);
    try {
      await Promise.all(selectedCourseIds.map((id) => deleteCourse(supabase, id)));
      toast.success("Courses deleted.");
      setSelectedCourseIds([]);
      await loadAll();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Delete failed.");
    } finally {
      setSaving(false);
    }
  };

  const handleEnroll = async () => {
    if (!enrollEmail.trim() || !enrollCourseId) {
      toast.error("Email and course are required.");
      return;
    }
    setSaving(true);
    try {
      const studentId = await findStudentUserIdByEmail(supabase, enrollEmail);
      if (!studentId) throw new Error("No student found with that email.");
      const { data: userData } = await supabase.auth.getUser();
      await enrollStudent(supabase, enrollCourseId, studentId, userData.user?.id);
      toast.success("Student enrolled.");
      setEnrollEmail("");
      await loadAll();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Enrollment failed.");
    } finally {
      setSaving(false);
    }
  };

  const openEditEnrollment = (row: Enrollment) => {
    setEditEnrollment(row);
    setEditEnrollmentForm({
      course_id: row.course_id,
      status: row.status,
      progress_percent: Math.round(Number(row.progress_percent) || 0),
    });
  };

  const handleUpdateEnrollment = async () => {
    if (!editEnrollment) return;
    setSaving(true);
    try {
      await updateEnrollment(supabase, editEnrollment.id, {
        course_id: editEnrollmentForm.course_id,
        status: editEnrollmentForm.status,
        progress_percent: editEnrollmentForm.progress_percent,
      });
      toast.success("Enrollment updated.");
      setEditEnrollment(null);
      await loadAll();
      void onLogAction?.(
        "update",
        "course_enrollment",
        `Updated enrollment ${editEnrollment.id}`,
        { enrollment_id: editEnrollment.id, ...editEnrollmentForm }
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not update enrollment.");
    } finally {
      setSaving(false);
    }
  };

  const handleToggleEnrollmentBlock = async (row: Enrollment) => {
    const blocked = row.status !== "cancelled";
    const label = blocked ? "block" : "unblock";
    if (!confirm(`${blocked ? "Block" : "Unblock"} this enrollment?`)) return;
    setSaving(true);
    try {
      await setEnrollmentBlocked(supabase, row.id, blocked);
      toast.success(blocked ? "Enrollment blocked." : "Enrollment unblocked.");
      await loadAll();
      void onLogAction?.(
        label,
        "course_enrollment",
        `${blocked ? "Blocked" : "Unblocked"} enrollment for ${row.student_email || row.student_id}`,
        { enrollment_id: row.id, student_id: row.student_id }
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : `Could not ${label} enrollment.`);
    } finally {
      setSaving(false);
    }
  };

  const enrollmentStatusLabel = (status: Enrollment["status"]) =>
    status === "cancelled" ? "blocked" : status;

  const handleImageUpload = async (file: File, field: "thumbnail_url" | "banner_url") => {
    setSaving(true);
    try {
      const { publicUrl } = await uploadCourseImage(supabase, file, field.replace("_url", ""));
      setCourseForm((f) => ({ ...f, [field]: publicUrl }));
      toast.success("Image uploaded.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setSaving(false);
    }
  };

  const statCards = stats
    ? [
        { label: "Total Courses", value: stats.totalCourses, icon: BookOpen },
        { label: "Published", value: stats.publishedCourses, icon: GraduationCap },
        { label: "Enrollments", value: stats.totalEnrollments, icon: Users },
        { label: "New Leads", value: stats.newLeads, icon: BarChart3 },
        { label: "Pending Reviews", value: stats.pendingReviews, icon: Award },
        { label: "Certificates", value: stats.certificatesIssued, icon: Award },
      ]
    : [];

  if (loading && !stats) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="size-10 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-black text-slate-900">Course Management</h2>
        <p className="text-sm text-slate-500">Manage courses, enrollments, leads, and certificates.</p>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="flex h-auto flex-wrap gap-1 bg-slate-100 p-1">
          {[
            ["dashboard", "Dashboard"],
            ["courses", "Courses"],
            ["editor", "Add/Edit"],
            ["enroll", "Enroll"],
            ["leads", "Leads"],
            ["categories", "Categories"],
            ["reviews", "Reviews"],
            ["certificates", "Certificates"],
            ["settings", "Settings"],
          ].map(([v, l]) => (
            <TabsTrigger key={v} value={v} className="rounded-lg font-semibold">
              {l}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="dashboard" className="mt-6">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {statCards.map((s) => (
              <Card key={s.label} className="rounded-2xl border-slate-200 p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wider text-slate-400">{s.label}</p>
                    <p className="mt-1 text-3xl font-black text-slate-900">{s.value}</p>
                  </div>
                  <s.icon className="size-8 text-emerald-600 opacity-80" />
                </div>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="courses" className="mt-6 space-y-4">
          <div className="flex flex-wrap gap-3">
            <div className="relative min-w-[200px] flex-1">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
              <Input
                className="rounded-xl pl-10"
                placeholder="Search courses..."
                value={courseSearch}
                onChange={(e) => {
                  setCourseSearch(e.target.value);
                  setCoursePage(0);
                }}
              />
            </div>
            <Select value={courseStatusFilter} onValueChange={(v) => setCourseStatusFilter(v as CourseStatus | "all")}>
              <SelectTrigger className="w-40 rounded-xl">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="draft">Draft</SelectItem>
                <SelectItem value="published">Published</SelectItem>
                <SelectItem value="private">Private</SelectItem>
              </SelectContent>
            </Select>
            <Button
              className="rounded-xl font-bold gap-2"
              onClick={() => {
                resetCourseForm();
                setTab("editor");
              }}
            >
              <Plus className="size-4" /> Add Course
            </Button>
          </div>

          {selectedCourseIds.length > 0 ? (
            <div className="flex flex-wrap gap-2 rounded-xl bg-slate-100 p-3">
              <span className="text-sm font-semibold text-slate-600">{selectedCourseIds.length} selected</span>
              <Button size="sm" variant="outline" onClick={() => void handleBulkStatus("published")}>
                Publish
              </Button>
              <Button size="sm" variant="outline" onClick={() => void handleBulkStatus("draft")}>
                Unpublish
              </Button>
              <Button size="sm" variant="destructive" onClick={() => void handleBulkDelete()}>
                Delete
              </Button>
            </div>
          ) : null}

          <Card className="overflow-hidden rounded-2xl border-slate-200">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">
                    <input
                      type="checkbox"
                      checked={pagedCourses.length > 0 && pagedCourses.every((c) => selectedCourseIds.includes(c.id))}
                      onChange={(e) =>
                        setSelectedCourseIds(
                          e.target.checked ? pagedCourses.map((c) => c.id) : []
                        )
                      }
                    />
                  </TableHead>
                  <TableHead>Title</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Price</TableHead>
                  <TableHead>Students</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pagedCourses.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell>
                      <input
                        type="checkbox"
                        checked={selectedCourseIds.includes(c.id)}
                        onChange={(e) =>
                          setSelectedCourseIds((prev) =>
                            e.target.checked ? [...prev, c.id] : prev.filter((id) => id !== c.id)
                          )
                        }
                      />
                    </TableCell>
                    <TableCell>
                      <div className="font-semibold">{c.title}</div>
                      <div className="text-xs text-slate-400">{c.slug}</div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={c.status === "published" ? "default" : "secondary"}>{c.status}</Badge>
                    </TableCell>
                    <TableCell>{c.is_free ? "Free" : formatCoursePrice(c.discount_price_paise || c.original_price_paise)}</TableCell>
                    <TableCell>{c.students_count}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button size="sm" variant="ghost" onClick={() => void loadCourseForEdit(c.id)}>
                          Edit
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={async () => {
                            const { data: userData } = await supabase.auth.getUser();
                            await duplicateCourse(supabase, c.id, userData.user?.id);
                            toast.success("Course duplicated.");
                            await loadAll();
                          }}
                        >
                          Copy
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-destructive"
                          onClick={async () => {
                            if (!confirm("Delete this course?")) return;
                            await deleteCourse(supabase, c.id);
                            toast.success("Deleted.");
                            await loadAll();
                          }}
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
          <div className="flex justify-between">
            <Button variant="outline" disabled={coursePage === 0} onClick={() => setCoursePage((p) => p - 1)}>
              Previous
            </Button>
            <span className="text-sm text-slate-500">
              Page {coursePage + 1} of {totalPages}
            </span>
            <Button variant="outline" disabled={coursePage >= totalPages - 1} onClick={() => setCoursePage((p) => p + 1)}>
              Next
            </Button>
          </div>
        </TabsContent>

        <TabsContent value="editor" className="mt-6 space-y-6">
          <Card className="rounded-2xl border-slate-200 p-6 space-y-6">
            <h3 className="font-black text-lg">{editingCourseId ? "Edit Course" : "Add Course"}</h3>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2 md:col-span-2">
                <Label>Title</Label>
                <Input
                  value={courseForm.title}
                  onChange={(e) => setCourseForm((f) => ({ ...f, title: e.target.value, slug: f.slug || slugify(e.target.value) }))}
                />
              </div>
              <div className="space-y-2">
                <Label>Slug</Label>
                <Input value={courseForm.slug} onChange={(e) => setCourseForm((f) => ({ ...f, slug: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>Category</Label>
                <Select value={courseForm.category_id || "none"} onValueChange={(v) => setCourseForm((f) => ({ ...f, category_id: v === "none" ? "" : v }))}>
                  <SelectTrigger><SelectValue placeholder="Select category" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    {categories.map((c) => (
                      <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Instructor</Label>
                <Input value={courseForm.instructor_name} onChange={(e) => setCourseForm((f) => ({ ...f, instructor_name: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>Duration</Label>
                <Input value={courseForm.duration_text} onChange={(e) => setCourseForm((f) => ({ ...f, duration_text: e.target.value }))} placeholder="e.g. 8 weeks" />
              </div>
              <div className="space-y-2">
                <Label>Original Price (paise)</Label>
                <Input type="number" value={courseForm.original_price_paise} onChange={(e) => setCourseForm((f) => ({ ...f, original_price_paise: Number(e.target.value) }))} />
              </div>
              <div className="space-y-2">
                <Label>Discount Price (paise)</Label>
                <Input type="number" value={courseForm.discount_price_paise} onChange={(e) => setCourseForm((f) => ({ ...f, discount_price_paise: Number(e.target.value) }))} />
              </div>
              <div className="flex items-center gap-3">
                <Switch checked={courseForm.is_free} onCheckedChange={(v) => setCourseForm((f) => ({ ...f, is_free: v }))} />
                <Label>Free course</Label>
              </div>
              <div className="flex items-center gap-3">
                <Switch checked={courseForm.is_featured} onCheckedChange={(v) => setCourseForm((f) => ({ ...f, is_featured: v }))} />
                <Label>Featured</Label>
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label>Short Description</Label>
                <Textarea value={courseForm.short_description} onChange={(e) => setCourseForm((f) => ({ ...f, short_description: e.target.value }))} />
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label>Full Description</Label>
                <Textarea rows={5} value={courseForm.full_description} onChange={(e) => setCourseForm((f) => ({ ...f, full_description: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>Thumbnail</Label>
                <Input type="file" accept="image/*" onChange={(e) => e.target.files?.[0] && void handleImageUpload(e.target.files[0], "thumbnail_url")} />
                {courseForm.thumbnail_url ? <img src={courseForm.thumbnail_url} alt="" className="mt-2 h-20 rounded-lg object-cover" /> : null}
              </div>
              <div className="space-y-2">
                <Label>Banner</Label>
                <Input type="file" accept="image/*" onChange={(e) => e.target.files?.[0] && void handleImageUpload(e.target.files[0], "banner_url")} />
              </div>
              <div className="space-y-2">
                <Label>Status</Label>
                <Select value={courseForm.status} onValueChange={(v) => setCourseForm((f) => ({ ...f, status: v as CourseStatus }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="draft">Draft</SelectItem>
                    <SelectItem value="published">Published</SelectItem>
                    <SelectItem value="private">Private</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Difficulty</Label>
                <Select value={courseForm.difficulty || "none"} onValueChange={(v) => setCourseForm((f) => ({ ...f, difficulty: v === "none" ? "" : (v as typeof f.difficulty) }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    <SelectItem value="beginner">Beginner</SelectItem>
                    <SelectItem value="intermediate">Intermediate</SelectItem>
                    <SelectItem value="advanced">Advanced</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {[
              ["Learning Points", learningPoints, setLearningPoints],
              ["Requirements", requirements, setRequirements],
              ["Includes", includes, setIncludes],
              ["Target Audience", targetAudience, setTargetAudience],
            ].map(([label, items, setter]) => (
              <div key={label as string} className="space-y-2">
                <Label>{label as string}</Label>
                {(items as ListItem[]).map((item, i) => (
                  <div key={i} className="flex gap-2">
                    <Input
                      value={item.body}
                      onChange={(e) => {
                        const next = [...(items as ListItem[])];
                        next[i] = { ...next[i], body: e.target.value, sort_order: i };
                        (setter as (v: ListItem[]) => void)(next);
                      }}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => (setter as (v: ListItem[]) => void)((items as ListItem[]).filter((_, idx) => idx !== i))}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                ))}
                <Button type="button" variant="outline" size="sm" onClick={() => (setter as (v: ListItem[]) => void)([...(items as ListItem[]), { body: "", sort_order: (items as ListItem[]).length }])}>
                  Add row
                </Button>
              </div>
            ))}

            <div className="space-y-4">
              <Label className="text-base font-black">Curriculum</Label>
              {modules.map((mod, mi) => (
                <Card key={mi} className="rounded-xl border-slate-200 p-4 space-y-3">
                  <div className="flex gap-2">
                    <Input
                      placeholder="Module title"
                      value={mod.title}
                      onChange={(e) => {
                        const next = [...modules];
                        next[mi] = { ...next[mi], title: e.target.value };
                        setModules(next);
                      }}
                    />
                    <Button type="button" variant="ghost" size="icon" disabled={mi === 0} onClick={() => {
                      const next = [...modules];
                      [next[mi - 1], next[mi]] = [next[mi], next[mi - 1]];
                      setModules(next);
                    }}><ChevronUp className="size-4" /></Button>
                    <Button type="button" variant="ghost" size="icon" disabled={mi === modules.length - 1} onClick={() => {
                      const next = [...modules];
                      [next[mi], next[mi + 1]] = [next[mi + 1], next[mi]];
                      setModules(next);
                    }}><ChevronDown className="size-4" /></Button>
                    <Button type="button" variant="ghost" size="icon" onClick={() => setModules(modules.filter((_, idx) => idx !== mi))}><Trash2 className="size-4" /></Button>
                  </div>
                  {mod.lessons.map((lesson, li) => (
                    <div key={li} className="grid gap-2 rounded-lg bg-slate-50 p-3 md:grid-cols-4">
                      <Input placeholder="Lesson title" value={lesson.title} onChange={(e) => {
                        const next = [...modules];
                        next[mi].lessons[li] = { ...next[mi].lessons[li], title: e.target.value };
                        setModules(next);
                      }} />
                      <Input placeholder="Video URL" value={lesson.video_url} onChange={(e) => {
                        const next = [...modules];
                        next[mi].lessons[li] = { ...next[mi].lessons[li], video_url: e.target.value };
                        setModules(next);
                      }} />
                      <Input type="number" placeholder="Minutes" value={lesson.duration_minutes} onChange={(e) => {
                        const next = [...modules];
                        next[mi].lessons[li] = { ...next[mi].lessons[li], duration_minutes: Number(e.target.value) };
                        setModules(next);
                      }} />
                      <Button type="button" variant="ghost" size="icon" onClick={() => {
                        const next = [...modules];
                        next[mi].lessons = next[mi].lessons.filter((_, idx) => idx !== li);
                        setModules(next);
                      }}><Trash2 className="size-4" /></Button>
                    </div>
                  ))}
                  <Button type="button" variant="outline" size="sm" onClick={() => {
                    const next = [...modules];
                    next[mi].lessons.push({ title: "", video_url: "", duration_minutes: 0, sort_order: next[mi].lessons.length, notes: "" });
                    setModules(next);
                  }}>Add lesson</Button>
                </Card>
              ))}
              <Button type="button" variant="outline" onClick={() => setModules([...modules, emptyModule()])}>Add module</Button>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              <div className="space-y-2">
                <Label>Meta Title</Label>
                <Input value={courseForm.meta_title} onChange={(e) => setCourseForm((f) => ({ ...f, meta_title: e.target.value }))} />
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label>Meta Description</Label>
                <Input value={courseForm.meta_description} onChange={(e) => setCourseForm((f) => ({ ...f, meta_description: e.target.value }))} />
              </div>
            </div>

            <div className="flex gap-3">
              <Button className="rounded-xl font-bold" disabled={saving} onClick={() => void saveCourse()}>
                {saving ? <Loader2 className="size-4 animate-spin" /> : "Save Course"}
              </Button>
              <Button variant="outline" className="rounded-xl" onClick={resetCourseForm}>Reset</Button>
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="enroll" className="mt-6 space-y-4">
          <Card className="max-w-lg rounded-2xl border-slate-200 p-6 space-y-4">
            <h3 className="font-black">Enroll Student</h3>
            <div className="space-y-2">
              <Label>Student Email</Label>
              <Input value={enrollEmail} onChange={(e) => setEnrollEmail(e.target.value)} placeholder="student@example.com" />
            </div>
            <div className="space-y-2">
              <Label>Course</Label>
              <Select value={enrollCourseId} onValueChange={setEnrollCourseId}>
                <SelectTrigger><SelectValue placeholder="Select course" /></SelectTrigger>
                <SelectContent>
                  {courses.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.title}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button className="rounded-xl font-bold" disabled={saving} onClick={() => void handleEnroll()}>
              Enroll
            </Button>
          </Card>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <h3 className="font-black text-slate-800">
              Enrolled Students ({filteredEnrollments.length})
            </h3>
            <div className="flex flex-wrap gap-2">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
                <Input
                  className="h-9 w-56 rounded-xl pl-9"
                  placeholder="Search email, name, course…"
                  value={enrollSearch}
                  onChange={(e) => setEnrollSearch(e.target.value)}
                />
              </div>
              <Select
                value={enrollStatusFilter}
                onValueChange={(v) => setEnrollStatusFilter(v as Enrollment["status"] | "all")}
              >
                <SelectTrigger className="h-9 w-36 rounded-xl"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All status</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                  <SelectItem value="cancelled">Blocked</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <Card className="rounded-2xl border-slate-200 overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Student</TableHead>
                  <TableHead>Course</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Progress</TableHead>
                  <TableHead>Enrolled</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredEnrollments.length === 0 ? (
                  <EmptyTableRow colSpan={6} />
                ) : (
                  filteredEnrollments.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell>
                        <div className="font-semibold text-slate-800">
                          {row.student_name || "—"}
                        </div>
                        <div className="text-sm text-slate-600">{row.student_email || row.student_id}</div>
                        {(row.student_phone || row.student_college) && (
                          <div className="text-xs text-slate-400">
                            {[row.student_phone, row.student_college].filter(Boolean).join(" · ")}
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="font-medium">
                        {row.course?.title || courseTitleById.get(row.course_id) || "—"}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={row.status === "cancelled" ? "destructive" : "secondary"}
                          className="capitalize"
                        >
                          {enrollmentStatusLabel(row.status)}
                        </Badge>
                      </TableCell>
                      <TableCell>{Math.round(Number(row.progress_percent) || 0)}%</TableCell>
                      <TableCell className="text-sm text-slate-500">
                        {row.enrolled_at ? new Date(row.enrolled_at).toLocaleString() : "—"}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex flex-wrap items-center justify-end gap-1">
                          <Button
                            size="sm"
                            variant="ghost"
                            className="gap-1"
                            onClick={() => setViewEnrollment(row)}
                          >
                            <Eye className="size-3.5" /> View
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="gap-1"
                            disabled={saving}
                            onClick={() => openEditEnrollment(row)}
                          >
                            <Pencil className="size-3.5" /> Update
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="gap-1"
                            disabled={saving}
                            onClick={() => void handleToggleEnrollmentBlock(row)}
                          >
                            {row.status === "cancelled" ? (
                              <>
                                <CheckCircle2 className="size-3.5" /> Unblock
                              </>
                            ) : (
                              <>
                                <Ban className="size-3.5" /> Block
                              </>
                            )}
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-destructive gap-1"
                            disabled={saving}
                            onClick={async () => {
                              if (!confirm("Permanently remove this enrollment?")) return;
                              setSaving(true);
                              try {
                                await removeEnrollment(supabase, row.id);
                                toast.success("Enrollment removed.");
                                await loadAll();
                              } catch (err) {
                                toast.error(err instanceof Error ? err.message : "Could not remove enrollment.");
                              } finally {
                                setSaving(false);
                              }
                            }}
                          >
                            <Trash2 className="size-3.5" /> Remove
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>

        <TabsContent value="leads" className="mt-6 space-y-4">
          <div className="flex items-center justify-between gap-3">
            <h3 className="font-black text-slate-800">Course Leads ({leads.length})</h3>
            <Button
              className="rounded-xl font-bold gap-2"
              onClick={() => {
                setLeadForm({ name: "", email: "", phone: "", status: "new", notes: "", course_id: null });
                setLeadDialogOpen(true);
              }}
            >
              <Plus className="size-4" /> Add Lead
            </Button>
          </div>
          <Card className="rounded-2xl border-slate-200 overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Contact</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Course</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {leads.length === 0 ? (
                  <EmptyTableRow colSpan={6} />
                ) : (
                  leads.map((lead) => (
                    <TableRow key={lead.id}>
                      <TableCell className="font-semibold">{lead.name}</TableCell>
                      <TableCell>
                        <div className="text-sm">{lead.email || "—"}</div>
                        <div className="text-xs text-slate-400">{lead.phone || ""}</div>
                      </TableCell>
                      <TableCell><Badge>{lead.status}</Badge></TableCell>
                      <TableCell>
                        {lead.course?.title ||
                          (lead.course_id ? courseTitleById.get(lead.course_id) : null) ||
                          "—"}
                      </TableCell>
                      <TableCell className="text-sm text-slate-500">
                        {lead.created_at ? new Date(lead.created_at).toLocaleString() : "—"}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button size="sm" variant="ghost" onClick={() => { setLeadForm(lead); setLeadDialogOpen(true); }}>Edit</Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-destructive"
                          onClick={async () => {
                            await deleteLead(supabase, lead.id);
                            await loadAll();
                          }}
                        >
                          Delete
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>

        <TabsContent value="categories" className="mt-6 space-y-4">
          <Card className="rounded-2xl border-slate-200 p-6 space-y-4">
            <h3 className="font-black">{editingCategoryId ? "Edit Category" : "Add Category"}</h3>
            <div className="grid gap-4 md:grid-cols-2">
              <Input placeholder="Name" value={categoryForm.name || ""} onChange={(e) => setCategoryForm((f) => ({ ...f, name: e.target.value }))} />
              <Input placeholder="Slug" value={categoryForm.slug || ""} onChange={(e) => setCategoryForm((f) => ({ ...f, slug: e.target.value }))} />
              <Textarea className="md:col-span-2" placeholder="Description" value={categoryForm.description || ""} onChange={(e) => setCategoryForm((f) => ({ ...f, description: e.target.value }))} />
            </div>
            <Button
              className="rounded-xl font-bold"
              onClick={async () => {
                if (!categoryForm.name?.trim()) return;
                await upsertCategory(supabase, { ...categoryForm, id: editingCategoryId || undefined, name: categoryForm.name });
                setCategoryForm({ name: "", slug: "", description: "", is_active: true, sort_order: 0 });
                setEditingCategoryId(null);
                await loadAll();
                toast.success("Category saved.");
              }}
            >
              Save Category
            </Button>
          </Card>
          <Card className="rounded-2xl border-slate-200 overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Slug</TableHead>
                  <TableHead>Active</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {categories.map((cat) => (
                  <TableRow key={cat.id}>
                    <TableCell className="font-semibold">{cat.name}</TableCell>
                    <TableCell>{cat.slug}</TableCell>
                    <TableCell>
                      <Switch checked={cat.is_active} onCheckedChange={(v) => void toggleCategoryActive(supabase, cat.id, v).then(loadAll)} />
                    </TableCell>
                    <TableCell className="text-right">
                      <Button size="sm" variant="ghost" onClick={() => { setCategoryForm(cat); setEditingCategoryId(cat.id); }}>Edit</Button>
                      <Button size="sm" variant="ghost" className="text-destructive" onClick={async () => { await deleteCategory(supabase, cat.id); await loadAll(); }}>Delete</Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>

        <TabsContent value="reviews" className="mt-6">
          <Card className="rounded-2xl border-slate-200 overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Course</TableHead>
                  <TableHead>Rating</TableHead>
                  <TableHead>Comment</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {reviews.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell>{r.course?.title || r.course_id}</TableCell>
                    <TableCell>{r.rating}/5</TableCell>
                    <TableCell className="max-w-xs truncate">{r.comment}</TableCell>
                    <TableCell><Badge>{r.status}</Badge></TableCell>
                    <TableCell className="text-right space-x-1">
                      {r.status !== "approved" ? (
                        <Button size="sm" variant="outline" onClick={async () => { await setReviewStatus(supabase, r.id, "approved"); await loadAll(); }}>Approve</Button>
                      ) : null}
                      {r.status !== "rejected" ? (
                        <Button size="sm" variant="outline" onClick={async () => { await setReviewStatus(supabase, r.id, "rejected"); await loadAll(); }}>Reject</Button>
                      ) : null}
                      <Button size="sm" variant="ghost" className="text-destructive" onClick={async () => { await deleteReview(supabase, r.id); await loadAll(); }}>Delete</Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>

        <TabsContent value="certificates" className="mt-6 space-y-4">
          <CompletedEnrollmentsIssue onIssued={loadAll} />
          <Card className="rounded-2xl border-slate-200 overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Code</TableHead>
                  <TableHead>Issued</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {certificates.map((c) => (
                  <TableRow key={String(c.id)}>
                    <TableCell className="font-mono">{String(c.certificate_code)}</TableCell>
                    <TableCell>{c.issued_at ? new Date(String(c.issued_at)).toLocaleDateString() : "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>

        <TabsContent value="settings" className="mt-6">
          <Card className="max-w-lg rounded-2xl border-slate-200 p-6 space-y-4">
            <h3 className="flex items-center gap-2 font-black"><Settings className="size-5" /> Course Settings</h3>
            {settings ? (
              <>
                <div className="space-y-2">
                  <Label>Currency</Label>
                  <Input value={settings.currency} onChange={(e) => setSettings({ ...settings, currency: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>Default Instructor</Label>
                  <Input value={settings.default_instructor || ""} onChange={(e) => setSettings({ ...settings, default_instructor: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>Default Thumbnail URL</Label>
                  <Input value={settings.default_thumbnail_url || ""} onChange={(e) => setSettings({ ...settings, default_thumbnail_url: e.target.value })} />
                </div>
                <Button
                  className="rounded-xl font-bold"
                  onClick={async () => {
                    await updateCourseSettings(supabase, settings);
                    toast.success("Settings saved.");
                  }}
                >
                  Save Settings
                </Button>
              </>
            ) : null}
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={!!viewEnrollment} onOpenChange={(open) => !open && setViewEnrollment(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Enrollment details</DialogTitle>
            <DialogDescription>View student enrollment information.</DialogDescription>
          </DialogHeader>
          {viewEnrollment ? (
            <div className="space-y-3 text-sm">
              <div className="grid grid-cols-3 gap-2">
                <span className="text-slate-500">Student</span>
                <span className="col-span-2 font-semibold">{viewEnrollment.student_name || "—"}</span>
                <span className="text-slate-500">Email</span>
                <span className="col-span-2">{viewEnrollment.student_email || "—"}</span>
                <span className="text-slate-500">Phone</span>
                <span className="col-span-2">{viewEnrollment.student_phone || "—"}</span>
                <span className="text-slate-500">College</span>
                <span className="col-span-2">{viewEnrollment.student_college || "—"}</span>
                <span className="text-slate-500">Student ID</span>
                <span className="col-span-2 font-mono text-xs break-all">{viewEnrollment.student_id}</span>
                <span className="text-slate-500">Course</span>
                <span className="col-span-2 font-semibold">
                  {viewEnrollment.course?.title ||
                    courseTitleById.get(viewEnrollment.course_id) ||
                    "—"}
                </span>
                <span className="text-slate-500">Status</span>
                <span className="col-span-2 capitalize">{enrollmentStatusLabel(viewEnrollment.status)}</span>
                <span className="text-slate-500">Progress</span>
                <span className="col-span-2">{Math.round(Number(viewEnrollment.progress_percent) || 0)}%</span>
                <span className="text-slate-500">Enrolled</span>
                <span className="col-span-2">
                  {viewEnrollment.enrolled_at
                    ? new Date(viewEnrollment.enrolled_at).toLocaleString()
                    : "—"}
                </span>
                <span className="text-slate-500">Completed</span>
                <span className="col-span-2">
                  {viewEnrollment.completed_at
                    ? new Date(viewEnrollment.completed_at).toLocaleString()
                    : "—"}
                </span>
                <span className="text-slate-500">Enrollment ID</span>
                <span className="col-span-2 font-mono text-xs break-all">{viewEnrollment.id}</span>
              </div>
            </div>
          ) : null}
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setViewEnrollment(null)}>
              Close
            </Button>
            {viewEnrollment ? (
              <Button
                onClick={() => {
                  openEditEnrollment(viewEnrollment);
                  setViewEnrollment(null);
                }}
              >
                Update
              </Button>
            ) : null}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!editEnrollment} onOpenChange={(open) => !open && setEditEnrollment(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Update enrollment</DialogTitle>
            <DialogDescription>
              Change course, status, or progress for{" "}
              {editEnrollment?.student_email || editEnrollment?.student_name || "this student"}.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-2">
              <Label>Course</Label>
              <Select
                value={editEnrollmentForm.course_id}
                onValueChange={(v) => setEditEnrollmentForm((f) => ({ ...f, course_id: v }))}
              >
                <SelectTrigger><SelectValue placeholder="Select course" /></SelectTrigger>
                <SelectContent>
                  {courses.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.title}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Status</Label>
              <Select
                value={editEnrollmentForm.status}
                onValueChange={(v) =>
                  setEditEnrollmentForm((f) => ({ ...f, status: v as Enrollment["status"] }))
                }
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                  <SelectItem value="cancelled">Blocked</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Progress (%)</Label>
              <Input
                type="number"
                min={0}
                max={100}
                value={editEnrollmentForm.progress_percent}
                onChange={(e) =>
                  setEditEnrollmentForm((f) => ({
                    ...f,
                    progress_percent: Number(e.target.value) || 0,
                  }))
                }
              />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setEditEnrollment(null)}>
              Cancel
            </Button>
            <Button disabled={saving} onClick={() => void handleUpdateEnrollment()}>
              {saving ? <Loader2 className="size-4 animate-spin" /> : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={leadDialogOpen} onOpenChange={setLeadDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{leadForm.id ? "Edit Lead" : "Add Lead"}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <Input placeholder="Name" value={leadForm.name || ""} onChange={(e) => setLeadForm((f) => ({ ...f, name: e.target.value }))} />
            <Input placeholder="Email" value={leadForm.email || ""} onChange={(e) => setLeadForm((f) => ({ ...f, email: e.target.value }))} />
            <Input placeholder="Phone" value={leadForm.phone || ""} onChange={(e) => setLeadForm((f) => ({ ...f, phone: e.target.value }))} />
            <Select
              value={leadForm.course_id || "none"}
              onValueChange={(v) => setLeadForm((f) => ({ ...f, course_id: v === "none" ? null : v }))}
            >
              <SelectTrigger><SelectValue placeholder="Course (optional)" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No course</SelectItem>
                {courses.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.title}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={leadForm.status || "new"} onValueChange={(v) => setLeadForm((f) => ({ ...f, status: v as Lead["status"] }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {["new", "contacted", "qualified", "converted", "lost"].map((s) => (
                  <SelectItem key={s} value={s}>{s}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Textarea placeholder="Notes" value={leadForm.notes || ""} onChange={(e) => setLeadForm((f) => ({ ...f, notes: e.target.value }))} />
          </div>
          <DialogFooter>
            <Button
              onClick={async () => {
                if (!leadForm.name?.trim()) return;
                await upsertLead(supabase, { ...leadForm, name: leadForm.name });
                setLeadDialogOpen(false);
                await loadAll();
                toast.success("Lead saved.");
              }}
            >
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function CompletedEnrollmentsIssue({ onIssued }: { onIssued: () => Promise<void> }) {
  const [enrollments, setEnrollments] = useState<Awaited<ReturnType<typeof listEnrollments>>>([]);
  useEffect(() => {
    void listEnrollments(supabase, { status: "completed" }).then(setEnrollments);
  }, []);
  return (
    <Card className="rounded-2xl border-slate-200 p-4">
      <p className="mb-3 text-sm font-semibold text-slate-600">Issue certificate for completed enrollment</p>
      <div className="flex flex-wrap gap-2">
        {enrollments.slice(0, 10).map((e) => (
          <Button
            key={e.id}
            size="sm"
            variant="outline"
            onClick={async () => {
              const { data: userData } = await supabase.auth.getUser();
              if (!userData.user) return;
              await issueCourseCertificate(supabase, e.id, userData.user.id);
              toast.success("Certificate issued.");
              await onIssued();
            }}
          >
            {e.course?.title || e.id.slice(0, 8)}
          </Button>
        ))}
      </div>
    </Card>
  );
}
