import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
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
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
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
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock,
  Download,
  Eye,
  FileText,
  Loader2,
  Pencil,
  Plus,
  Search,
  Sparkles,
  Trash2,
  Users,
} from "lucide-react";
import { ClassTargetFilters, emptyClassTargetFilters, filtersToTargetArrays, collegesForUniversityNames, pruneCollegesForUniversities } from "@/lib/classLinkTargeting";
import { InternshipModeFilterSelect } from "@/components/admin/InternshipModeFilterSelect";
import { MultiSelectCheckboxGroup } from "@/components/admin/MultiSelectCheckboxGroup";
import {
  AssignmentQuestionDisplay,
  AssignmentQuestionDraft,
  AssignmentRow,
  AssignmentSubmissionRow,
  AssignmentType,
  assignmentTargetSummaryShort,
  assignmentTypeLabel,
  countAssignmentTargets,
  deleteAssignment,
  describeAssignmentTargets,
  exportSubmissionsCsv,
  fetchAdminAssignmentQuestions,
  fetchAdminAssignmentSubmissions,
  formatAssignmentError,
  formatSubmissionAnswersForDisplay,
  getWorkSubmissionFromAnswers,
  gradeAssignmentSubmission,
  parseQuestionOptions,
  publishAssignment,
  updateAssignment,
} from "@/lib/assignmentApi";
import { WorkSubmissionDisplay } from "@/components/WorkSubmissionDisplay";

type Props = {
  assignments: AssignmentRow[];
  unis: { id: string; name: string }[];
  colleges: { id: string; name: string; university_id: string }[];
  domains: { id: string; name: string }[];
  currentUserId?: string;
  onRefresh: () => void | Promise<void>;
  onOpenAiBuilder?: () => void;
  isActive?: boolean;
};

const emptyFilters = emptyClassTargetFilters();
const SUBMISSIONS_PER_PAGE = 8;

function SubmissionAnswerList({
  questions,
  answers,
}: {
  questions: AssignmentQuestionDisplay[];
  answers: unknown;
}) {
  const workSubmission = getWorkSubmissionFromAnswers(answers);
  const lines = formatSubmissionAnswersForDisplay(
    questions,
    answers as Record<string, unknown>
  );
  if (workSubmission && (workSubmission.links.length > 0 || workSubmission.files.length > 0 || workSubmission.note)) {
    return <WorkSubmissionDisplay submission={workSubmission} />;
  }
  if (lines.length === 0) {
    return (
      <p className="text-sm text-muted-foreground italic">
        No answers recorded for this submission.
      </p>
    );
  }
  return (
    <div className="space-y-3">
      {lines.map((line) => (
        <div key={line.questionNumber} className="rounded-lg border bg-muted/20 p-3 text-sm">
          <div className="font-semibold text-slate-900 mb-1.5 flex flex-wrap items-center gap-2">
            <span>
              Q{line.questionNumber}. {line.questionText}
            </span>
            <Badge variant="outline" className="text-[9px] shrink-0">
              {line.questionType === "mcq" ? "MCQ" : "Long answer"}
            </Badge>
          </div>
          <div className="text-slate-700 whitespace-pre-wrap">
            <span className="font-medium text-muted-foreground">Answer: </span>
            {line.answerText}
          </div>
          {line.questionType === "mcq" && line.correctAnswerText ? (
            <div className="text-xs mt-1 text-muted-foreground">
              Correct: {line.correctAnswerText}
              {line.isCorrect != null && (
                <span
                  className={
                    line.isCorrect ? " text-emerald-600 font-medium" : " text-red-600 font-medium"
                  }
                >
                  {" "}
                  ({line.isCorrect ? "Correct" : "Incorrect"})
                </span>
              )}
            </div>
          ) : null}
        </div>
      ))}
    </div>
  );
}

const newMcq = (): AssignmentQuestionDraft => ({
  question_text: "",
  question_type: "mcq",
  options: ["", "", "", ""],
  correct_option_index: 0,
  marks: 2,
});

const newLong = (): AssignmentQuestionDraft => ({
  question_text: "",
  question_type: "long_answer",
  marks: 10,
});

const emptyForm = () => ({
  filters: emptyClassTargetFilters(),
  title: "",
  description: "",
  dueAt: "",
  duration: "30",
  passingPercent: "50",
  questions: [newMcq()] as AssignmentQuestionDraft[],
  assignmentType: "mcq" as AssignmentType,
  fileUploadMarks: "100",
});

export function AssignmentManagementPanel({
  assignments,
  unis,
  colleges,
  domains,
  currentUserId,
  onRefresh,
  onOpenAiBuilder,
  isActive = true,
}: Props) {
  const [filters, setFilters] = useState<ClassTargetFilters>(emptyFilters);
  const [assignmentType, setAssignmentType] = useState<AssignmentType>("mcq");
  const [fileUploadMarks, setFileUploadMarks] = useState("100");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<AssignmentRow | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [dueAt, setDueAt] = useState("");
  const [duration, setDuration] = useState("30");
  const [passingPercent, setPassingPercent] = useState("50");
  const [questions, setQuestions] = useState<AssignmentQuestionDraft[]>([newMcq()]);
  const [saving, setSaving] = useState(false);
  const [recipientCount, setRecipientCount] = useState(0);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [audienceOpen, setAudienceOpen] = useState(false);
  const [audienceRow, setAudienceRow] = useState<AssignmentRow | null>(null);

  const [submissionsOpen, setSubmissionsOpen] = useState(false);
  const [selectedAssignment, setSelectedAssignment] = useState<AssignmentRow | null>(null);
  const [submissions, setSubmissions] = useState<AssignmentSubmissionRow[]>([]);
  const [submissionQuestions, setSubmissionQuestions] = useState<AssignmentQuestionDisplay[]>([]);
  const [submissionsLoading, setSubmissionsLoading] = useState(false);
  const [gradingId, setGradingId] = useState<string | null>(null);
  const [gradeMarks, setGradeMarks] = useState("");
  const [gradeFeedback, setGradeFeedback] = useState("");
  const [submissionPage, setSubmissionPage] = useState(0);
  const [expandedSubIds, setExpandedSubIds] = useState<Set<string>>(new Set());
  const [listSearch, setListSearch] = useState("");

  const submissionTotalPages = useMemo(
    () => Math.max(1, Math.ceil(submissions.length / SUBMISSIONS_PER_PAGE)),
    [submissions.length]
  );

  const paginatedSubmissions = useMemo(() => {
    const start = submissionPage * SUBMISSIONS_PER_PAGE;
    return submissions.slice(start, start + SUBMISSIONS_PER_PAGE);
  }, [submissions, submissionPage]);

  const toggleSubmissionExpanded = (id: string, open: boolean) => {
    setExpandedSubIds((prev) => {
      const next = new Set(prev);
      if (open) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  useEffect(() => {
    setExpandedSubIds(new Set());
  }, [submissionPage]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const n = await countAssignmentTargets(supabase, filters);
        if (!cancelled) setRecipientCount(n);
      } catch {
        if (!cancelled) setRecipientCount(0);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [filters, isActive]);

  const totalMarks = useMemo(() => {
    if (assignmentType === "file_upload") return parseInt(fileUploadMarks, 10) || 100;
    return questions.reduce((s, q) => s + (q.marks || 1), 0);
  }, [assignmentType, fileUploadMarks, questions]);

  const resetCreateForm = () => {
    const blank = emptyForm();
    setEditingId(null);
    setAssignmentType(blank.assignmentType);
    setFileUploadMarks(blank.fileUploadMarks);
    setTitle(blank.title);
    setDescription(blank.description);
    setDueAt(blank.dueAt);
    setDuration(blank.duration);
    setPassingPercent(blank.passingPercent);
    setQuestions(blank.questions);
    setFilters(blank.filters);
  };

  const loadAssignmentIntoForm = async (row: AssignmentRow) => {
    if (!row.id) return;
    const type = (row.assignment_type || "mcq") as AssignmentType;
    setEditingId(row.id);
    setAssignmentType(type);
    setTitle(row.title || "");
    setDescription(row.description || "");
    setDuration(String(row.duration_minutes ?? 30));
    setPassingPercent(
      row.total_marks
        ? String(Math.round(((row.passing_marks ?? 0) / row.total_marks) * 100))
        : "50"
    );
    setDueAt(row.due_at ? new Date(row.due_at).toISOString().slice(0, 16) : "");
    setFileUploadMarks(String(row.total_marks ?? 100));
    setFilters({
      universities: row.target_universities || [],
      colleges: row.target_colleges || [],
      domain: row.target_domains?.[0] || "all",
      mode: "all",
    });
    if (type === "file_upload") {
      setQuestions([]);
    } else {
      const qs = await fetchAdminAssignmentQuestions(supabase, row.id);
      if (qs.length === 0) {
        setQuestions(type === "long_answer" ? [newLong()] : [newMcq()]);
      } else {
        setQuestions(
          qs.map((q) => ({
            question_text: q.question_text,
            question_type: (q.question_type === "long_answer" ? "long_answer" : "mcq") as "mcq" | "long_answer",
            options: q.question_type === "mcq" ? parseQuestionOptions(q.options) : [],
            correct_option_index: q.correct_option_index ?? 0,
            marks: q.marks ?? 1,
          }))
        );
      }
    }
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const stats = useMemo(() => {
    const total = assignments.length;
    const subs = assignments.reduce(
      (s, a) => s + (a.assignment_submissions?.length || 0),
      0
    );
    return { total, subs };
  }, [assignments]);

  const filteredAssignments = useMemo(() => {
    const q = listSearch.trim().toLowerCase();
    if (!q) return assignments;
    return assignments.filter((a) => {
      const haystack = [
        a.title,
        a.description,
        assignmentTypeLabel(a.assignment_type),
        assignmentTargetSummaryShort(a),
        a.is_active ? "active" : "off",
        a.total_marks != null ? String(a.total_marks) : "",
        a.due_at ? new Date(a.due_at).toLocaleDateString() : "",
        ...(a.target_universities || []),
        ...(a.target_colleges || []),
        ...(a.target_domains || []),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [assignments, listSearch]);

  const validate = () => {
    if (!title.trim()) return "Assignment title is required.";
    if (!description.trim()) return "Instructions are required.";
    if (recipientCount === 0) return "No students match the selected audience.";
    if (assignmentType !== "file_upload") {
      if (questions.length === 0) return "Add at least one question.";
      for (let i = 0; i < questions.length; i++) {
        const q = questions[i];
        if (!q.question_text.trim()) return `Question ${i + 1} text is required.`;
        if (assignmentType === "mcq" || q.question_type === "mcq") {
          const opts = (q.options || []).filter((o) => o.trim());
          if (opts.length < 2) return `Question ${i + 1} needs at least 2 options.`;
          if ((q.correct_option_index ?? 0) >= opts.length) {
            return `Question ${i + 1} correct answer is invalid.`;
          }
        }
      }
    }
    return null;
  };

  const buildPayloadQuestions = () => {
    if (assignmentType === "file_upload") return [];
    return questions.map((q) => {
      if (assignmentType === "long_answer" || q.question_type === "long_answer") return q;
      const opts = (q.options || []).map((o) => o.trim()).filter(Boolean);
      return { ...q, question_type: "mcq" as const, options: opts, correct_option_index: q.correct_option_index ?? 0 };
    });
  };

  const handleSave = async () => {
    const err = validate();
    if (err) return toast.error(err);
    setSaving(true);
    try {
      const common = {
        title,
        description,
        durationMinutes:
          assignmentType === "file_upload"
            ? 0
            : assignmentType === "long_answer"
              ? 0
              : parseInt(duration, 10) || 30,
        passingPercent: parseInt(passingPercent, 10) || 50,
        assignmentType,
        totalMarksOverride: assignmentType === "file_upload" ? parseInt(fileUploadMarks, 10) || 100 : undefined,
        dueAt: dueAt ? new Date(dueAt).toISOString() : null,
        filters,
        questions: buildPayloadQuestions(),
      };
      if (editingId) {
        await updateAssignment(supabase, editingId, common);
        toast.success("Assignment updated.");
      } else {
        await publishAssignment(supabase, { ...common, createdBy: currentUserId });
        toast.success(`Assignment published to ${recipientCount} student(s).`);
      }
      resetCreateForm();
      setPreviewOpen(false);
      await onRefresh();
    } catch (e: unknown) {
      toast.error(formatAssignmentError(e));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget?.id) return;
    setSaving(true);
    try {
      await deleteAssignment(supabase, deleteTarget.id);
      toast.success("Assignment deleted.");
      setDeleteTarget(null);
      if (editingId === deleteTarget.id) resetCreateForm();
      await onRefresh();
    } catch (e: unknown) {
      toast.error(formatAssignmentError(e));
    } finally {
      setSaving(false);
    }
  };

  const openSubmissions = async (a: AssignmentRow) => {
    if (!a.id) return;
    setSelectedAssignment(a);
    setSubmissionsOpen(true);
    setSubmissionsLoading(true);
    setSubmissionPage(0);
    setExpandedSubIds(new Set());
    setGradingId(null);
    try {
      const [rows, questions] = await Promise.all([
        fetchAdminAssignmentSubmissions(supabase, a.id),
        fetchAdminAssignmentQuestions(supabase, a.id),
      ]);
      setSubmissions(rows);
      setSubmissionQuestions(questions);
    } catch (e: unknown) {
      toast.error(formatAssignmentError(e));
      setSubmissions([]);
      setSubmissionQuestions([]);
    } finally {
      setSubmissionsLoading(false);
    }
  };

  const handleGrade = async (sub: AssignmentSubmissionRow) => {
    const marks = parseInt(gradeMarks, 10);
    if (Number.isNaN(marks) || marks < 0) return toast.error("Enter valid marks.");
    setSaving(true);
    try {
      await gradeAssignmentSubmission(supabase, sub.id, marks, gradeFeedback);
      toast.success("Submission graded.");
      setGradingId(null);
      setGradeMarks("");
      setGradeFeedback("");
      if (selectedAssignment?.id) {
        const [rows, questions] = await Promise.all([
          fetchAdminAssignmentSubmissions(supabase, selectedAssignment.id),
          fetchAdminAssignmentQuestions(supabase, selectedAssignment.id),
        ]);
        setSubmissions(rows);
        setSubmissionQuestions(questions);
      }
      await onRefresh();
    } catch (e: unknown) {
      toast.error(formatAssignmentError(e));
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (a: AssignmentRow) => {
    if (!a.id) return;
    const { error } = await supabase
      .from("assignments")
      .update({ is_active: !a.is_active, updated_at: new Date().toISOString() })
      .eq("id", a.id);
    if (error) return toast.error(error.message);
    await onRefresh();
  };

  const renderFilters = () => {
    const filteredColleges = collegesForUniversityNames(colleges, unis, filters.universities);

    return (
      <>
        <MultiSelectCheckboxGroup
          label="University"
          options={unis}
          selectedValues={filters.universities}
          onChange={(newUnis) => {
            setFilters({
              ...filters,
              universities: newUnis,
              colleges: pruneCollegesForUniversities(colleges, unis, newUnis, filters.colleges),
            });
          }}
        />
        <MultiSelectCheckboxGroup
          label="College"
          options={filteredColleges}
          selectedValues={filters.colleges}
          onChange={(newColleges) => setFilters({ ...filters, colleges: newColleges })}
        />
        <div className="space-y-2">
          <Label>Domain</Label>
          <Select value={filters.domain} onValueChange={(v) => setFilters({ ...filters, domain: v })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Domains</SelectItem>
              {domains.map((d) => <SelectItem key={d.id} value={d.name}>{d.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Mode</Label>
          <InternshipModeFilterSelect
            value={filters.mode}
            onValueChange={(v) => setFilters({ ...filters, mode: v })}
          />
        </div>
      </>
    );
  };

  const composeAudienceRow = (): AssignmentRow => {
    const t = filtersToTargetArrays(filters);
    return {
      target_universities: t.target_universities,
      target_colleges: t.target_colleges,
      target_domains: t.target_domains,
      target_modes: t.target_modes,
    };
  };

  const renderAudienceBody = (row: AssignmentRow, matched: number) => (
    <div className="space-y-4 pr-3">
      <div className="flex items-center gap-2 rounded-lg bg-primary/5 border border-primary/10 p-3 text-sm">
        <Users className="size-4 text-primary shrink-0" />
        <span>
          <span className="font-bold">{matched}</span> student{matched === 1 ? "" : "s"} targeted
        </span>
      </div>
      {row.target_universities?.length ? (
        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-2">Universities</p>
          <ul className="space-y-1.5 text-sm">
            {row.target_universities.map((u) => (
              <li key={u} className="rounded-md border bg-muted/20 px-3 py-2">{u}</li>
            ))}
          </ul>
        </div>
      ) : null}
      {row.target_colleges?.length ? (
        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-2">Colleges</p>
          <ul className="space-y-1.5 text-sm">
            {row.target_colleges.map((c) => (
              <li key={c} className="rounded-md border bg-muted/20 px-3 py-2">{c}</li>
            ))}
          </ul>
        </div>
      ) : null}
      {row.target_domains?.length ? (
        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-2">Domains</p>
          <ul className="space-y-1.5 text-sm">
            {row.target_domains.map((d) => (
              <li key={d} className="rounded-md border bg-muted/20 px-3 py-2">{d}</li>
            ))}
          </ul>
        </div>
      ) : null}
      {!row.target_universities?.length && !row.target_colleges?.length && !row.target_domains?.length ? (
        <p className="text-sm text-muted-foreground rounded-lg border border-dashed p-4 text-center">
          All enrolled students (no filters).
        </p>
      ) : null}
      <p className="text-xs text-muted-foreground border-t pt-3">{describeAssignmentTargets(row)}</p>
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="p-4 border-none shadow-elegant">
          <p className="text-[10px] font-bold uppercase text-muted-foreground">Total</p>
          <p className="text-2xl font-black">{stats.total}</p>
        </Card>
        <Card className="p-4 border-none shadow-elegant">
          <p className="text-[10px] font-bold uppercase text-muted-foreground">Submissions</p>
          <p className="text-2xl font-black">{stats.subs}</p>
        </Card>
        <Card className="p-4 border-none shadow-elegant">
          <p className="text-[10px] font-bold uppercase text-muted-foreground">Recipients (draft)</p>
          <p className="text-2xl font-black">{recipientCount}</p>
        </Card>
        <Card className="p-4 border-none shadow-elegant">
          <p className="text-[10px] font-bold uppercase text-muted-foreground">Draft marks</p>
          <p className="text-2xl font-black">{totalMarks}</p>
        </Card>
      </div>

      <div className="grid lg:grid-cols-5 gap-6 items-start">
        <div className="lg:col-span-2 space-y-4">
          <Card className="p-6 border-none shadow-elegant">
            <div className="flex justify-between items-start gap-3 mb-4">
              <h3 className="text-lg font-bold flex items-center gap-2 min-w-0">
                <FileText className="size-5 text-primary shrink-0" /> {editingId ? "Edit Assignment" : "Create Assignment"}
              </h3>
              {onOpenAiBuilder ? (
                <Button variant="outline" size="sm" className="gap-1 shrink-0" onClick={onOpenAiBuilder}>
                  <Sparkles className="size-3.5" /> AI
                </Button>
              ) : null}
            </div>

            <div className="rounded-xl bg-primary/5 border border-primary/10 p-3 mb-5 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <Users className="size-4 text-primary shrink-0" />
                <span className="text-sm font-bold truncate">{recipientCount} students</span>
              </div>
              <Button variant="outline" size="sm" className="text-xs h-7 shrink-0" onClick={() => { setAudienceRow(null); setAudienceOpen(true); }}>
                View audience
              </Button>
            </div>

            <div className="space-y-5 max-h-[min(72vh,900px)] overflow-y-auto pr-2 -mr-2">
              <div className="space-y-2">
                <Label>Assignment type</Label>
                <Select
                  value={assignmentType}
                  onValueChange={(v) => {
                    const next = v as AssignmentType;
                    setAssignmentType(next);
                    if (next === "file_upload") setQuestions([]);
                    else if (next === "long_answer") setQuestions([newLong()]);
                    else setQuestions([newMcq()]);
                  }}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="mcq">MCQ (auto-graded)</SelectItem>
                    <SelectItem value="long_answer">Long answer</SelectItem>
                    <SelectItem value="file_upload">Links + file attachments</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {renderFilters()}
              <div className="space-y-2">
                <Label htmlFor="assignment-title">Title</Label>
                <Input
                  id="assignment-title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Assignment title"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="assignment-instructions">Instructions</Label>
                <Textarea
                  id="assignment-instructions"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="min-h-[88px] resize-y"
                  placeholder="What students should do for this assignment"
                />
              </div>

              <div className="rounded-xl border bg-muted/20 p-4 space-y-4">
                <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-1.5">
                  <Clock className="size-3.5" /> Schedule & grading
                </p>
                <div className="space-y-2">
                  <Label htmlFor="assignment-due-at">Due date & time (optional)</Label>
                  <Input
                    id="assignment-due-at"
                    type="datetime-local"
                    value={dueAt}
                    onChange={(e) => setDueAt(e.target.value)}
                    className="w-full min-w-0"
                  />
                </div>
                <div className={`grid gap-3 ${assignmentType === "mcq" ? "grid-cols-2" : "grid-cols-1"}`}>
                  {assignmentType === "mcq" ? (
                  <div className="space-y-2 min-w-0">
                    <Label htmlFor="assignment-duration">Duration (minutes)</Label>
                    <Input
                      id="assignment-duration"
                      type="number"
                      min={1}
                      max={480}
                      value={duration}
                      onChange={(e) => setDuration(e.target.value)}
                      className="w-full"
                    />
                  </div>
                  ) : assignmentType === "long_answer" ? (
                    <p className="text-xs text-muted-foreground col-span-full">
                      Long-answer assignments have no timer — students can take their time.
                    </p>
                  ) : (
                    <p className="text-xs text-muted-foreground col-span-full">
                      File-link assignments have no timer — students submit Drive/GitHub/etc. links.
                    </p>
                  )}
                  <div className="space-y-2 min-w-0">
                    <Label htmlFor="assignment-passing">Passing %</Label>
                    <Input
                      id="assignment-passing"
                      type="number"
                      min={0}
                      max={100}
                      value={passingPercent}
                      onChange={(e) => setPassingPercent(e.target.value)}
                      className="w-full"
                    />
                  </div>
                </div>
              </div>

              {assignmentType === "file_upload" ? (
                <div className="space-y-2">
                  <Label>Total marks (manual grading)</Label>
                  <Input type="number" value={fileUploadMarks} onChange={(e) => setFileUploadMarks(e.target.value)} />
                  <p className="text-xs text-muted-foreground">
                    Students can submit links (Drive, GitHub, etc.) and/or attach PDF/image files. No timer. You grade manually.
                  </p>
                </div>
              ) : (
              <>
              <div className="flex gap-2">
                {assignmentType === "mcq" ? (
                  <Button type="button" variant="outline" size="sm" className="flex-1" onClick={() => setQuestions((q) => [...q, newMcq()])}>
                    <Plus className="size-3.5 mr-1" /> MCQ
                  </Button>
                ) : (
                  <Button type="button" variant="outline" size="sm" className="flex-1" onClick={() => setQuestions((q) => [...q, newLong()])}>
                    <Plus className="size-3.5 mr-1" /> Long answer
                  </Button>
                )}
              </div>

              {questions.map((q, idx) => (
                <Card key={idx} className="p-3 border bg-muted/20">
                  <div className="flex justify-between mb-2">
                    <Badge variant="secondary">{q.question_type === "mcq" ? "MCQ" : "Long answer"}</Badge>
                    <Button type="button" variant="ghost" size="icon" className="size-7" onClick={() => setQuestions((prev) => prev.filter((_, i) => i !== idx))}>
                      <Trash2 className="size-3.5 text-destructive" />
                    </Button>
                  </div>
                  <Textarea
                    className="mb-2 min-h-[60px] text-sm"
                    placeholder="Question text"
                    value={q.question_text}
                    onChange={(e) => setQuestions((prev) => prev.map((x, i) => (i === idx ? { ...x, question_text: e.target.value } : x)))}
                  />
                  <Input
                    type="number"
                    className="mb-2 h-8 text-sm"
                    placeholder="Marks"
                    value={q.marks}
                    onChange={(e) => setQuestions((prev) => prev.map((x, i) => (i === idx ? { ...x, marks: parseInt(e.target.value, 10) || 1 } : x)))}
                  />
                  {assignmentType !== "long_answer" && (assignmentType === "mcq" || q.question_type === "mcq") ? (
                    <div className="space-y-1.5">
                      {(q.options || ["", "", "", ""]).map((opt, oi) => (
                        <div key={oi} className="flex gap-2 items-center">
                          <input
                            type="radio"
                            name={`correct-${idx}`}
                            checked={q.correct_option_index === oi}
                            onChange={() => setQuestions((prev) => prev.map((x, i) => (i === idx ? { ...x, correct_option_index: oi } : x)))}
                          />
                          <Input
                            className="h-8 text-xs"
                            value={opt}
                            placeholder={`Option ${oi + 1}`}
                            onChange={(e) => {
                              const opts = [...(q.options || ["", "", "", ""])];
                              opts[oi] = e.target.value;
                              setQuestions((prev) => prev.map((x, i) => (i === idx ? { ...x, options: opts } : x)));
                            }}
                          />
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-[10px] text-muted-foreground">
                      Students can write as much as they need (no word limit).
                    </p>
                  )}
                </Card>
              ))}

              </>
              )}

              <div className="flex gap-2">
                {editingId ? (
                  <Button type="button" variant="outline" className="flex-1" onClick={resetCreateForm}>
                    Cancel edit
                  </Button>
                ) : null}
                <Button className="w-full gap-2 flex-1" onClick={() => { const err = validate(); if (err) return toast.error(err); setPreviewOpen(true); }}>
                  <Eye className="size-4" /> {editingId ? "Preview & Save" : "Preview & Publish"}
                </Button>
              </div>
            </div>
          </Card>
        </div>

        <div className="lg:col-span-3 min-w-0">
          <Card className="overflow-hidden border-none shadow-elegant">
            <div className="p-4 border-b bg-muted/20 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h3 className="font-bold">Published Assignments</h3>
                <p className="text-xs text-muted-foreground">
                  {filteredAssignments.length} of {assignments.length}
                </p>
              </div>
              <div className="relative max-w-md">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-3 text-muted-foreground" />
                <Input
                  className="pl-8 h-9"
                  placeholder="Search title, type, audience, domain..."
                  value={listSearch}
                  onChange={(e) => setListSearch(e.target.value)}
                />
              </div>
            </div>
            <ScrollArea className="h-[min(720px,min(72vh,900px))] w-full">
              {assignments.length === 0 ? (
                <p className="p-10 text-center text-muted-foreground">No assignments yet.</p>
              ) : filteredAssignments.length === 0 ? (
                <p className="p-10 text-center text-muted-foreground">
                  No assignments match your search.
                </p>
              ) : (
                <div className="min-w-[960px]">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Type</TableHead>
                        <TableHead>Title</TableHead>
                        <TableHead>Audience</TableHead>
                        <TableHead>Marks</TableHead>
                        <TableHead>Due</TableHead>
                        <TableHead>Submissions</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="w-[220px] min-w-[220px] text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredAssignments.map((a) => {
                        const subCount = a.assignment_submissions?.length || 0;
                        const pending = a.recipient_count != null ? Math.max(0, a.recipient_count - subCount) : null;
                        return (
                          <TableRow key={a.id}>
                            <TableCell>
                              <Badge variant="outline">{assignmentTypeLabel(a.assignment_type)}</Badge>
                            </TableCell>
                            <TableCell className="font-semibold max-w-[160px]">
                              <span className="line-clamp-2">{a.title}</span>
                            </TableCell>
                            <TableCell>
                              <Button variant="outline" size="sm" className="h-7 text-[10px]" onClick={() => { setAudienceRow(a); setAudienceOpen(true); }}>
                                {assignmentTargetSummaryShort(a)}
                              </Button>
                            </TableCell>
                            <TableCell>{a.total_marks}</TableCell>
                            <TableCell className="text-xs whitespace-nowrap">
                              {a.due_at ? new Date(a.due_at).toLocaleDateString() : "—"}
                            </TableCell>
                            <TableCell>
                              <span className="font-bold">{subCount}</span>
                              {pending != null ? <span className="text-muted-foreground text-xs"> / {pending} pending</span> : null}
                            </TableCell>
                            <TableCell>
                              <Badge variant={a.is_active ? "default" : "secondary"}>{a.is_active ? "Active" : "Off"}</Badge>
                            </TableCell>
                            <TableCell className="align-middle py-2">
                              <div className="flex items-center justify-end gap-1.5 flex-nowrap">
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  className="h-8 px-2.5 text-xs shrink-0"
                                  onClick={() => void openSubmissions(a)}
                                >
                                  Review
                                </Button>
                                <Button
                                  type="button"
                                  size="icon"
                                  variant="outline"
                                  className="size-8 shrink-0"
                                  title="Edit assignment"
                                  onClick={() => void loadAssignmentIntoForm(a)}
                                >
                                  <Pencil className="size-3.5" />
                                </Button>
                                <Button
                                  type="button"
                                  size="icon"
                                  variant="ghost"
                                  className="size-8 shrink-0 text-destructive hover:text-destructive hover:bg-destructive/10"
                                  title="Delete assignment"
                                  onClick={() => setDeleteTarget(a)}
                                >
                                  <Trash2 className="size-3.5" />
                                </Button>
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="ghost"
                                  className="h-8 px-2 text-xs shrink-0"
                                  onClick={() => void toggleActive(a)}
                                >
                                  {a.is_active ? "Hide" : "Show"}
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}
              {filteredAssignments.length > 0 ? <ScrollBar orientation="horizontal" /> : null}
            </ScrollArea>
          </Card>
        </div>
      </div>

      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] flex flex-col overflow-hidden">
          <DialogHeader>
            <DialogTitle>Preview assignment</DialogTitle>
            <DialogDescription>{recipientCount} students · {totalMarks} total marks · {assignmentType === "file_upload" ? "links + files" : `${questions.length} questions`}</DialogDescription>
          </DialogHeader>
          <ScrollArea className="max-h-[50vh] pr-4">
            <div className="space-y-3 text-sm">
              <p><strong>Title:</strong> {title}</p>
              <p className="whitespace-pre-wrap"><strong>Instructions:</strong> {description}</p>
              {questions.map((q, i) => (
                <p key={i}><strong>Q{i + 1}</strong> ({q.question_type}, {q.marks}m): {q.question_text}</p>
              ))}
            </div>
          </ScrollArea>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPreviewOpen(false)}>Back</Button>
            <Button disabled={saving} onClick={() => void handleSave()}>
              {saving ? <Loader2 className="size-4 animate-spin mr-2" /> : null}
              {editingId ? "Save changes" : "Publish"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={audienceOpen}
        onOpenChange={(open) => {
          setAudienceOpen(open);
          if (!open) setAudienceRow(null);
        }}
      >
        <DialogContent className="sm:max-w-md max-h-[85vh] flex flex-col p-0 gap-0 overflow-hidden">
          <DialogHeader className="px-6 pt-6 pb-3 shrink-0 border-b bg-muted/20">
            <DialogTitle>Target audience</DialogTitle>
            <DialogDescription>
              {(audienceRow?.recipient_count ?? recipientCount)} matching students
            </DialogDescription>
          </DialogHeader>
          <ScrollArea className="flex-1 w-full min-h-0 max-h-[min(58vh,420px)]">
            <div className="px-6 py-4">
              {renderAudienceBody(
                audienceRow || composeAudienceRow(),
                audienceRow?.recipient_count ?? recipientCount
              )}
            </div>
          </ScrollArea>
          <DialogFooter className="px-6 py-4"><Button onClick={() => setAudienceOpen(false)}>Close</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={submissionsOpen}
        onOpenChange={(open) => {
          setSubmissionsOpen(open);
          if (!open) {
            setSubmissionPage(0);
            setExpandedSubIds(new Set());
            setGradingId(null);
          }
        }}
      >
        <DialogContent className="sm:max-w-3xl h-[min(90vh,820px)] max-h-[90vh] flex flex-col overflow-hidden p-0 gap-0">
          <DialogHeader className="px-6 pt-6 pb-3 shrink-0 border-b">
            <DialogTitle>Submissions — {selectedAssignment?.title}</DialogTitle>
            <DialogDescription>
              {submissions.length} submission{submissions.length === 1 ? "" : "s"} · expand a row to view answers
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-wrap items-center justify-between gap-2 px-6 py-3 border-b shrink-0">
            <Button
              size="sm"
              variant="outline"
              className="gap-1"
              disabled={!submissions.length}
              onClick={() => exportSubmissionsCsv(selectedAssignment?.title || "assignment", submissions)}
            >
              <Download className="size-3.5" /> Export CSV
            </Button>
            {submissions.length > SUBMISSIONS_PER_PAGE ? (
              <div className="flex items-center gap-2 text-sm">
                <Button
                  variant="outline"
                  size="icon"
                  className="size-8"
                  disabled={submissionPage <= 0}
                  onClick={() => setSubmissionPage((p) => Math.max(0, p - 1))}
                >
                  <ChevronLeft className="size-4" />
                </Button>
                <span className="text-muted-foreground tabular-nums min-w-[100px] text-center">
                  Page {submissionPage + 1} of {submissionTotalPages}
                </span>
                <Button
                  variant="outline"
                  size="icon"
                  className="size-8"
                  disabled={submissionPage >= submissionTotalPages - 1}
                  onClick={() => setSubmissionPage((p) => Math.min(submissionTotalPages - 1, p + 1))}
                >
                  <ChevronRight className="size-4" />
                </Button>
              </div>
            ) : null}
          </div>
          <div className="flex-1 min-h-0 overflow-y-auto overscroll-y-contain px-6 py-4">
            <div>
              {submissionsLoading ? (
                <div className="py-12 flex justify-center">
                  <Loader2 className="animate-spin" />
                </div>
              ) : submissions.length === 0 ? (
                <p className="py-10 text-center text-muted-foreground">No submissions yet.</p>
              ) : (
                <div className="space-y-2">
                  {paginatedSubmissions.map((sub) => {
                    const isExpanded = expandedSubIds.has(sub.id);
                    return (
                      <Collapsible
                        key={sub.id}
                        open={isExpanded}
                        onOpenChange={(open) => toggleSubmissionExpanded(sub.id, open)}
                      >
                        <Card className="overflow-hidden border shadow-sm">
                          <CollapsibleTrigger asChild>
                            <button
                              type="button"
                              className="w-full text-left p-4 flex items-start gap-3 hover:bg-muted/30 transition-colors"
                            >
                              <ChevronDown
                                className={`size-5 shrink-0 text-muted-foreground mt-0.5 transition-transform ${
                                  isExpanded ? "rotate-180" : ""
                                }`}
                              />
                              <div className="flex-1 min-w-0">
                                <div className="flex flex-wrap items-center gap-2 mb-1">
                                  <span className="font-bold truncate">{sub.student_name || "Student"}</span>
                                  <Badge variant="secondary" className="text-[10px] shrink-0">
                                    {sub.grading_status}
                                  </Badge>
                                </div>
                                <div className="text-xs text-muted-foreground truncate">
                                  {sub.student_email}
                                  {sub.registration_id ? ` · ${sub.registration_id}` : ""}
                                </div>
                                <div className="text-xs text-muted-foreground mt-1">
                                  Score {sub.score} (MCQ {sub.mcq_score ?? 0}, Manual {sub.manual_score ?? 0})
                                  {sub.submitted_at
                                    ? ` · ${new Date(sub.submitted_at).toLocaleString([], {
                                        dateStyle: "short",
                                        timeStyle: "short",
                                      })}`
                                    : ""}
                                </div>
                              </div>
                              <span className="text-[10px] font-medium text-primary shrink-0">
                                {isExpanded ? "Hide" : "View answers"}
                              </span>
                            </button>
                          </CollapsibleTrigger>
                          <CollapsibleContent>
                            <div className="px-4 pb-4 pt-0 border-t bg-muted/10 space-y-3">
                              {sub.grading_status === "pending_review" && gradingId === sub.id ? (
                                <div className="space-y-2 pt-3">
                                  <Input
                                    placeholder={
                                      selectedAssignment?.assignment_type === "file_upload"
                                        ? "Marks for uploaded file"
                                        : "Manual marks for long answers"
                                    }
                                    value={gradeMarks}
                                    onChange={(e) => setGradeMarks(e.target.value)}
                                  />
                                  <Textarea
                                    placeholder="Feedback for student"
                                    value={gradeFeedback}
                                    onChange={(e) => setGradeFeedback(e.target.value)}
                                  />
                                  <div className="flex gap-2">
                                    <Button size="sm" disabled={saving} onClick={() => void handleGrade(sub)}>
                                      Save grade
                                    </Button>
                                    <Button size="sm" variant="ghost" onClick={() => setGradingId(null)}>
                                      Cancel
                                    </Button>
                                  </div>
                                </div>
                              ) : sub.grading_status === "pending_review" ? (
                                <Button size="sm" className="mt-3" onClick={() => setGradingId(sub.id)}>
                  {selectedAssignment?.assignment_type === "file_upload"
                                    ? "Grade submission"
                                    : "Evaluate answers"}
                                </Button>
                              ) : sub.admin_feedback ? (
                                <div className="text-xs pt-3 text-muted-foreground">
                                  <span className="font-medium">Feedback:</span> {sub.admin_feedback}
                                </div>
                              ) : null}
                              <div className="pt-2">
                                <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-2">
                                  Student answers
                                </div>
                                <div className="max-h-[min(42vh,420px)] overflow-y-auto overscroll-y-contain rounded-lg border border-muted/30 bg-background/80 p-2 pr-1">
                                  <SubmissionAnswerList questions={submissionQuestions} answers={sub.answers} />
                                </div>
                              </div>
                            </div>
                          </CollapsibleContent>
                        </Card>
                      </Collapsible>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
          {submissions.length > 0 ? (
            <div className="px-6 py-3 border-t shrink-0 flex items-center justify-between text-xs text-muted-foreground">
              <span>
                Showing {submissionPage * SUBMISSIONS_PER_PAGE + 1}–
                {Math.min((submissionPage + 1) * SUBMISSIONS_PER_PAGE, submissions.length)} of{" "}
                {submissions.length}
              </span>
              {submissions.length > SUBMISSIONS_PER_PAGE ? (
                <div className="flex gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={submissionPage <= 0}
                    onClick={() => setSubmissionPage((p) => p - 1)}
                  >
                    Previous
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={submissionPage >= submissionTotalPages - 1}
                    onClick={() => setSubmissionPage((p) => p + 1)}
                  >
                    Next
                  </Button>
                </div>
              ) : null}
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete assignment?</DialogTitle>
            <DialogDescription>
              &ldquo;{deleteTarget?.title}&rdquo; will be removed from the admin and student dashboards immediately.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)} disabled={saving}>
              Cancel
            </Button>
            <Button variant="destructive" disabled={saving} onClick={() => void handleDelete()}>
              {saving ? <Loader2 className="size-4 animate-spin mr-2" /> : null}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
