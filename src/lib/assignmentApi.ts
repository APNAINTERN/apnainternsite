import type { SupabaseClient } from "@supabase/supabase-js";
import {
  ClassTargetFilters,
  describeClassTargets,
  filtersToTargetArrays,
} from "@/lib/classLinkTargeting";

export type AssignmentType = "mcq" | "long_answer" | "file_upload";

export const ASSIGNMENT_UPLOAD_ACCEPT = ".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png";
export const ASSIGNMENT_FILE_ANSWER_KEY = "__file_upload__";
export const ASSIGNMENT_LINKS_MAX = 10;
export const ASSIGNMENT_FILES_MAX = 5;

export type AssignmentFileUploadMeta = {
  path: string;
  name: string;
  content_type: string;
  size: number;
};

export type AssignmentLinkSubmissionMeta = {
  links: string[];
  note?: string;
};

export type AssignmentWorkSubmission = {
  links: string[];
  files: AssignmentFileUploadMeta[];
  note?: string;
};
export type AssignmentQuestionDraft = {
  question_text: string;
  question_type: "mcq" | "long_answer";
  options?: string[];
  correct_option_index?: number;
  marks: number;
  word_limit_min?: number;
  word_limit_max?: number;
};

export type AssignmentRow = {
  id?: string;
  title?: string;
  description?: string | null;
  duration_minutes?: number;
  total_marks?: number;
  passing_marks?: number;
  is_active?: boolean;
  due_at?: string | null;
  assignment_type?: AssignmentType | string | null;
  target_universities?: string[] | null;
  target_colleges?: string[] | null;
  target_domains?: string[] | null;
  recipient_count?: number | null;
  created_at?: string;
  assignment_submissions?: { id: string }[];
};

export type AssignmentQuestionDisplay = {
  id: string;
  question_text: string;
  question_type?: string | null;
  options?: unknown;
  correct_option_index?: number | null;
  marks?: number;
  order_index?: number;
};

export type FormattedAnswerLine = {
  questionNumber: number;
  questionText: string;
  answerText: string;
  questionType: "mcq" | "long_answer" | "file_upload";
  isCorrect?: boolean;
  correctAnswerText?: string;
  filePath?: string;
  fileName?: string;
  links?: string[];
};

function normalizeLinkList(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => String(item ?? "").trim())
    .filter(Boolean);
}

export function normalizeExternalUrl(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  try {
    const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
    const url = new URL(withProtocol);
    if (!["http:", "https:"].includes(url.protocol)) return null;
    return url.toString();
  } catch {
    return null;
  }
}

export function validateAssignmentLinks(links: string[], required = true): string | null {
  const cleaned = links.map((l) => l.trim()).filter(Boolean);
  if (cleaned.length === 0) {
    return required ? "Add at least one link to your work (Google Drive, GitHub, Figma, etc.)." : null;
  }
  if (cleaned.length > ASSIGNMENT_LINKS_MAX) {
    return `You can submit up to ${ASSIGNMENT_LINKS_MAX} links.`;
  }
  for (const link of cleaned) {
    if (!normalizeExternalUrl(link)) {
      return `Invalid link: ${link.slice(0, 60)}${link.length > 60 ? "…" : ""}`;
    }
  }
  return null;
}

function parseFileMeta(raw: unknown): AssignmentFileUploadMeta | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const path = String(o.path || "").trim();
  if (!path) return null;
  return {
    path,
    name: String(o.name || "upload"),
    content_type: String(o.content_type || ""),
    size: Number(o.size || 0),
  };
}

function parseWorkSubmissionEntry(entry: unknown): AssignmentWorkSubmission | null {
  if (!entry || typeof entry !== "object") return null;
  const o = entry as Record<string, unknown>;
  const links = normalizeLinkList(o.links);
  const filesRaw = Array.isArray(o.files) ? o.files : [];
  const files = filesRaw
    .map(parseFileMeta)
    .filter((f): f is AssignmentFileUploadMeta => Boolean(f));
  const legacy = parseFileMeta(entry);
  if (legacy && !files.some((f) => f.path === legacy.path)) {
    files.unshift(legacy);
  }
  const note = typeof o.note === "string" ? o.note.trim() : undefined;
  if (links.length === 0 && files.length === 0 && !note) return null;
  return { links, files, ...(note ? { note } : {}) };
}

export function getWorkSubmissionFromAnswers(raw: unknown): AssignmentWorkSubmission | null {
  const ans = normalizeSubmissionAnswers(raw);
  return parseWorkSubmissionEntry(ans[ASSIGNMENT_FILE_ANSWER_KEY]);
}

export function getFileAttachmentsFromAnswers(raw: unknown): AssignmentFileUploadMeta[] {
  return getWorkSubmissionFromAnswers(raw)?.files ?? [];
}

export function validateWorkSubmission(links: string[], files: File[]): string | null {
  const cleanedLinks = links.map((l) => l.trim()).filter(Boolean);
  if (cleanedLinks.length === 0 && files.length === 0) {
    return "Add at least one link or file attachment before submitting.";
  }
  const linkErr = validateAssignmentLinks(links, false);
  if (linkErr) return linkErr;
  if (files.length > ASSIGNMENT_FILES_MAX) {
    return `You can attach up to ${ASSIGNMENT_FILES_MAX} files.`;
  }
  for (const file of files) {
    const err = validateAssignmentUploadFile(file);
    if (err) return err;
  }
  return null;
}

export function buildWorkSubmissionPayload(
  links: string[],
  files: AssignmentFileUploadMeta[],
  note?: string
): Record<string, unknown> {
  const normalizedLinks = links
    .map((l) => normalizeExternalUrl(l))
    .filter((l): l is string => Boolean(l));
  const payload: Record<string, unknown> = {
    links: normalizedLinks,
    files,
  };
  const trimmedNote = (note || "").trim();
  if (trimmedNote) payload.note = trimmedNote;
  return payload;
}

export function buildLinkSubmissionPayload(
  links: string[],
  note?: string
): AssignmentLinkSubmissionMeta {
  const normalized = links
    .map((l) => normalizeExternalUrl(l))
    .filter((l): l is string => Boolean(l));
  const payload: AssignmentLinkSubmissionMeta = { links: normalized };
  const trimmedNote = (note || "").trim();
  if (trimmedNote) payload.note = trimmedNote;
  return payload;
}

export function getLinkSubmissionFromAnswers(raw: unknown): AssignmentLinkSubmissionMeta | null {
  const work = getWorkSubmissionFromAnswers(raw);
  if (!work || work.links.length === 0) return null;
  return { links: work.links, ...(work.note ? { note: work.note } : {}) };
}

export function getFileUploadFromAnswers(raw: unknown): AssignmentFileUploadMeta | null {
  const files = getFileAttachmentsFromAnswers(raw);
  return files[0] ?? null;
}

export function validateAssignmentUploadFile(file: File): string | null {
  const allowed = ["application/pdf", "image/jpeg", "image/png"];
  const ext = file.name.split(".").pop()?.toLowerCase() || "";
  const extOk = ["pdf", "jpg", "jpeg", "png"].includes(ext);
  if (!allowed.includes(file.type) && !extOk) {
    return "Only PDF, JPG, and PNG files are allowed.";
  }
  return null;
}

export async function uploadStudentAssignmentFiles(
  supabase: SupabaseClient,
  assignmentId: string,
  studentId: string,
  files: File[]
): Promise<AssignmentFileUploadMeta[]> {
  const uploaded: AssignmentFileUploadMeta[] = [];
  for (const file of files) {
    uploaded.push(await uploadStudentAssignmentFile(supabase, assignmentId, studentId, file));
  }
  return uploaded;
}

export async function uploadStudentAssignmentFile(
  supabase: SupabaseClient,
  assignmentId: string,
  studentId: string,
  file: File
): Promise<AssignmentFileUploadMeta> {
  const err = validateAssignmentUploadFile(file);
  if (err) throw new Error(err);

  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const path = `${studentId}/${assignmentId}/${Date.now()}-${safeName}`;
  const { error } = await supabase.storage.from("assignment-uploads").upload(path, file, {
    upsert: false,
    contentType: file.type || undefined,
  });
  if (error) throw error;

  return {
    path,
    name: file.name,
    content_type: file.type,
    size: file.size,
  };
}

export async function createAssignmentFileSignedUrl(
  supabase: SupabaseClient,
  path: string
): Promise<string | null> {
  const { data, error } = await supabase.storage
    .from("assignment-uploads")
    .createSignedUrl(path, 3600);
  if (error) {
    console.warn("[assignment] signed url:", error.message);
    return null;
  }
  return data?.signedUrl ?? null;
}

export function assignmentTypeLabel(type?: string | null): string {
  if (type === "long_answer") return "Long answer";
  if (type === "file_upload") return "File submission";
  return "MCQ";
}

export function parseQuestionOptions(options: unknown): string[] {
  if (Array.isArray(options)) return options.map(String);
  if (typeof options === "string") {
    try {
      const parsed = JSON.parse(options);
      return Array.isArray(parsed) ? parsed.map(String) : [];
    } catch {
      return [];
    }
  }
  return [];
}

export function normalizeSubmissionAnswers(raw: unknown): Record<string, unknown> {
  if (!raw) return {};
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      return typeof parsed === "object" && parsed !== null ? (parsed as Record<string, unknown>) : {};
    } catch {
      return {};
    }
  }
  if (typeof raw === "object" && !Array.isArray(raw)) {
    return raw as Record<string, unknown>;
  }
  return {};
}

/** Turn stored answers JSON into readable lines for admin/student UI. */
export function formatSubmissionAnswersForDisplay(
  questions: AssignmentQuestionDisplay[],
  answers: Record<string, unknown> | null | undefined
): FormattedAnswerLine[] {
  const ans = normalizeSubmissionAnswers(answers);
  const work = getWorkSubmissionFromAnswers(ans);
  if (work) {
    const lines: FormattedAnswerLine[] = [];
    work.links.forEach((link, idx) => {
      lines.push({
        questionNumber: lines.length + 1,
        questionText: idx === 0 ? "Submitted work links" : "Additional link",
        answerText: link,
        questionType: "file_upload",
        links: [link],
      });
    });
    work.files.forEach((file, idx) => {
      lines.push({
        questionNumber: lines.length + 1,
        questionText: idx === 0 ? "File attachments" : "Additional file",
        answerText: file.name,
        questionType: "file_upload",
        filePath: file.path,
        fileName: file.name,
      });
    });
    if (lines.length > 0) return lines;
  }
  const fileUpload = getFileUploadFromAnswers(ans);
  if (fileUpload) {
    return [
      {
        questionNumber: 1,
        questionText: "Uploaded file",
        answerText: fileUpload.name,
        questionType: "file_upload",
        filePath: fileUpload.path,
        fileName: fileUpload.name,
      },
    ];
  }

  const sorted = [...questions].sort(
    (a, b) => (a.order_index ?? 0) - (b.order_index ?? 0)
  );

  if (sorted.length === 0 && Object.keys(ans).length > 0) {
    return Object.entries(ans).map(([key, raw], idx) => {
      if (typeof raw === "number") {
        return {
          questionNumber: idx + 1,
          questionText: `Question (ID: ${key.slice(0, 8)}…)`,
          answerText: `Selected option ${String.fromCharCode(65 + raw)} (choice ${raw + 1})`,
          questionType: "mcq" as const,
        };
      }
      return {
        questionNumber: idx + 1,
        questionText: `Question (ID: ${key.slice(0, 8)}…)`,
        answerText: String(raw ?? "").trim() || "(No answer submitted)",
        questionType: "long_answer" as const,
      };
    });
  }

  return sorted.map((q, idx) => {
    const qType = (q.question_type || "mcq") as "mcq" | "long_answer";
    const raw = ans[q.id];

    if (qType === "long_answer") {
      const text = String(raw ?? "").trim();
      return {
        questionNumber: idx + 1,
        questionText: q.question_text,
        answerText: text || "(No answer submitted)",
        questionType: "long_answer",
      };
    }

    const opts = parseQuestionOptions(q.options);
    const selectedIdx =
      typeof raw === "number" ? raw : Number.parseInt(String(raw ?? ""), 10);
    const validIdx = Number.isFinite(selectedIdx) ? selectedIdx : -1;
    const selected = validIdx >= 0 ? opts[validIdx] : undefined;
    const correctIdx = q.correct_option_index ?? 0;
    const correct = opts[correctIdx];

    return {
      questionNumber: idx + 1,
      questionText: q.question_text,
      answerText: selected
        ? `${String.fromCharCode(65 + validIdx)}. ${selected}`
        : "(Not answered)",
      questionType: "mcq",
      isCorrect: validIdx >= 0 && validIdx === correctIdx,
      correctAnswerText: correct
        ? `${String.fromCharCode(65 + correctIdx)}. ${correct}`
        : undefined,
    };
  });
}

export type StudentAssignmentResult = {
  submission: Record<string, unknown>;
  assignment: Record<string, unknown>;
  questions: AssignmentQuestionDisplay[];
  studentName: string;
};

export async function fetchStudentAssignmentResult(
  supabase: SupabaseClient,
  assignmentId: string,
  studentId: string
): Promise<StudentAssignmentResult | null> {
  const { data: submission, error: subErr } = await supabase
    .from("assignment_submissions")
    .select("*")
    .eq("assignment_id", assignmentId)
    .eq("student_id", studentId)
    .maybeSingle();

  if (subErr) throw subErr;
  if (!submission) return null;

  const { data: assignment, error: assErr } = await supabase
    .from("assignments")
    .select("*")
    .eq("id", assignmentId)
    .maybeSingle();

  if (assErr) throw assErr;
  if (!assignment) return null;

  const { data: questions, error: qErr } = await supabase
    .from("assignment_questions")
    .select("id, question_text, question_type, options, correct_option_index, marks, order_index")
    .eq("assignment_id", assignmentId)
    .order("order_index", { ascending: true });

  if (qErr) throw qErr;

  const { data: student } = await supabase
    .from("students")
    .select("full_name, email")
    .eq("id", studentId)
    .maybeSingle();

  return {
    submission,
    assignment,
    questions: (questions || []) as AssignmentQuestionDisplay[],
    studentName: student?.full_name || student?.email || "Student",
  };
}

export type AssignmentSubmissionRow = {
  id: string;
  student_id: string;
  score: number;
  mcq_score?: number;
  manual_score?: number;
  is_passed: boolean;
  grading_status: string;
  admin_feedback?: string | null;
  answers: Record<string, unknown>;
  submitted_at: string;
  student_name?: string | null;
  student_email?: string | null;
  registration_id?: string | null;
};

export type StudentAssignmentListItem = {
  id: string;
  title: string;
  description: string | null;
  duration_minutes: number;
  total_marks: number;
  passing_marks: number;
  due_at: string | null;
  created_at: string;
  assignment_type?: string | null;
  has_submission: boolean;
  submission_score: number | null;
  submission_passed: boolean | null;
  grading_status: string | null;
};

export function assignmentTargetSummaryShort(a: AssignmentRow): string {
  if (
    !a.target_universities?.length &&
    !a.target_colleges?.length &&
    !a.target_domains?.length
  ) {
    return "All students";
  }
  const parts: string[] = [];
  const u = a.target_universities?.length ?? 0;
  const c = a.target_colleges?.length ?? 0;
  const d = a.target_domains?.length ?? 0;
  if (u) parts.push(`${u} university${u === 1 ? "" : "ies"}`);
  if (c) parts.push(`${c} college${c === 1 ? "" : "s"}`);
  if (d) parts.push(`${d} domain${d === 1 ? "" : "s"}`);
  return parts.join(" · ");
}

export function describeAssignmentTargets(a: AssignmentRow): string {
  return describeClassTargets({
    target_universities: a.target_universities,
    target_colleges: a.target_colleges,
    target_domains: a.target_domains,
    domain_id: null,
    internship_domains: null,
  });
}

export function formatAssignmentError(error: unknown): string {
  if (!error || typeof error !== "object") return "Assignment action failed.";
  const e = error as { message?: string; details?: string; hint?: string; code?: string };
  const parts = [e.message, e.details, e.hint].filter(Boolean);
  const msg = parts.join(" — ") || "Assignment action failed.";
  if (/admin_insert_assignment|admin_update_assignment|admin_delete_assignment|list_assignments_for_student|get_assignment_take_payload|submit_assignment_graded/i.test(msg) || e.code === "PGRST202") {
    return `${msg} Run supabase/hotfix_assignment_management_complete.sql in Supabase SQL Editor, then reload API schema.`;
  }
  return msg;
}

export async function countAssignmentTargets(
  supabase: SupabaseClient,
  filters: ClassTargetFilters
): Promise<number> {
  const t = filtersToTargetArrays(filters);
  const { data, error } = await supabase.rpc("admin_count_assignment_targets", {
    p_universities: t.target_universities,
    p_colleges: t.target_colleges,
    p_domains: t.target_domains,
    p_modes: t.target_modes,
  });
  if (error) throw error;
  return Number(data ?? 0);
}

export async function publishAssignment(
  supabase: SupabaseClient,
  payload: {
    title: string;
    description: string;
    durationMinutes: number;
    passingPercent: number;
    assignmentType?: AssignmentType;
    totalMarksOverride?: number;
    dueAt?: string | null;
    filters: ClassTargetFilters;
    questions: AssignmentQuestionDraft[];
    createdBy?: string | null;
  }
): Promise<string> {
  const targets = filtersToTargetArrays(payload.filters);
  const assignmentType = payload.assignmentType ?? "mcq";
  const totalMarks =
    assignmentType === "file_upload"
      ? payload.totalMarksOverride ?? 100
      : payload.questions.reduce((s, q) => s + (q.marks || 1), 0);
  const passingMarks = Math.ceil((totalMarks * payload.passingPercent) / 100);
  const durationMinutes =
    assignmentType === "file_upload" || assignmentType === "long_answer"
      ? 0
      : payload.durationMinutes;

  const row = {
    title: payload.title.trim(),
    description: payload.description.trim(),
    duration_minutes: durationMinutes,
    total_marks: totalMarks,
    passing_marks: passingMarks,
    is_active: true,
    assignment_type: assignmentType,
    due_at: payload.dueAt || null,
    target_universities: targets.target_universities,
    target_colleges: targets.target_colleges,
    target_domains: targets.target_domains,
    target_modes: targets.target_modes,
    created_by: payload.createdBy ?? null,
  };

  const questions =
    assignmentType === "file_upload"
      ? []
      : payload.questions.map((q, idx) => ({
          question_text: q.question_text,
          question_type: assignmentType === "long_answer" ? "long_answer" : q.question_type,
          options: q.question_type === "mcq" ? q.options || [] : [],
          correct_option_index: q.question_type === "mcq" ? q.correct_option_index ?? 0 : null,
          marks: q.marks,
          order_index: idx,
        }));

  const { data, error } = await supabase.rpc("admin_insert_assignment", {
    p_row: row,
    p_questions: questions,
  });
  if (error) throw error;
  return data as string;
}

export async function updateAssignment(
  supabase: SupabaseClient,
  assignmentId: string,
  payload: {
    title: string;
    description: string;
    durationMinutes: number;
    passingPercent: number;
    assignmentType: AssignmentType;
    totalMarksOverride?: number;
    dueAt?: string | null;
    isActive?: boolean;
    filters: ClassTargetFilters;
    questions: AssignmentQuestionDraft[];
  }
): Promise<void> {
  const targets = filtersToTargetArrays(payload.filters);
  const totalMarks =
    payload.assignmentType === "file_upload"
      ? payload.totalMarksOverride ?? 100
      : payload.questions.reduce((s, q) => s + (q.marks || 1), 0);
  const passingMarks = Math.ceil((totalMarks * payload.passingPercent) / 100);
  const durationMinutes =
    payload.assignmentType === "file_upload" || payload.assignmentType === "long_answer"
      ? 0
      : payload.durationMinutes;

  const row = {
    title: payload.title.trim(),
    description: payload.description.trim(),
    duration_minutes: durationMinutes,
    total_marks: totalMarks,
    passing_marks: passingMarks,
    is_active: payload.isActive ?? true,
    assignment_type: payload.assignmentType,
    due_at: payload.dueAt || null,
    target_universities: targets.target_universities,
    target_colleges: targets.target_colleges,
    target_domains: targets.target_domains,
    target_modes: targets.target_modes,
  };

  const questions =
    payload.assignmentType === "file_upload"
      ? []
      : payload.questions.map((q, idx) => ({
          question_text: q.question_text,
          question_type: payload.assignmentType === "long_answer" ? "long_answer" : q.question_type,
          options: q.question_type === "mcq" ? q.options || [] : [],
          correct_option_index: q.question_type === "mcq" ? q.correct_option_index ?? 0 : null,
          marks: q.marks,
          order_index: idx,
        }));

  const { error } = await supabase.rpc("admin_update_assignment", {
    p_assignment_id: assignmentId,
    p_row: row,
    p_questions: questions,
  });
  if (error) throw error;
}

export async function deleteAssignment(
  supabase: SupabaseClient,
  assignmentId: string
): Promise<void> {
  const { error } = await supabase.rpc("admin_delete_assignment", {
    p_assignment_id: assignmentId,
  });
  if (error) throw error;
}

export async function fetchAdminAssignmentQuestions(
  supabase: SupabaseClient,
  assignmentId: string
): Promise<AssignmentQuestionDisplay[]> {
  const { data, error } = await supabase.rpc("admin_get_assignment_questions", {
    p_assignment_id: assignmentId,
  });
  if (!error && Array.isArray(data)) {
    return data as AssignmentQuestionDisplay[];
  }

  const { data: rows, error: directErr } = await supabase
    .from("assignment_questions")
    .select("id, question_text, question_type, options, correct_option_index, marks, order_index")
    .eq("assignment_id", assignmentId)
    .order("order_index", { ascending: true });

  if (directErr) throw directErr;
  return (rows || []) as AssignmentQuestionDisplay[];
}

export async function fetchAdminAssignmentSubmissions(
  supabase: SupabaseClient,
  assignmentId: string
): Promise<AssignmentSubmissionRow[]> {
  const { data, error } = await supabase.rpc("admin_list_assignment_submissions", {
    p_assignment_id: assignmentId,
  });
  if (error) throw error;
  return (Array.isArray(data) ? data : []) as AssignmentSubmissionRow[];
}

export async function gradeAssignmentSubmission(
  supabase: SupabaseClient,
  submissionId: string,
  manualScore: number,
  feedback: string,
  isPassed?: boolean
) {
  const { error } = await supabase.rpc("admin_grade_assignment_submission", {
    p_submission_id: submissionId,
    p_manual_score: manualScore,
    p_feedback: feedback,
    p_is_passed: isPassed ?? null,
  });
  if (error) throw error;
}

export async function fetchStudentAssignments(
  supabase: SupabaseClient
): Promise<StudentAssignmentListItem[]> {
  const { data, error } = await supabase.rpc("list_assignments_for_student");
  if (!error && Array.isArray(data)) {
    return data as StudentAssignmentListItem[];
  }

  const { data: legacy, error: legacyErr } = await supabase
    .from("assignments")
    .select("*")
    .eq("is_active", true)
    .order("created_at", { ascending: false });
  if (legacyErr) throw legacyErr;
  return (legacy || []).map((a) => ({
    id: a.id,
    title: a.title,
    description: a.description,
    duration_minutes: a.duration_minutes,
    total_marks: a.total_marks,
    passing_marks: a.passing_marks,
    due_at: a.due_at ?? null,
    created_at: a.created_at,
    assignment_type: a.assignment_type ?? "mcq",
    has_submission: false,
    submission_score: null,
    submission_passed: null,
    grading_status: null,
  }));
}

export function exportSubmissionsCsv(
  assignmentTitle: string,
  submissions: AssignmentSubmissionRow[]
): void {
  const header = ["Name", "Email", "Reg ID", "Score", "MCQ", "Manual", "Status", "Passed", "Submitted"];
  const rows = submissions.map((s) => [
    s.student_name || "",
    s.student_email || "",
    s.registration_id || "",
    String(s.score ?? 0),
    String(s.mcq_score ?? 0),
    String(s.manual_score ?? 0),
    s.grading_status,
    s.is_passed ? "Yes" : "No",
    s.submitted_at ? new Date(s.submitted_at).toLocaleString() : "",
  ]);
  const csv = [header, ...rows]
    .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","))
    .join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${assignmentTitle.replace(/\s+/g, "_")}_submissions.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
