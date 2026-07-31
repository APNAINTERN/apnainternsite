import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  ClassTargetFilters,
  emptyClassTargetFilters,
  filtersToTargetArrays,
} from "@/lib/classLinkTargeting";
import { generateGeminiText, formatGeminiUserError } from "@/lib/geminiApi";
import {
  AssignmentType,
  assignmentTypeLabel,
  countAssignmentTargets,
  describeAssignmentTargets,
  formatAssignmentError,
  publishAssignment,
} from "@/lib/assignmentApi";
import { AssignmentAudienceFilters } from "@/components/admin/AssignmentAudienceFilters";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Loader2,
  Sparkles,
  Plus,
  CheckCircle2,
  Pencil,
  Save,
  Trash2,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
  Users,
} from "lucide-react";

interface GeneratedQuestion {
  question_text: string;
  question_type: "mcq" | "long_answer";
  options: string[];
  correct_option_index: number;
  marks: number;
}

interface AIAssignmentBuilderProps {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  currentUserId?: string;
  unis: { id: string; name: string }[];
  colleges: { id: string; name: string; university_id: string }[];
  domains: { id: string; name: string }[];
}

function clampQuestionCount(raw: string): number {
  const n = parseInt(raw, 10);
  if (Number.isNaN(n)) return 5;
  return Math.min(50, Math.max(1, n));
}

export default function AIAssignmentBuilder({
  open,
  onClose,
  onSaved,
  currentUserId,
  unis,
  colleges,
  domains,
}: AIAssignmentBuilderProps) {
  const [step, setStep] = useState<1 | 2>(1);
  const [assignmentType, setAssignmentType] = useState<AssignmentType>("mcq");
  const [prompt, setPrompt] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [numQuestions, setNumQuestions] = useState("5");
  const [difficulty, setDifficulty] = useState("medium");
  const [marksPerQ, setMarksPerQ] = useState("4");
  const [passingPercent, setPassingPercent] = useState("50");
  const [duration, setDuration] = useState("20");
  const [fileUploadMarks, setFileUploadMarks] = useState("100");

  const [questions, setQuestions] = useState<GeneratedQuestion[]>([]);
  const [expandedIdx, setExpandedIdx] = useState<number | null>(0);

  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [configError, setConfigError] = useState<string | null>(null);
  const [filters, setFilters] = useState<ClassTargetFilters>(emptyClassTargetFilters());
  const [recipientCount, setRecipientCount] = useState<number | null>(null);
  const [countLoading, setCountLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setCountLoading(true);
    void countAssignmentTargets(supabase, filters)
      .then((n) => {
        if (!cancelled) setRecipientCount(n);
      })
      .catch(() => {
        if (!cancelled) setRecipientCount(null);
      })
      .finally(() => {
        if (!cancelled) setCountLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, filters]);

  const audienceSummary = describeAssignmentTargets({
    ...filtersToTargetArrays(filters),
  });

  const questionCount = clampQuestionCount(numQuestions);
  const isMcq = assignmentType === "mcq";
  const isLongAnswer = assignmentType === "long_answer";
  const isFileUpload = assignmentType === "file_upload";

  const generateWithAi = async () => {
    if (!prompt.trim()) return toast.error("Please enter a topic or prompt.");
    if (!title.trim()) return toast.error("Please enter an assignment title.");

    setConfigError(null);
    setGenerating(true);

    try {
      if (isFileUpload) {
        const systemPrompt = `You are an expert educational assessment designer. Write clear student-facing instructions for a project submission assignment.

Topic/Prompt: "${prompt}"
Assignment title: "${title}"

Students will submit links (Google Drive, GitHub, Figma, etc.) and may also attach PDF or image files. Write 2–4 short paragraphs explaining what they should submit and how it will be evaluated.

Respond ONLY with plain text instructions. No markdown, no JSON, no code fences.`;

        const rawText = await generateGeminiText(systemPrompt);
        const instructions = rawText.replace(/```/g, "").trim();
        if (!instructions) throw new Error("Invalid response format from AI.");
        setDescription(instructions);
        setQuestions([]);
        setStep(2);
        toast.success("Instructions generated successfully!");
        return;
      }

      const count = questionCount;
      const marks = parseInt(marksPerQ, 10) || 4;

      const systemPrompt = isMcq
        ? `You are an expert educational assessment designer. Generate exactly ${count} multiple-choice questions (MCQs) based on the following topic.

Topic/Prompt: "${prompt}"
Difficulty: ${difficulty}
Format: Each question must have exactly 4 options (A, B, C, D), with only one correct answer.

Respond ONLY with a valid JSON array. No explanation, no markdown, no code fences. Just the raw JSON array.

Schema for each object:
{
  "question_text": "The full question",
  "options": ["Option A", "Option B", "Option C", "Option D"],
  "correct_option_index": 0
}`
        : `You are an expert educational assessment designer. Generate exactly ${count} long-answer (descriptive/essay) questions based on the following topic.

Topic/Prompt: "${prompt}"
Difficulty: ${difficulty}
Each question should require a thoughtful written response (no word limit for students).

Respond ONLY with a valid JSON array. No explanation, no markdown, no code fences. Just the raw JSON array.

Schema for each object:
{
  "question_text": "The full question prompt"
}`;

      const rawText = await generateGeminiText(systemPrompt);
      const cleaned = rawText.replace(/```json|```/gi, "").trim();
      const parsed = JSON.parse(cleaned);

      if (!Array.isArray(parsed) || parsed.length === 0) {
        throw new Error("Invalid response format from AI.");
      }

      const withMarks: GeneratedQuestion[] = parsed.map((q: { question_text?: string; options?: string[]; correct_option_index?: number }) => ({
        question_text: q.question_text || "",
        question_type: isMcq ? "mcq" : "long_answer",
        options: isMcq
          ? (q.options?.length === 4 ? q.options : ["Option A", "Option B", "Option C", "Option D"])
          : [],
        correct_option_index: isMcq ? (q.correct_option_index ?? 0) : 0,
        marks: marks,
      }));

      setQuestions(withMarks);
      setExpandedIdx(0);
      setStep(2);
      toast.success(
        isMcq
          ? `${withMarks.length} MCQ questions generated!`
          : `${withMarks.length} long-answer questions generated!`
      );
    } catch (err: unknown) {
      console.error(err);
      const raw =
        err instanceof Error
          ? err.message
          : "Failed to generate content. Check GEMINI_API_KEY in .env and restart npm run dev.";
      const msg = formatGeminiUserError(raw);
      if (msg.toLowerCase().includes("gemini_api_key") || msg.includes("not configured")) {
        setConfigError(msg);
      }
      toast.error(msg, { duration: 8000 });
    } finally {
      setGenerating(false);
    }
  };

  const updateQuestion = (idx: number, field: keyof GeneratedQuestion, value: unknown) => {
    setQuestions((prev) => prev.map((q, i) => (i === idx ? { ...q, [field]: value } : q)));
  };

  const updateOption = (qIdx: number, optIdx: number, value: string) => {
    setQuestions((prev) =>
      prev.map((q, i) => {
        if (i !== qIdx) return q;
        const newOpts = [...q.options];
        newOpts[optIdx] = value;
        return { ...q, options: newOpts };
      })
    );
  };

  const deleteQuestion = (idx: number) => {
    setQuestions((prev) => prev.filter((_, i) => i !== idx));
  };

  const addQuestionManually = () => {
    const marks = parseInt(marksPerQ, 10) || 4;
    if (isMcq) {
      setQuestions((prev) => [
        ...prev,
        {
          question_text: "New question...",
          question_type: "mcq",
          options: ["Option A", "Option B", "Option C", "Option D"],
          correct_option_index: 0,
          marks,
        },
      ]);
    } else {
      setQuestions((prev) => [
        ...prev,
        {
          question_text: "New long-answer question...",
          question_type: "long_answer",
          options: [],
          correct_option_index: 0,
          marks,
        },
      ]);
    }
  };

  const saveAssignment = async () => {
    if (isFileUpload) {
      if (!description.trim()) return toast.error("Add instructions for students before publishing.");
    } else if (questions.length === 0) {
      return toast.error("No questions to save.");
    }

    setSaving(true);
    try {
      await publishAssignment(supabase, {
        title: title.trim(),
        description: (description.trim() || prompt.trim()),
        durationMinutes: isFileUpload || isLongAnswer ? 0 : parseInt(duration, 10) || 20,
        passingPercent: parseInt(passingPercent, 10) || 50,
        assignmentType,
        totalMarksOverride: isFileUpload ? parseInt(fileUploadMarks, 10) || 100 : undefined,
        filters,
        questions: isFileUpload
          ? []
          : questions.map((q) => ({
              question_text: q.question_text,
              question_type: q.question_type,
              options: q.question_type === "mcq" ? q.options : [],
              correct_option_index: q.question_type === "mcq" ? q.correct_option_index : null,
              marks: q.marks,
            })),
        createdBy: currentUserId,
      });

      toast.success(
        recipientCount != null
          ? `Assignment published to ${recipientCount} student${recipientCount === 1 ? "" : "s"}.`
          : "Assignment saved and published!"
      );
      onSaved();
      handleClose();
    } catch (err: unknown) {
      toast.error(formatAssignmentError(err));
    } finally {
      setSaving(false);
    }
  };

  const handleClose = () => {
    setStep(1);
    setAssignmentType("mcq");
    setPrompt("");
    setTitle("");
    setDescription("");
    setNumQuestions("5");
    setQuestions([]);
    setFileUploadMarks("100");
    setFilters(emptyClassTargetFilters());
    setRecipientCount(null);
    setConfigError(null);
    onClose();
  };

  const totalMarks = isFileUpload
    ? parseInt(fileUploadMarks, 10) || 100
    : questions.reduce((s, q) => s + q.marks, 0);

  const generateButtonLabel = isFileUpload
    ? "Generate Instructions with AI"
    : isMcq
      ? "Generate MCQ Questions"
      : "Generate Long-Answer Questions";

  const renderAudienceSection = () => (
    <div className="rounded-xl border bg-slate-50 p-4 space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <p className="text-sm font-bold">Publish audience</p>
        <div className="flex items-center gap-2 text-sm text-slate-700">
          <Users className="size-4 text-primary shrink-0" />
          {countLoading ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <span>
              <b>{recipientCount ?? "—"}</b> student{recipientCount === 1 ? "" : "s"} targeted
            </span>
          )}
        </div>
      </div>
      <AssignmentAudienceFilters
        filters={filters}
        onChange={setFilters}
        unis={unis}
        colleges={colleges}
        domains={domains}
      />
      <p className="text-xs text-muted-foreground border-t pt-3">{audienceSummary}</p>
      {!filters.universities.length &&
      !filters.colleges.length &&
      filters.domain === "all" &&
      filters.mode === "all" ? (
        <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          No filters selected — visible to all enrolled students. Pick university, college, domain, or mode to limit who sees this assignment.
        </p>
      ) : null}
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-2xl font-bold">
            <Sparkles className="size-6 text-primary" />
            AI Assignment Builder
          </DialogTitle>
          <DialogDescription>
            Choose assignment type, configure with AI, review, and publish to students.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-3 mb-6">
          {[
            { n: 1, label: "Configure" },
            { n: 2, label: "Review & Edit" },
          ].map(({ n, label }) => (
            <div
              key={n}
              className={`flex items-center gap-2 ${n < step ? "text-primary" : n === step ? "text-slate-900 font-bold" : "text-slate-400"}`}
            >
              <div
                className={`size-7 rounded-full flex items-center justify-center text-xs font-bold border-2 transition-all ${n < step ? "bg-primary text-white border-primary" : n === step ? "border-primary text-primary" : "border-slate-200 text-slate-400"}`}
              >
                {n < step ? <CheckCircle2 className="size-4" /> : n}
              </div>
              <span className="text-sm hidden sm:block">{label}</span>
              {n < 2 && <div className="w-8 h-px bg-slate-200 mx-1" />}
            </div>
          ))}
        </div>

        {configError ? (
          <div className="bg-orange-50 border border-orange-200 rounded-xl p-4 mb-4 flex gap-3">
            <AlertTriangle className="size-5 text-orange-500 shrink-0 mt-0.5" />
            <div>
              <p className="font-bold text-orange-800 text-sm">Gemini API not configured</p>
              <p className="text-orange-700 text-sm mt-1">{configError}</p>
              <p className="text-orange-700 text-sm mt-2">
                Local: add{" "}
                <code className="bg-orange-100 px-1 rounded">GEMINI_API_KEY=your-key</code> to{" "}
                <code className="bg-orange-100 px-1 rounded">.env</code> and run{" "}
                <code className="bg-orange-100 px-1 rounded">npm run dev</code>. Production (Vercel): Project
                Settings → Environment Variables → add{" "}
                <code className="bg-orange-100 px-1 rounded">GEMINI_API_KEY</code>, then redeploy. Key from{" "}
                <a
                  href="https://aistudio.google.com/app/apikey"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline font-bold"
                >
                  Google AI Studio
                </a>
                .
              </p>
            </div>
          </div>
        ) : null}

        {step === 1 && (
          <div className="space-y-5">
            <div className="space-y-2">
              <Label className="font-bold">Assignment type</Label>
              <Select
                value={assignmentType}
                onValueChange={(v) => {
                  setAssignmentType(v as AssignmentType);
                  setQuestions([]);
                  setStep(1);
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="mcq">MCQ (auto-graded)</SelectItem>
                  <SelectItem value="long_answer">Long answer</SelectItem>
                  <SelectItem value="file_upload">Links + file attachments</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="grid sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2 space-y-2">
                <Label className="font-bold">Assignment Title *</Label>
                <Input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. Python Fundamentals Assessment"
                />
              </div>
              <div className="sm:col-span-2 space-y-2">
                <Label className="font-bold">Topic / AI Prompt *</Label>
                <textarea
                  className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 min-h-[80px]"
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  placeholder={
                    isFileUpload
                      ? "e.g. Submit links to your Python basics project on GitHub and a Google Drive PDF report."
                      : "e.g. Python programming basics: variables, loops, functions, and data types."
                  }
                />
              </div>
              <div className="sm:col-span-2 space-y-2">
                <Label className="font-bold">Description (optional)</Label>
                <Input
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder={
                    isFileUpload
                      ? "Optional — AI can generate full instructions in the next step"
                      : "Brief description for students..."
                  }
                />
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {!isFileUpload ? (
                <div className="space-y-2">
                  <Label className="font-bold text-xs uppercase text-slate-500">No. of Questions</Label>
                  <Input
                    type="number"
                    min={1}
                    max={50}
                    value={numQuestions}
                    onChange={(e) => setNumQuestions(e.target.value)}
                    placeholder="5"
                  />
                  <p className="text-[10px] text-muted-foreground">Type 1–50 questions</p>
                </div>
              ) : (
                <div className="space-y-2">
                  <Label className="font-bold text-xs uppercase text-slate-500">Total Marks</Label>
                  <Input
                    type="number"
                    min={1}
                    value={fileUploadMarks}
                    onChange={(e) => setFileUploadMarks(e.target.value)}
                  />
                </div>
              )}

              {!isFileUpload ? (
                <div className="space-y-2">
                  <Label className="font-bold text-xs uppercase text-slate-500">Difficulty</Label>
                  <Select value={difficulty} onValueChange={setDifficulty}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="easy">Easy</SelectItem>
                      <SelectItem value="medium">Medium</SelectItem>
                      <SelectItem value="hard">Hard</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              ) : null}

              {!isFileUpload ? (
                <div className="space-y-2">
                  <Label className="font-bold text-xs uppercase text-slate-500">Marks / Question</Label>
                  <Select value={marksPerQ} onValueChange={setMarksPerQ}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {[1, 2, 4, 5, 10].map((n) => (
                        <SelectItem key={n} value={String(n)}>
                          {n} Mark{n > 1 ? "s" : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ) : null}

              <div className="space-y-2">
                <Label className="font-bold text-xs uppercase text-slate-500">Passing Percentage</Label>
                <Select value={passingPercent} onValueChange={setPassingPercent}>
                  <SelectTrigger className="w-48">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {[33, 40, 50, 60, 75].map((n) => (
                      <SelectItem key={n} value={String(n)}>
                        {n}%
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {!isFileUpload && isMcq ? (
              <div className="space-y-2">
                <Label className="font-bold text-xs uppercase text-slate-500">Duration (mins)</Label>
                <Select value={duration} onValueChange={setDuration}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {[10, 15, 20, 30, 45, 60].map((n) => (
                      <SelectItem key={n} value={String(n)}>
                        {n} min
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              ) : null}
            </div>

            <div className="bg-slate-50 rounded-xl p-4 border text-sm text-slate-600 flex flex-wrap gap-x-6 gap-y-1">
              <span>
                Type: <b>{assignmentTypeLabel(assignmentType)}</b>
              </span>
              {!isFileUpload ? (
                <span>
                  Questions: <b>{questionCount}</b>
                </span>
              ) : null}
              <span>
                Total marks: <b>{isFileUpload ? fileUploadMarks : questionCount * (parseInt(marksPerQ, 10) || 4)}</b>
              </span>
              {!isFileUpload ? (
                <span>
                  Duration: <b>{isMcq ? `${duration} min` : "None (long answer)"}</b>
                </span>
              ) : (
                <span>
                  Timer: <b>None (link submission)</b>
                </span>
              )}
              <span>
                Pass at: <b>{passingPercent}%</b>
              </span>
            </div>

            {renderAudienceSection()}
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4">
            <div className="flex items-center justify-between mb-2 gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="font-bold text-lg">{title}</p>
                  <Badge variant="outline">{assignmentTypeLabel(assignmentType)}</Badge>
                </div>
                <p className="text-sm text-slate-500">
                  {isFileUpload
                    ? `${totalMarks} total marks • no timer • manual grading`
                    : `${questions.length} questions • ${totalMarks} total marks • ${duration} min`}
                </p>
              </div>
              <Button variant="outline" size="sm" className="gap-1.5 shrink-0" onClick={() => setStep(1)}>
                <Pencil className="size-3.5" /> Edit Config
              </Button>
            </div>

            {isFileUpload ? (
              <Card className="p-4 border-l-4 border-l-amber-400">
                <Label className="text-xs font-bold uppercase text-slate-500 mb-2 block">
                  Student instructions (editable)
                </Label>
                <textarea
                  className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm min-h-[160px]"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Instructions for what students should submit (links to Drive, GitHub, etc.)..."
                />
                <p className="text-xs text-muted-foreground mt-2">
                  Students can paste links and/or attach PDF, JPG, or PNG files. No timer. You grade manually.
                </p>
              </Card>
            ) : (
              <>
                <div className="space-y-3">
                  {questions.map((q, idx) => (
                    <Card
                      key={idx}
                      className={`border-l-4 overflow-hidden transition-all ${isMcq && q.correct_option_index >= 0 ? "border-l-green-400" : "border-l-amber-400"}`}
                    >
                      <div
                        className="p-4 flex items-start gap-3 cursor-pointer hover:bg-slate-50"
                        onClick={() => setExpandedIdx(expandedIdx === idx ? null : idx)}
                      >
                        <span className="text-xs font-black bg-slate-100 text-slate-500 rounded-full size-6 flex items-center justify-center shrink-0 mt-0.5">
                          {idx + 1}
                        </span>
                        <p className="flex-1 font-medium text-slate-800 text-sm leading-relaxed">
                          {q.question_text}
                        </p>
                        <div className="flex items-center gap-2 shrink-0">
                          <Badge variant="outline" className="text-[9px]">
                            {q.question_type === "mcq" ? "MCQ" : "Long answer"}
                          </Badge>
                          <Badge variant="outline" className="text-xs">
                            {q.marks}M
                          </Badge>
                          {expandedIdx === idx ? (
                            <ChevronUp className="size-4 text-slate-400" />
                          ) : (
                            <ChevronDown className="size-4 text-slate-400" />
                          )}
                        </div>
                      </div>

                      {expandedIdx === idx && (
                        <div className="px-4 pb-4 space-y-4 border-t bg-slate-50">
                          <div className="pt-3 space-y-2">
                            <Label className="text-xs font-bold uppercase text-slate-500">Question Text</Label>
                            <textarea
                              className="flex w-full rounded-md border border-input bg-white px-3 py-2 text-sm min-h-[60px]"
                              value={q.question_text}
                              onChange={(e) => updateQuestion(idx, "question_text", e.target.value)}
                            />
                          </div>

                          {q.question_type === "mcq" ? (
                            <div className="space-y-2">
                              <Label className="text-xs font-bold uppercase text-slate-500">
                                Options (click radio to mark correct)
                              </Label>
                              {q.options.map((opt, optIdx) => (
                                <div
                                  key={optIdx}
                                  className={`flex items-center gap-3 p-2.5 rounded-lg border-2 transition-all ${q.correct_option_index === optIdx ? "border-green-400 bg-green-50" : "border-slate-100 bg-white"}`}
                                >
                                  <button
                                    type="button"
                                    onClick={() => updateQuestion(idx, "correct_option_index", optIdx)}
                                    className={`size-5 rounded-full border-2 flex items-center justify-center shrink-0 ${q.correct_option_index === optIdx ? "border-green-500" : "border-slate-300"}`}
                                  >
                                    {q.correct_option_index === optIdx && (
                                      <div className="size-2.5 rounded-full bg-green-500" />
                                    )}
                                  </button>
                                  <span className="text-xs font-mono font-bold text-slate-400">
                                    {String.fromCharCode(65 + optIdx)}
                                  </span>
                                  <Input
                                    value={opt}
                                    onChange={(e) => updateOption(idx, optIdx, e.target.value)}
                                    className="flex-1 h-8 text-sm border-none bg-transparent focus-visible:ring-0 p-0"
                                  />
                                  {q.correct_option_index === optIdx && (
                                    <CheckCircle2 className="size-4 text-green-500 shrink-0" />
                                  )}
                                </div>
                              ))}
                            </div>
                          ) : (
                            <p className="text-xs text-muted-foreground">
                              Long answer — students write as much as they need (no word limit).
                            </p>
                          )}

                          <div className="flex items-center justify-between pt-1">
                            <div className="flex items-center gap-2">
                              <Label className="text-xs font-bold uppercase text-slate-500">Marks:</Label>
                              <Select
                                value={String(q.marks)}
                                onValueChange={(v) => updateQuestion(idx, "marks", parseInt(v, 10))}
                              >
                                <SelectTrigger className="h-7 w-20 text-xs">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  {[1, 2, 4, 5, 10].map((n) => (
                                    <SelectItem key={n} value={String(n)}>
                                      {n}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="text-destructive hover:bg-destructive/10 gap-1.5"
                              onClick={() => deleteQuestion(idx)}
                            >
                              <Trash2 className="size-3.5" /> Remove
                            </Button>
                          </div>
                        </div>
                      )}
                    </Card>
                  ))}
                </div>

                <Button
                  type="button"
                  variant="outline"
                  className="w-full border-dashed gap-2 text-slate-500"
                  onClick={addQuestionManually}
                >
                  <Plus className="size-4" /> Add Question Manually
                </Button>
              </>
            )}

            {renderAudienceSection()}
          </div>
        )}

        <DialogFooter className="flex-col sm:flex-row gap-3 pt-4 border-t mt-4">
          {step === 1 ? (
            <Button
              type="button"
              className="w-full sm:w-auto gap-2 h-11 text-base"
              onClick={() => void generateWithAi()}
              disabled={generating}
            >
              {generating ? (
                <>
                  <Loader2 className="size-4 animate-spin" /> Generating with AI...
                </>
              ) : (
                <>
                  <Sparkles className="size-4" /> {generateButtonLabel}
                </>
              )}
            </Button>
          ) : (
            <>
              <Button
                type="button"
                variant="outline"
                className="w-full sm:w-auto gap-2"
                onClick={() => void generateWithAi()}
                disabled={generating}
              >
                {generating ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Sparkles className="size-4" />
                )}{" "}
                Regenerate
              </Button>
              <Button
                type="button"
                className="w-full sm:w-auto gap-2 h-11 text-base bg-green-600 hover:bg-green-700"
                onClick={() => void saveAssignment()}
                disabled={saving}
              >
                {saving ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Save className="size-4" />
                )}{" "}
                Save & Publish
                {recipientCount != null ? ` (${recipientCount})` : ""}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
