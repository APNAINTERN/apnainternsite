import type { SupabaseClient } from "@supabase/supabase-js";
import { publicStorageObjectUrl, resolveStorageUrl } from "@/lib/storageUrl";

const BUCKET = "logos";
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

export type CourseDifficulty = "beginner" | "intermediate" | "advanced";
export type CourseStatus = "draft" | "published" | "private";
export type EnrollmentStatus = "active" | "completed" | "cancelled";
export type ReviewStatus = "pending" | "approved" | "rejected";
export type LeadStatus = "new" | "contacted" | "qualified" | "converted" | "lost";

export type Category = {
  id: string;
  name: string;
  slug: string;
  description?: string | null;
  is_active: boolean;
  sort_order: number;
  created_at?: string;
  updated_at?: string;
};

export type Course = {
  id: string;
  title: string;
  slug: string;
  category_id?: string | null;
  subcategory?: string | null;
  instructor_name?: string | null;
  instructor_id?: string | null;
  thumbnail_url?: string | null;
  banner_url?: string | null;
  intro_video_url?: string | null;
  short_description?: string | null;
  full_description?: string | null;
  original_price_paise: number;
  discount_price_paise: number;
  is_free: boolean;
  duration_text?: string | null;
  language: string;
  difficulty?: CourseDifficulty | null;
  status: CourseStatus;
  is_featured: boolean;
  meta_title?: string | null;
  meta_description?: string | null;
  meta_keywords?: string | null;
  rating_avg: number;
  rating_count: number;
  students_count: number;
  lessons_count: number;
  modules_count: number;
  created_by?: string | null;
  published_at?: string | null;
  created_at?: string;
  updated_at?: string;
  category?: Category | null;
};

export type Module = {
  id: string;
  course_id: string;
  title: string;
  sort_order: number;
  lessons?: Lesson[];
};

export type Lesson = {
  id: string;
  module_id: string;
  title: string;
  video_url?: string | null;
  pdf_path?: string | null;
  pdf_url?: string | null;
  notes?: string | null;
  quiz_json?: Record<string, unknown> | null;
  assignment_text?: string | null;
  duration_minutes: number;
  sort_order: number;
};

export type ListItem = { id?: string; body: string; sort_order: number };

export type Enrollment = {
  id: string;
  course_id: string;
  student_id: string;
  status: EnrollmentStatus;
  progress_percent: number;
  enrolled_at: string;
  enrolled_by?: string | null;
  completed_at?: string | null;
  course?: Course | null;
  student_email?: string | null;
  student_name?: string | null;
  student_phone?: string | null;
  student_college?: string | null;
};

export type Review = {
  id: string;
  course_id: string;
  student_id: string;
  rating: number;
  comment?: string | null;
  status: ReviewStatus;
  created_at: string;
  course?: Course | null;
};

export type Lead = {
  id: string;
  name: string;
  phone?: string | null;
  email?: string | null;
  course_id?: string | null;
  status: LeadStatus;
  assigned_staff_id?: string | null;
  follow_up_date?: string | null;
  notes?: string | null;
  created_at: string;
  updated_at?: string;
  course?: Course | null;
};

export type CourseSettings = {
  id: number;
  currency: string;
  default_instructor?: string | null;
  default_thumbnail_url?: string | null;
  settings: Record<string, unknown>;
  updated_at?: string;
};

export type CourseDetail = Course & {
  modules: Module[];
  learning_points: ListItem[];
  requirements: ListItem[];
  includes: ListItem[];
  target_audience: ListItem[];
  reviews: Review[];
};

export type CourseListFilters = {
  search?: string;
  category?: string;
  status?: CourseStatus | "all";
  featured?: boolean;
  sort?: "newest" | "popular" | "rating" | "price_low" | "price_high" | "title";
  limit?: number;
};

export type CourseDashboardStats = {
  totalCourses: number;
  publishedCourses: number;
  draftCourses: number;
  totalEnrollments: number;
  activeEnrollments: number;
  completedEnrollments: number;
  totalLeads: number;
  newLeads: number;
  pendingReviews: number;
  certificatesIssued: number;
};

function mapCourse(row: Record<string, unknown>): Course {
  const catRaw = row.category ?? row.course_categories;
  let category: Category | null = null;
  if (catRaw && typeof catRaw === "object" && !Array.isArray(catRaw)) {
    category = mapCategory(catRaw as Record<string, unknown>);
  } else if (Array.isArray(catRaw) && catRaw[0]) {
    category = mapCategory(catRaw[0] as Record<string, unknown>);
  }
  return {
    id: String(row.id),
    title: String(row.title || ""),
    slug: String(row.slug || ""),
    category_id: row.category_id ? String(row.category_id) : null,
    subcategory: (row.subcategory as string) || null,
    instructor_name: (row.instructor_name as string) || null,
    instructor_id: row.instructor_id ? String(row.instructor_id) : null,
    thumbnail_url: resolveImageUrl(row.thumbnail_url as string | null),
    banner_url: resolveImageUrl(row.banner_url as string | null),
    intro_video_url: (row.intro_video_url as string) || null,
    short_description: (row.short_description as string) || null,
    full_description: (row.full_description as string) || null,
    original_price_paise: Number(row.original_price_paise ?? 0),
    discount_price_paise: Number(row.discount_price_paise ?? 0),
    is_free: Boolean(row.is_free),
    duration_text: (row.duration_text as string) || null,
    language: String(row.language || "English"),
    difficulty: (row.difficulty as CourseDifficulty) || null,
    status: (row.status as CourseStatus) || "draft",
    is_featured: Boolean(row.is_featured),
    meta_title: (row.meta_title as string) || null,
    meta_description: (row.meta_description as string) || null,
    meta_keywords: (row.meta_keywords as string) || null,
    rating_avg: Number(row.rating_avg ?? 0),
    rating_count: Number(row.rating_count ?? 0),
    students_count: Number(row.students_count ?? 0),
    lessons_count: Number(row.lessons_count ?? 0),
    modules_count: Number(row.modules_count ?? 0),
    created_by: row.created_by ? String(row.created_by) : null,
    published_at: (row.published_at as string) || null,
    created_at: (row.created_at as string) || undefined,
    updated_at: (row.updated_at as string) || undefined,
    category,
  };
}

function mapCategory(row: Record<string, unknown>): Category {
  return {
    id: String(row.id),
    name: String(row.name || ""),
    slug: String(row.slug || ""),
    description: (row.description as string) || null,
    is_active: row.is_active !== false,
    sort_order: Number(row.sort_order ?? 0),
    created_at: (row.created_at as string) || undefined,
    updated_at: (row.updated_at as string) || undefined,
  };
}

function mapLesson(row: Record<string, unknown>): Lesson {
  const pdfPath = (row.pdf_path as string) || null;
  const pdfUrlRaw = (row.pdf_url as string) || null;
  const pdfUrl = pdfPath
    ? publicStorageObjectUrl(BUCKET, pdfPath) || resolveStorageUrl(pdfUrlRaw || "") || pdfUrlRaw
    : resolveStorageUrl(pdfUrlRaw || "") || pdfUrlRaw;
  return {
    id: String(row.id),
    module_id: String(row.module_id),
    title: String(row.title || ""),
    video_url: (row.video_url as string) || null,
    pdf_path: pdfPath,
    pdf_url: pdfUrl,
    notes: (row.notes as string) || null,
    quiz_json: (row.quiz_json as Record<string, unknown>) || null,
    assignment_text: (row.assignment_text as string) || null,
    duration_minutes: Number(row.duration_minutes ?? 0),
    sort_order: Number(row.sort_order ?? 0),
  };
}

function mapModule(row: Record<string, unknown>): Module {
  const lessonsRaw = row.lessons ?? row.course_lessons;
  const lessons = Array.isArray(lessonsRaw)
    ? lessonsRaw.map((l) => mapLesson(l as Record<string, unknown>)).sort((a, b) => a.sort_order - b.sort_order)
    : undefined;
  return {
    id: String(row.id),
    course_id: String(row.course_id),
    title: String(row.title || ""),
    sort_order: Number(row.sort_order ?? 0),
    lessons,
  };
}

function mapEnrollment(row: Record<string, unknown>): Enrollment {
  const courseRaw = row.course ?? row.courses;
  let course: Course | null = null;
  if (courseRaw && typeof courseRaw === "object") {
    course = mapCourse(Array.isArray(courseRaw) ? (courseRaw[0] as Record<string, unknown>) : (courseRaw as Record<string, unknown>));
  }
  return {
    id: String(row.id),
    course_id: String(row.course_id),
    student_id: String(row.student_id),
    status: (row.status as EnrollmentStatus) || "active",
    progress_percent: Number(row.progress_percent ?? 0),
    enrolled_at: String(row.enrolled_at || ""),
    enrolled_by: row.enrolled_by ? String(row.enrolled_by) : null,
    completed_at: (row.completed_at as string) || null,
    course,
    student_email: row.student_email != null ? String(row.student_email) : null,
    student_name: row.student_name != null ? String(row.student_name) : null,
    student_phone: row.student_phone != null ? String(row.student_phone) : null,
    student_college: row.student_college != null ? String(row.student_college) : null,
  };
}

/** AWS REST shim strips PostgREST embeds — hydrate course + student rows client-side. */
async function enrichEnrollments(
  client: SupabaseClient,
  rows: Enrollment[]
): Promise<Enrollment[]> {
  if (!rows.length) return rows;

  const courseIds = [...new Set(rows.map((r) => r.course_id).filter(Boolean))];
  const studentIds = [...new Set(rows.map((r) => r.student_id).filter(Boolean))];

  const courseById = new Map<string, Course>();
  if (courseIds.length) {
    const { data: courses } = await client
      .from("courses")
      .select("*")
      .in("id", courseIds);
    for (const c of (courses || []) as Record<string, unknown>[]) {
      const mapped = mapCourse(c);
      courseById.set(mapped.id, mapped);
    }
  }

  const studentById = new Map<
    string,
    { email?: string | null; name?: string | null; phone?: string | null; college?: string | null }
  >();
  if (studentIds.length) {
    // students.id is text; course_enrollments.student_id is uuid — compare as text.
    const { data: students } = await client
      .from("students")
      .select("id, email, full_name, contact_number, college_name")
      .in("id", studentIds);
    for (const s of (students || []) as Record<string, unknown>[]) {
      studentById.set(String(s.id), {
        email: s.email != null ? String(s.email) : null,
        name: s.full_name != null ? String(s.full_name) : null,
        phone: s.contact_number != null ? String(s.contact_number) : null,
        college: s.college_name != null ? String(s.college_name) : null,
      });
    }
  }

  return rows.map((row) => {
    const student = studentById.get(row.student_id);
    return {
      ...row,
      course: row.course || courseById.get(row.course_id) || null,
      student_email: row.student_email || student?.email || null,
      student_name: row.student_name || student?.name || null,
      student_phone: row.student_phone || student?.phone || null,
      student_college: row.student_college || student?.college || null,
    };
  });
}

async function enrichLeads(client: SupabaseClient, rows: Lead[]): Promise<Lead[]> {
  if (!rows.length) return rows;
  const courseIds = [...new Set(rows.map((r) => r.course_id).filter(Boolean) as string[])];
  if (!courseIds.length) return rows;

  const courseById = new Map<string, Course>();
  const { data: courses } = await client.from("courses").select("*").in("id", courseIds);
  for (const c of (courses || []) as Record<string, unknown>[]) {
    const mapped = mapCourse(c);
    courseById.set(mapped.id, mapped);
  }

  return rows.map((row) => ({
    ...row,
    course: row.course || (row.course_id ? courseById.get(row.course_id) || null : null),
  }));
}

function mapReview(row: Record<string, unknown>): Review {
  const courseRaw = row.course ?? row.courses;
  let course: Course | null = null;
  if (courseRaw && typeof courseRaw === "object") {
    course = mapCourse(Array.isArray(courseRaw) ? (courseRaw[0] as Record<string, unknown>) : (courseRaw as Record<string, unknown>));
  }
  return {
    id: String(row.id),
    course_id: String(row.course_id),
    student_id: String(row.student_id),
    rating: Number(row.rating ?? 0),
    comment: (row.comment as string) || null,
    status: (row.status as ReviewStatus) || "pending",
    created_at: String(row.created_at || ""),
    course,
  };
}

function mapLead(row: Record<string, unknown>): Lead {
  const courseRaw = row.course ?? row.courses;
  let course: Course | null = null;
  if (courseRaw && typeof courseRaw === "object") {
    course = mapCourse(Array.isArray(courseRaw) ? (courseRaw[0] as Record<string, unknown>) : (courseRaw as Record<string, unknown>));
  }
  return {
    id: String(row.id),
    name: String(row.name || ""),
    phone: (row.phone as string) || null,
    email: (row.email as string) || null,
    course_id: row.course_id ? String(row.course_id) : null,
    status: (row.status as LeadStatus) || "new",
    assigned_staff_id: row.assigned_staff_id ? String(row.assigned_staff_id) : null,
    follow_up_date: (row.follow_up_date as string) || null,
    notes: (row.notes as string) || null,
    created_at: String(row.created_at || ""),
    updated_at: (row.updated_at as string) || undefined,
    course,
  };
}

function resolveImageUrl(url: string | null | undefined): string | null {
  if (!url?.trim()) return null;
  return resolveStorageUrl(url) || url;
}

export function slugify(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .replace(/[\s_]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

export function formatCoursePrice(paise: number, currency = "INR"): string {
  if (paise <= 0) return "Free";
  const rupees = paise / 100;
  if (currency === "INR") {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
      maximumFractionDigits: 0,
    }).format(rupees);
  }
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(rupees / 100);
}

export function effectiveCoursePrice(course: Pick<Course, "is_free" | "discount_price_paise" | "original_price_paise">): number {
  if (course.is_free) return 0;
  return course.discount_price_paise > 0 ? course.discount_price_paise : course.original_price_paise;
}

// ── Categories ───────────────────────────────────────────────────────────────

export async function listCategories(client: SupabaseClient, activeOnly = false): Promise<Category[]> {
  let q = client.from("course_categories").select("*").order("sort_order", { ascending: true });
  if (activeOnly) q = q.eq("is_active", true);
  const { data, error } = await q;
  if (error) throw error;
  return ((data || []) as Record<string, unknown>[]).map(mapCategory);
}

export async function upsertCategory(
  client: SupabaseClient,
  input: Partial<Category> & { name: string; slug?: string }
): Promise<Category> {
  const slug = input.slug?.trim() || slugify(input.name);
  const payload = {
    name: input.name.trim(),
    slug,
    description: input.description?.trim() || null,
    is_active: input.is_active !== false,
    sort_order: input.sort_order ?? 0,
    updated_at: new Date().toISOString(),
  };
  const { data, error } = input.id
    ? await client.from("course_categories").update(payload).eq("id", input.id).select("*").single()
    : await client.from("course_categories").insert(payload).select("*").single();
  if (error) throw error;
  return mapCategory(data as Record<string, unknown>);
}

export async function deleteCategory(client: SupabaseClient, id: string): Promise<void> {
  const { error } = await client.from("course_categories").delete().eq("id", id);
  if (error) throw error;
}

export async function toggleCategoryActive(client: SupabaseClient, id: string, isActive: boolean): Promise<void> {
  const { error } = await client
    .from("course_categories")
    .update({ is_active: isActive, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}

// ── Courses ────────────────────────────────────────────────────────────────────

export async function listCourses(client: SupabaseClient, filters: CourseListFilters = {}): Promise<Course[]> {
  let q = client
    .from("courses")
    .select("*, category:course_categories(*)")
    .order("created_at", { ascending: false });

  if (filters.status && filters.status !== "all") {
    q = q.eq("status", filters.status);
  } else if (!filters.status) {
    q = q.eq("status", "published");
  }

  if (filters.category) q = q.eq("category_id", filters.category);
  if (filters.featured) q = q.eq("is_featured", true);
  if (filters.search?.trim()) {
    const s = `%${filters.search.trim()}%`;
    q = q.or(`title.ilike.${s},short_description.ilike.${s},instructor_name.ilike.${s}`);
  }

  switch (filters.sort) {
    case "popular":
      q = q.order("students_count", { ascending: false });
      break;
    case "rating":
      q = q.order("rating_avg", { ascending: false });
      break;
    case "price_low":
      q = q.order("discount_price_paise", { ascending: true });
      break;
    case "price_high":
      q = q.order("discount_price_paise", { ascending: false });
      break;
    case "title":
      q = q.order("title", { ascending: true });
      break;
    default:
      q = q.order("published_at", { ascending: false, nullsFirst: false });
  }

  if (filters.limit) q = q.limit(filters.limit);

  const { data, error } = await q;
  if (error) throw error;
  return ((data || []) as Record<string, unknown>[]).map(mapCourse);
}

async function fetchCourseRelated(client: SupabaseClient, courseId: string) {
  const [modulesRes, lpRes, reqRes, incRes, audRes, revRes] = await Promise.all([
    client
      .from("course_modules")
      .select("*, lessons:course_lessons(*)")
      .eq("course_id", courseId)
      .order("sort_order", { ascending: true }),
    client.from("course_learning_points").select("*").eq("course_id", courseId).order("sort_order"),
    client.from("course_requirements").select("*").eq("course_id", courseId).order("sort_order"),
    client.from("course_includes").select("*").eq("course_id", courseId).order("sort_order"),
    client.from("course_target_audience").select("*").eq("course_id", courseId).order("sort_order"),
    client
      .from("course_reviews")
      .select("*")
      .eq("course_id", courseId)
      .eq("status", "approved")
      .order("created_at", { ascending: false }),
  ]);

  if (modulesRes.error) throw modulesRes.error;
  if (lpRes.error) throw lpRes.error;
  if (reqRes.error) throw reqRes.error;
  if (incRes.error) throw incRes.error;
  if (audRes.error) throw audRes.error;
  if (revRes.error) throw revRes.error;

  const mapList = (rows: Record<string, unknown>[]) =>
    rows.map((r) => ({ id: String(r.id), body: String(r.body || ""), sort_order: Number(r.sort_order ?? 0) }));

  return {
    modules: ((modulesRes.data || []) as Record<string, unknown>[]).map(mapModule),
    learning_points: mapList((lpRes.data || []) as Record<string, unknown>[]),
    requirements: mapList((reqRes.data || []) as Record<string, unknown>[]),
    includes: mapList((incRes.data || []) as Record<string, unknown>[]),
    target_audience: mapList((audRes.data || []) as Record<string, unknown>[]),
    reviews: ((revRes.data || []) as Record<string, unknown>[]).map(mapReview),
  };
}

export async function getCourseBySlug(client: SupabaseClient, slug: string): Promise<CourseDetail | null> {
  const { data, error } = await client
    .from("courses")
    .select("*, category:course_categories(*)")
    .eq("slug", slug)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const course = mapCourse(data as Record<string, unknown>);
  const related = await fetchCourseRelated(client, course.id);
  return { ...course, ...related };
}

export async function getCourseById(client: SupabaseClient, id: string): Promise<CourseDetail | null> {
  const { data, error } = await client
    .from("courses")
    .select("*, category:course_categories(*)")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const course = mapCourse(data as Record<string, unknown>);
  const related = await fetchCourseRelated(client, course.id);
  return { ...course, ...related };
}

type CourseInput = Partial<Omit<Course, "id" | "category">> & { title: string; slug?: string };

function buildCoursePayload(input: CourseInput, createdBy?: string) {
  const slug = input.slug?.trim() || slugify(input.title);
  return {
    title: input.title.trim(),
    slug,
    category_id: input.category_id || null,
    subcategory: input.subcategory?.trim() || null,
    instructor_name: input.instructor_name?.trim() || null,
    instructor_id: input.instructor_id || null,
    thumbnail_url: input.thumbnail_url || null,
    banner_url: input.banner_url || null,
    intro_video_url: input.intro_video_url?.trim() || null,
    short_description: input.short_description?.trim() || null,
    full_description: input.full_description?.trim() || null,
    original_price_paise: input.original_price_paise ?? 0,
    discount_price_paise: input.discount_price_paise ?? 0,
    is_free: input.is_free ?? false,
    duration_text: input.duration_text?.trim() || null,
    language: input.language?.trim() || "English",
    difficulty: input.difficulty || null,
    status: input.status || "draft",
    is_featured: input.is_featured ?? false,
    meta_title: input.meta_title?.trim() || null,
    meta_description: input.meta_description?.trim() || null,
    meta_keywords: input.meta_keywords?.trim() || null,
    created_by: createdBy || input.created_by || null,
    published_at: input.status === "published" ? input.published_at || new Date().toISOString() : input.published_at || null,
    updated_at: new Date().toISOString(),
  };
}

export async function createCourse(
  client: SupabaseClient,
  input: CourseInput,
  createdBy?: string
): Promise<Course> {
  const payload = buildCoursePayload(input, createdBy);
  const { data, error } = await client.from("courses").insert(payload).select("*, category:course_categories(*)").single();
  if (error) throw error;
  return mapCourse(data as Record<string, unknown>);
}

export async function updateCourse(client: SupabaseClient, id: string, input: CourseInput): Promise<Course> {
  const payload = buildCoursePayload(input);
  const { data, error } = await client
    .from("courses")
    .update(payload)
    .eq("id", id)
    .select("*, category:course_categories(*)")
    .single();
  if (error) throw error;
  return mapCourse(data as Record<string, unknown>);
}

export async function deleteCourse(client: SupabaseClient, id: string): Promise<void> {
  const { error } = await client.from("courses").delete().eq("id", id);
  if (error) throw error;
}

export async function setCourseStatus(client: SupabaseClient, id: string, status: CourseStatus): Promise<void> {
  const patch: Record<string, unknown> = { status, updated_at: new Date().toISOString() };
  if (status === "published") patch.published_at = new Date().toISOString();
  const { error } = await client.from("courses").update(patch).eq("id", id);
  if (error) throw error;
}

export async function duplicateCourse(client: SupabaseClient, id: string, createdBy?: string): Promise<Course> {
  const source = await getCourseById(client, id);
  if (!source) throw new Error("Course not found");
  const newSlug = `${source.slug}-copy-${Date.now().toString(36)}`;
  const created = await createCourse(
    client,
    {
      ...source,
      title: `${source.title} (Copy)`,
      slug: newSlug,
      status: "draft",
      is_featured: false,
      published_at: null,
    },
    createdBy
  );
  await saveCourseLists(client, created.id, {
    learning_points: source.learning_points,
    requirements: source.requirements,
    includes: source.includes,
    target_audience: source.target_audience,
  });
  await saveCourseCurriculum(
    client,
    created.id,
    source.modules.map((m) => ({
      title: m.title,
      sort_order: m.sort_order,
      lessons: (m.lessons || []).map((l) => ({
        title: l.title,
        video_url: l.video_url,
        pdf_path: l.pdf_path,
        pdf_url: l.pdf_url,
        notes: l.notes,
        quiz_json: l.quiz_json,
        assignment_text: l.assignment_text,
        duration_minutes: l.duration_minutes,
        sort_order: l.sort_order,
      })),
    }))
  );
  return created;
}

export async function saveCourseCurriculum(
  client: SupabaseClient,
  courseId: string,
  modules: Array<{
    id?: string;
    title: string;
    sort_order: number;
    lessons: Array<{
      id?: string;
      title: string;
      video_url?: string | null;
      pdf_path?: string | null;
      pdf_url?: string | null;
      notes?: string | null;
      quiz_json?: Record<string, unknown> | null;
      assignment_text?: string | null;
      duration_minutes?: number;
      sort_order: number;
    }>;
  }>
): Promise<void> {
  const { data: existingModules } = await client.from("course_modules").select("id").eq("course_id", courseId);
  const moduleIds = (existingModules || []).map((m) => String(m.id));
  if (moduleIds.length) {
    await client.from("course_lessons").delete().in("module_id", moduleIds);
    await client.from("course_modules").delete().eq("course_id", courseId);
  }

  let totalLessons = 0;
  for (const mod of modules) {
    const { data: modRow, error: modErr } = await client
      .from("course_modules")
      .insert({ course_id: courseId, title: mod.title.trim(), sort_order: mod.sort_order })
      .select("id")
      .single();
    if (modErr) throw modErr;
    const moduleId = String(modRow.id);
    if (mod.lessons.length) {
      const lessonRows = mod.lessons.map((l) => ({
        module_id: moduleId,
        title: l.title.trim(),
        video_url: l.video_url || null,
        pdf_path: l.pdf_path || null,
        pdf_url: l.pdf_url || null,
        notes: l.notes || null,
        quiz_json: l.quiz_json || null,
        assignment_text: l.assignment_text || null,
        duration_minutes: l.duration_minutes ?? 0,
        sort_order: l.sort_order,
      }));
      const { error: lesErr } = await client.from("course_lessons").insert(lessonRows);
      if (lesErr) throw lesErr;
      totalLessons += lessonRows.length;
    }
  }

  await client
    .from("courses")
    .update({
      modules_count: modules.length,
      lessons_count: totalLessons,
      updated_at: new Date().toISOString(),
    })
    .eq("id", courseId);
}

export async function saveCourseLists(
  client: SupabaseClient,
  courseId: string,
  lists: {
    learning_points?: ListItem[];
    requirements?: ListItem[];
    includes?: ListItem[];
    target_audience?: ListItem[];
  }
): Promise<void> {
  const tables: Array<[string, ListItem[] | undefined]> = [
    ["course_learning_points", lists.learning_points],
    ["course_requirements", lists.requirements],
    ["course_includes", lists.includes],
    ["course_target_audience", lists.target_audience],
  ];

  for (const [table, items] of tables) {
    if (items === undefined) continue;
    await client.from(table).delete().eq("course_id", courseId);
    const rows = items
      .filter((i) => i.body.trim())
      .map((i, idx) => ({ course_id: courseId, body: i.body.trim(), sort_order: i.sort_order ?? idx }));
    if (rows.length) {
      const { error } = await client.from(table).insert(rows);
      if (error) throw error;
    }
  }
}

// ── Enrollments ────────────────────────────────────────────────────────────────

export async function enrollStudent(
  client: SupabaseClient,
  courseId: string,
  studentId: string,
  enrolledBy?: string
): Promise<Enrollment> {
  const { data, error } = await client
    .from("course_enrollments")
    .insert({
      course_id: courseId,
      student_id: studentId,
      enrolled_by: enrolledBy || studentId,
      status: "active",
    })
    .select("*")
    .single();
  if (error) throw error;

  const count = await countCourseStudents(client, courseId);
  await client.from("courses").update({ students_count: count }).eq("id", courseId);

  const [enriched] = await enrichEnrollments(client, [mapEnrollment(data as Record<string, unknown>)]);
  return enriched;
}

async function countCourseStudents(client: SupabaseClient, courseId: string): Promise<number> {
  const { count } = await client
    .from("course_enrollments")
    .select("*", { count: "exact", head: true })
    .eq("course_id", courseId)
    .neq("status", "cancelled");
  return count ?? 0;
}

export async function removeEnrollment(client: SupabaseClient, enrollmentId: string): Promise<void> {
  const { data: row } = await client.from("course_enrollments").select("course_id").eq("id", enrollmentId).maybeSingle();
  const { error } = await client.from("course_enrollments").delete().eq("id", enrollmentId);
  if (error) throw error;
  if (row?.course_id) {
    const count = await countCourseStudents(client, String(row.course_id));
    await client.from("courses").update({ students_count: count }).eq("id", row.course_id);
  }
}

export async function updateEnrollment(
  client: SupabaseClient,
  enrollmentId: string,
  patch: {
    course_id?: string;
    status?: EnrollmentStatus;
    progress_percent?: number;
  }
): Promise<Enrollment> {
  const { data: existing, error: existingErr } = await client
    .from("course_enrollments")
    .select("*")
    .eq("id", enrollmentId)
    .maybeSingle();
  if (existingErr) throw existingErr;
  if (!existing) throw new Error("Enrollment not found.");

  const prevCourseId = String((existing as { course_id: string }).course_id);
  const nextStatus = patch.status ?? (existing as { status: EnrollmentStatus }).status;
  const progress =
    patch.progress_percent != null
      ? Math.max(0, Math.min(100, Math.round(Number(patch.progress_percent))))
      : Number((existing as { progress_percent?: number }).progress_percent ?? 0);

  const payload: Record<string, unknown> = {
    status: nextStatus,
    progress_percent: progress,
  };
  if (patch.course_id) payload.course_id = patch.course_id;
  if (nextStatus === "completed") {
    payload.completed_at =
      (existing as { completed_at?: string | null }).completed_at || new Date().toISOString();
    if (patch.progress_percent == null && progress < 100) payload.progress_percent = 100;
  } else if (nextStatus === "active" || nextStatus === "cancelled") {
    payload.completed_at = null;
  }

  const { data, error } = await client
    .from("course_enrollments")
    .update(payload)
    .eq("id", enrollmentId)
    .select("*")
    .single();
  if (error) throw error;

  const nextCourseId = String((data as { course_id: string }).course_id);
  const countPrev = await countCourseStudents(client, prevCourseId);
  await client.from("courses").update({ students_count: countPrev }).eq("id", prevCourseId);
  if (nextCourseId !== prevCourseId) {
    const countNext = await countCourseStudents(client, nextCourseId);
    await client.from("courses").update({ students_count: countNext }).eq("id", nextCourseId);
  }

  const [enriched] = await enrichEnrollments(client, [mapEnrollment(data as Record<string, unknown>)]);
  return enriched;
}

/** Block = cancelled (student loses course access). Unblock = active. */
export async function setEnrollmentBlocked(
  client: SupabaseClient,
  enrollmentId: string,
  blocked: boolean
): Promise<Enrollment> {
  return updateEnrollment(client, enrollmentId, {
    status: blocked ? "cancelled" : "active",
  });
}

export async function listEnrollments(
  client: SupabaseClient,
  opts?: { courseId?: string; status?: EnrollmentStatus | "all" }
): Promise<Enrollment[]> {
  // Plain select — AWS REST shim ignores PostgREST relation embeds.
  let q = client.from("course_enrollments").select("*").order("enrolled_at", { ascending: false });
  if (opts?.courseId) q = q.eq("course_id", opts.courseId);
  if (opts?.status && opts.status !== "all") q = q.eq("status", opts.status);
  const { data, error } = await q;
  if (error) throw error;
  const mapped = ((data || []) as Record<string, unknown>[]).map(mapEnrollment);
  return enrichEnrollments(client, mapped);
}

export async function listStudentEnrollments(client: SupabaseClient, studentId: string): Promise<Enrollment[]> {
  const { data, error } = await client
    .from("course_enrollments")
    .select("*")
    .eq("student_id", studentId)
    .neq("status", "cancelled")
    .order("enrolled_at", { ascending: false });
  if (error) throw error;
  const mapped = ((data || []) as Record<string, unknown>[]).map(mapEnrollment);
  return enrichEnrollments(client, mapped);
}

// ── Leads ──────────────────────────────────────────────────────────────────────

export async function listLeads(client: SupabaseClient): Promise<Lead[]> {
  const { data, error } = await client
    .from("course_leads")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw error;
  const mapped = ((data || []) as Record<string, unknown>[]).map(mapLead);
  return enrichLeads(client, mapped);
}

export async function upsertLead(client: SupabaseClient, input: Partial<Lead> & { name: string }): Promise<Lead> {
  const payload = {
    name: input.name.trim(),
    phone: input.phone?.trim() || null,
    email: input.email?.trim() || null,
    course_id: input.course_id || null,
    status: input.status || "new",
    assigned_staff_id: input.assigned_staff_id || null,
    follow_up_date: input.follow_up_date || null,
    notes: input.notes?.trim() || null,
    updated_at: new Date().toISOString(),
  };
  const { data, error } = input.id
    ? await client.from("course_leads").update(payload).eq("id", input.id).select("*").single()
    : await client.from("course_leads").insert(payload).select("*").single();
  if (error) throw error;
  const [enriched] = await enrichLeads(client, [mapLead(data as Record<string, unknown>)]);
  return enriched;
}

export async function deleteLead(client: SupabaseClient, id: string): Promise<void> {
  const { error } = await client.from("course_leads").delete().eq("id", id);
  if (error) throw error;
}

// ── Reviews ────────────────────────────────────────────────────────────────────

export async function listReviews(client: SupabaseClient, status?: ReviewStatus | "all"): Promise<Review[]> {
  let q = client
    .from("course_reviews")
    .select("*, course:courses(title, slug)")
    .order("created_at", { ascending: false });
  if (status && status !== "all") q = q.eq("status", status);
  const { data, error } = await q;
  if (error) throw error;
  return ((data || []) as Record<string, unknown>[]).map(mapReview);
}

export async function setReviewStatus(client: SupabaseClient, id: string, status: ReviewStatus): Promise<void> {
  const { error } = await client.from("course_reviews").update({ status }).eq("id", id);
  if (error) throw error;
  const { data: review } = await client.from("course_reviews").select("course_id, rating, status").eq("id", id).maybeSingle();
  if (review?.course_id) await refreshCourseRating(client, String(review.course_id));
}

export async function deleteReview(client: SupabaseClient, id: string): Promise<void> {
  const { data: review } = await client.from("course_reviews").select("course_id").eq("id", id).maybeSingle();
  const { error } = await client.from("course_reviews").delete().eq("id", id);
  if (error) throw error;
  if (review?.course_id) await refreshCourseRating(client, String(review.course_id));
}

async function refreshCourseRating(client: SupabaseClient, courseId: string): Promise<void> {
  const { data } = await client
    .from("course_reviews")
    .select("rating")
    .eq("course_id", courseId)
    .eq("status", "approved");
  const ratings = (data || []).map((r) => Number(r.rating));
  const count = ratings.length;
  const avg = count ? ratings.reduce((a, b) => a + b, 0) / count : 0;
  await client.from("courses").update({ rating_avg: avg, rating_count: count }).eq("id", courseId);
}

// ── Wishlist ───────────────────────────────────────────────────────────────────

export async function addToWishlist(client: SupabaseClient, studentId: string, courseId: string): Promise<void> {
  const { error } = await client.from("course_wishlist").upsert({ student_id: studentId, course_id: courseId });
  if (error) throw error;
}

export async function removeFromWishlist(client: SupabaseClient, studentId: string, courseId: string): Promise<void> {
  const { error } = await client.from("course_wishlist").delete().eq("student_id", studentId).eq("course_id", courseId);
  if (error) throw error;
}

export async function listWishlist(client: SupabaseClient, studentId: string): Promise<Course[]> {
  const { data, error } = await client
    .from("course_wishlist")
    .select("course:courses(*, category:course_categories(*))")
    .eq("student_id", studentId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return ((data || []) as Record<string, unknown>[])
    .map((row) => row.course)
    .filter(Boolean)
    .map((c) => mapCourse(Array.isArray(c) ? (c[0] as Record<string, unknown>) : (c as Record<string, unknown>)));
}

// ── Dashboard & settings ───────────────────────────────────────────────────────

export async function getCourseDashboardStats(client: SupabaseClient): Promise<CourseDashboardStats> {
  async function headCount(
    table: string,
    filters?: Record<string, string>
  ): Promise<number> {
    let q = client.from(table).select("*", { count: "exact", head: true });
    if (filters) {
      for (const [col, val] of Object.entries(filters)) {
        q = q.eq(col, val);
      }
    }
    const { count, error } = await q;
    if (error) throw error;
    return count ?? 0;
  }

  const totalCourses = await headCount("courses");
  const publishedCourses = await headCount("courses", { status: "published" });
  const draftCourses = await headCount("courses", { status: "draft" });
  const totalEnrollments = await headCount("course_enrollments");
  const activeEnrollments = await headCount("course_enrollments", { status: "active" });
  const completedEnrollments = await headCount("course_enrollments", { status: "completed" });
  const totalLeads = await headCount("course_leads");
  const newLeads = await headCount("course_leads", { status: "new" });
  const pendingReviews = await headCount("course_reviews", { status: "pending" });
  const certificatesIssued = await headCount("course_certificates");

  return {
    totalCourses,
    publishedCourses,
    draftCourses,
    totalEnrollments,
    activeEnrollments,
    completedEnrollments,
    totalLeads,
    newLeads,
    pendingReviews,
    certificatesIssued,
  };
}

export async function getCourseSettings(client: SupabaseClient): Promise<CourseSettings> {
  const { data, error } = await client.from("course_settings").select("*").eq("id", 1).maybeSingle();
  if (error) throw error;
  if (!data) {
    return { id: 1, currency: "INR", default_instructor: null, default_thumbnail_url: null, settings: {} };
  }
  return {
    id: 1,
    currency: String(data.currency || "INR"),
    default_instructor: (data.default_instructor as string) || null,
    default_thumbnail_url: resolveImageUrl(data.default_thumbnail_url as string | null),
    settings: (data.settings as Record<string, unknown>) || {},
    updated_at: (data.updated_at as string) || undefined,
  };
}

export async function updateCourseSettings(
  client: SupabaseClient,
  input: Partial<Omit<CourseSettings, "id">>
): Promise<CourseSettings> {
  const payload = {
    currency: input.currency?.trim() || "INR",
    default_instructor: input.default_instructor?.trim() || null,
    default_thumbnail_url: input.default_thumbnail_url || null,
    settings: input.settings || {},
    updated_at: new Date().toISOString(),
  };
  const { data, error } = await client
    .from("course_settings")
    .upsert({ id: 1, ...payload })
    .select("*")
    .single();
  if (error) throw error;
  return {
    id: 1,
    currency: String(data.currency || "INR"),
    default_instructor: (data.default_instructor as string) || null,
    default_thumbnail_url: resolveImageUrl(data.default_thumbnail_url as string | null),
    settings: (data.settings as Record<string, unknown>) || {},
    updated_at: (data.updated_at as string) || undefined,
  };
}

export async function uploadCourseImage(
  client: SupabaseClient,
  file: File,
  folder: string
): Promise<{ path: string; publicUrl: string }> {
  if (file.size > MAX_IMAGE_BYTES) {
    throw new Error("Image must be 5 MB or smaller.");
  }
  const safeName = file.name.replace(/[^\w.\-]+/g, "_");
  const path = `course/${folder}/${Date.now()}-${safeName}`;
  const { error } = await client.storage.from(BUCKET).upload(path, file, {
    upsert: false,
    contentType: file.type || undefined,
  });
  if (error) {
    if (/bucket not found/i.test(error.message)) {
      throw new Error('Storage bucket "logos" is missing.');
    }
    throw error;
  }
  const { data } = client.storage.from(BUCKET).getPublicUrl(path);
  const publicUrl = publicStorageObjectUrl(BUCKET, path) || resolveStorageUrl(data.publicUrl) || data.publicUrl;
  return { path, publicUrl };
}

export async function findStudentUserIdByEmail(client: SupabaseClient, email: string): Promise<string | null> {
  const normalized = email.trim().toLowerCase();
  if (!normalized) return null;
  // students has no user_id column — id is the auth uuid (text).
  const { data, error } = await client
    .from("students")
    .select("id, email")
    .ilike("email", normalized)
    .limit(5);
  if (error) throw error;
  const rows = (data || []) as Array<{ id?: string; email?: string }>;
  const exact =
    rows.find((r) => String(r.email || "").trim().toLowerCase() === normalized) || rows[0];
  return exact?.id ? String(exact.id) : null;
}

export async function issueCourseCertificate(
  client: SupabaseClient,
  enrollmentId: string,
  issuedBy: string
): Promise<{ certificate_code: string }> {
  const code = `CRS-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
  const { error } = await client.from("course_certificates").upsert({
    enrollment_id: enrollmentId,
    certificate_code: code,
    issued_by: issuedBy,
    issued_at: new Date().toISOString(),
    template_snapshot: {},
  });
  if (error) throw error;
  await client
    .from("course_enrollments")
    .update({ status: "completed", completed_at: new Date().toISOString(), progress_percent: 100 })
    .eq("id", enrollmentId);
  return { certificate_code: code };
}

export async function listCourseCertificates(client: SupabaseClient) {
  const { data, error } = await client
    .from("course_certificates")
    .select("*, enrollment:course_enrollments(*, course:courses(title, slug))")
    .order("issued_at", { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function isCourseWishlisted(
  client: SupabaseClient,
  studentId: string,
  courseId: string
): Promise<boolean> {
  const { data } = await client
    .from("course_wishlist")
    .select("id")
    .eq("student_id", studentId)
    .eq("course_id", courseId)
    .maybeSingle();
  return Boolean(data);
}

export async function isStudentEnrolled(
  client: SupabaseClient,
  studentId: string,
  courseId: string
): Promise<Enrollment | null> {
  const { data, error } = await client
    .from("course_enrollments")
    .select("*")
    .eq("student_id", studentId)
    .eq("course_id", courseId)
    .neq("status", "cancelled")
    .maybeSingle();
  if (error) throw error;
  return data ? mapEnrollment(data as Record<string, unknown>) : null;
}
