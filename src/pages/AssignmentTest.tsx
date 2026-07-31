import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { countWords, fetchAssignmentTakePayload, submitAssignmentGraded } from "@/lib/assignmentTake";
import {
  ASSIGNMENT_FILE_ANSWER_KEY,
  ASSIGNMENT_FILES_MAX,
  ASSIGNMENT_LINKS_MAX,
  ASSIGNMENT_UPLOAD_ACCEPT,
  buildWorkSubmissionPayload,
  type AssignmentType,
  uploadStudentAssignmentFiles,
  validateAssignmentUploadFile,
  validateWorkSubmission,
} from "@/lib/assignmentApi";
import { SubmissionLinksList } from "@/components/SubmissionLinksList";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, AlertTriangle, Clock, Camera, CheckCircle2, Link2, Plus, Trash2, Paperclip } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const MAX_WARNINGS = 3;

async function requestProctorFullscreen(): Promise<boolean> {
  const el = document.documentElement as HTMLElement & {
    webkitRequestFullscreen?: () => Promise<void>;
  };
  try {
    if (el.requestFullscreen) {
      await el.requestFullscreen();
      return Boolean(document.fullscreenElement);
    }
    if (el.webkitRequestFullscreen) {
      await el.webkitRequestFullscreen();
      return Boolean(
        document.fullscreenElement ||
          (document as Document & { webkitFullscreenElement?: Element }).webkitFullscreenElement
      );
    }
  } catch {
    return false;
  }
  return false;
}


export default function AssignmentTest() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [isMobile, setIsMobile] = useState(() => {
    if (typeof window === "undefined") return false;
    const userAgent = navigator.userAgent || navigator.vendor || (window as any).opera;
    return /android/i.test(userAgent) || /iPad|iPhone|iPod/.test(userAgent) || window.innerWidth < 768;
  });
  const [assignment, setAssignment] = useState<any>(null);
  const [assignmentType, setAssignmentType] = useState<AssignmentType>("mcq");
  const [questions, setQuestions] = useState<any[]>([]);
  const [answers, setAnswers] = useState<Record<string, number | string>>({});
  const [workLinks, setWorkLinks] = useState<string[]>([""]);
  const [attachFiles, setAttachFiles] = useState<File[]>([]);
  const [linkNote, setLinkNote] = useState("");
  const [requiresProctoring, setRequiresProctoring] = useState(false);
  const [isTimed, setIsTimed] = useState(false);
  const [testStarted, setTestStarted] = useState(false);
  const [starting, setStarting] = useState(false);

  const [warnings, setWarnings] = useState(0);
  const [isWarningOpen, setIsWarningOpen] = useState(false);
  const [warningMessage, setWarningMessage] = useState("");
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const hasEnteredFullscreenRef = useRef(false);
  const proctorActiveRef = useRef(false);

  const [timeLeft, setTimeLeft] = useState<number | null>(null);
  const [isResubmit, setIsResubmit] = useState(false);

  useEffect(() => {
    if (!isTimed || timeLeft === null || !testStarted) return;
    let timerId: ReturnType<typeof setInterval>;
    if (timeLeft > 0) {
      timerId = setInterval(() => setTimeLeft((prev) => (prev as number) - 1), 1000);
    } else if (timeLeft === 0) {
      toast.error("Time is up! Auto-submitting...");
      handleSubmit();
    }
    return () => clearInterval(timerId);
  }, [timeLeft, isTimed, testStarted]);

  const loadAssignment = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return navigate("/login");

      const { data: existing } = await supabase
        .from("assignment_submissions")
        .select("id")
        .eq("assignment_id", id)
        .eq("student_id", session.user.id)
        .maybeSingle();
      setIsResubmit(!!existing);

      const payload = await fetchAssignmentTakePayload(supabase, id!);
      const assgn = payload.assignment;
      const assgnType = (assgn?.assignment_type || "mcq") as AssignmentType;
      if (!assgn?.is_active) {
        toast.error("Assignment not found or inactive.");
        navigate("/dashboard");
        return;
      }

      const qs = payload.questions || [];
      const hasMcq = assgnType === "mcq" && qs.some((q: { question_type?: string }) => (q.question_type || "mcq") === "mcq");
      const timed = hasMcq;
      setAssignmentType(assgnType);
      setRequiresProctoring(hasMcq);
      setIsTimed(timed);
      setAssignment(assgn);
      setQuestions(qs);

      if (assgn.due_at && new Date(assgn.due_at).getTime() < Date.now()) {
        toast.error("This assignment deadline has passed.");
        navigate("/dashboard");
        return;
      }

      if (hasMcq) {
        setTimeLeft(null);
      } else {
        setTestStarted(true);
        setTimeLeft(timed ? assgn.duration_minutes * 60 : null);
      }

    } catch (err: any) {
      console.error(err);
      toast.error(err.message || "Failed to load assignment");
      navigate("/dashboard");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAssignment();
  }, []);

  /** Bind camera stream after the preview <video> is mounted (post-loading). */
  useEffect(() => {
    if (!requiresProctoring || !testStarted || loading) return;

    const video = videoRef.current;
    const stream = streamRef.current;
    if (!video || !stream) return;

    video.srcObject = stream;
    void video.play().catch(() => undefined);

    return () => {
      if (video.srcObject === stream) {
        video.srcObject = null;
      }
    };
  }, [requiresProctoring, testStarted, loading]);

  const handleStartAssessment = async () => {
    if (starting || testStarted || !assignment) return;
    setStarting(true);
    try {
      const fullscreenOk = await requestProctorFullscreen();
      if (!fullscreenOk) {
        toast.error("Full screen is required. Allow full screen when prompted, then click Start Assessment again.");
        return;
      }
      hasEnteredFullscreenRef.current = true;

      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } },
        audio: true,
      });
      streamRef.current = stream;

      setTimeLeft(assignment.duration_minutes * 60);
      setTestStarted(true);
    } catch {
      toast.error("Camera and microphone access are required to start this assessment.");
      if (document.fullscreenElement) {
        await document.exitFullscreen().catch(() => undefined);
      }
      hasEnteredFullscreenRef.current = false;
    } finally {
      setStarting(false);
    }
  };

  useEffect(() => {
    if (!requiresProctoring || !testStarted) return;
    proctorActiveRef.current = true;

    const handleVisibilityChange = () => {
      if (document.hidden) {
        triggerWarning("Tab switching detected. Do not leave the test environment.");
      }
    };

    const handleFullscreenChange = () => {
      const fsEl =
        document.fullscreenElement ||
        (document as Document & { webkitFullscreenElement?: Element }).webkitFullscreenElement;
      if (fsEl) {
        hasEnteredFullscreenRef.current = true;
        return;
      }
      if (!proctorActiveRef.current || !hasEnteredFullscreenRef.current) return;
      triggerWarning("You exited full screen mode. Stay in full screen during the test.");
      void requestProctorFullscreen().then((ok) => {
        if (!ok) {
          toast.warning("Return to full screen to continue the proctored test.");
        }
      });
    };

    const handleCopyPaste = (e: ClipboardEvent) => {
      e.preventDefault();
      triggerWarning("Copy-pasting is strictly prohibited.");
    };

    const handleContextMenu = (e: MouseEvent) => {
      e.preventDefault();
      triggerWarning("Right-clicking is disabled.");
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    document.addEventListener("fullscreenchange", handleFullscreenChange);
    document.addEventListener("webkitfullscreenchange", handleFullscreenChange as EventListener);
    document.addEventListener("copy", handleCopyPaste);
    document.addEventListener("paste", handleCopyPaste);
    document.addEventListener("contextmenu", handleContextMenu);

    return () => {
      proctorActiveRef.current = false;
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
      document.removeEventListener("webkitfullscreenchange", handleFullscreenChange as EventListener);
      document.removeEventListener("copy", handleCopyPaste);
      document.removeEventListener("paste", handleCopyPaste);
      document.removeEventListener("contextmenu", handleContextMenu);
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
      if (document.fullscreenElement) {
        document.exitFullscreen().catch(() => undefined);
      }
    };
  }, [requiresProctoring, testStarted]);

  const triggerWarning = (msg: string) => {
    setWarnings(prev => {
      const newCount = prev + 1;
      setWarningMessage(msg);
      setIsWarningOpen(true);

      if (newCount >= MAX_WARNINGS) {
        toast.error(`Maximum warnings reached (${MAX_WARNINGS}). Auto-submitting assignment.`);
        handleSubmit(true, newCount);
      }
      return newCount;
    });
  };

  const updateWorkLink = (index: number, value: string) => {
    setWorkLinks((prev) => prev.map((link, i) => (i === index ? value : link)));
  };

  const addWorkLink = () => {
    setWorkLinks((prev) => (prev.length >= ASSIGNMENT_LINKS_MAX ? prev : [...prev, ""]));
  };

  const removeWorkLink = (index: number) => {
    setWorkLinks((prev) => (prev.length <= 1 ? prev : prev.filter((_, i) => i !== index)));
  };

  const handleSubmit = async (isForced = false, finalWarnings = warnings) => {
    if (submitting) return;

    let submitAnswers: Record<string, unknown> = { ...answers };

    if (assignmentType === "file_upload") {
      const submitErr = validateWorkSubmission(workLinks, attachFiles);
      if (submitErr) return toast.error(submitErr);
    } else {
      for (const q of questions) {
        const qType = q.question_type || "mcq";
        if (qType === "long_answer") {
          const text = String(answers[q.id] || "").trim();
          if (!text) {
            return toast.error(`Please answer question ${questions.indexOf(q) + 1}.`);
          }
        } else if (answers[q.id] === undefined) {
          return toast.error("Please answer all MCQ questions.");
        }
      }
    }

    setSubmitting(true);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      if (assignmentType === "file_upload") {
        const uploaded =
          attachFiles.length > 0
            ? await uploadStudentAssignmentFiles(supabase, id!, session.user.id, attachFiles)
            : [];
        submitAnswers = {
          [ASSIGNMENT_FILE_ANSWER_KEY]: buildWorkSubmissionPayload(workLinks, uploaded, linkNote),
        };
      }

      const result = await submitAssignmentGraded(supabase, {
        assignmentId: id!,
        answers: submitAnswers,
        warningsReceived: finalWarnings,
        cheatingDetected: finalWarnings > 0,
      });

      toast.success(
        isResubmit ? "Assignment updated successfully." : "Assignment submitted successfully."
      );

      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop());
      }
      if (document.fullscreenElement) {
        document.exitFullscreen().catch(e => console.log(e));
      }

      navigate(`/assignment/${id}/result`);

    } catch (err: any) {
      toast.error(err.message || "Submission failed");
      setSubmitting(false);
    }
  };

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const previewLinks = workLinks.map((l) => l.trim()).filter(Boolean);

  if (loading) return <div className="min-h-screen flex items-center justify-center bg-slate-900"><Loader2 className="size-10 animate-spin text-primary" /></div>;

  if (isMobile && requiresProctoring) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-900 text-white p-6 text-center">
        <AlertTriangle className="size-16 text-destructive mb-6" />
        <h1 className="text-2xl font-bold mb-4">Mobile Devices Not Supported</h1>
        <p className="text-slate-400 mb-8 max-w-md">
          To ensure strict proctoring and a secure testing environment, this assessment can only be taken on a PC or Laptop. Please switch to a computer to continue.
        </p>
        <Button variant="outline" className="border-slate-700 text-slate-300 hover:bg-slate-800" onClick={() => navigate("/dashboard")}>
          Return to Dashboard
        </Button>
      </div>
    );
  }

  if (requiresProctoring && !testStarted) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-900 p-6">
        <Card className="max-w-lg w-full p-8 shadow-2xl border-none">
          <div className="text-center mb-6">
            <div className="size-14 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
              <Camera className="size-7 text-primary" />
            </div>
            <h1 className="text-2xl font-black text-slate-900">{assignment?.title}</h1>
            <p className="text-sm text-muted-foreground mt-2">
              {questions.length} questions • {assignment?.duration_minutes} minutes • {assignment?.total_marks} marks
            </p>
          </div>
          <div className="rounded-xl bg-amber-50 border border-amber-200 p-4 mb-6 text-sm text-amber-950 space-y-2">
            <p className="font-bold flex items-center gap-2">
              <AlertTriangle className="size-4 shrink-0" /> Proctored assessment rules
            </p>
            <ul className="list-disc pl-5 space-y-1 text-amber-900/90">
              <li>Clicking <strong>Start Assessment</strong> will enable <strong>full screen</strong>, camera, and microphone.</li>
              <li>Do not switch tabs, exit full screen, copy-paste, or right-click.</li>
              <li>You get {MAX_WARNINGS} warnings — the test auto-submits after that.</li>
            </ul>
          </div>
          {assignment?.description ? (
            <p className="text-sm text-slate-600 whitespace-pre-wrap mb-6">{assignment.description}</p>
          ) : null}
          <Button
            className="w-full h-12 text-base font-bold gap-2"
            disabled={starting}
            onClick={() => void handleStartAssessment()}
          >
            {starting ? <Loader2 className="size-5 animate-spin" /> : <CheckCircle2 className="size-5" />}
            Start Assessment
          </Button>
          <Button
            variant="ghost"
            className="w-full mt-2"
            disabled={starting}
            onClick={() => navigate("/dashboard")}
          >
            Back to Dashboard
          </Button>
        </Card>
      </div>
    );
  }

  const isLinkAssignment = assignmentType === "file_upload";
  const isLongAnswerAssignment = assignmentType === "long_answer";

  return (
    <div className={`min-h-screen flex flex-col ${requiresProctoring ? "select-none" : ""} ${isLinkAssignment || isLongAnswerAssignment ? "bg-slate-50" : "bg-slate-100"}`}>
      <header className="sticky top-0 bg-white border-b px-6 py-4 flex flex-wrap items-center justify-between gap-4 shadow-sm z-50">
        <div>
          <h1 className="font-bold text-xl">{assignment?.title}</h1>
          <p className="text-sm text-muted-foreground">
            {isLinkAssignment
              ? "Submit links and/or file attachments"
              : isLongAnswerAssignment
                ? `${questions.length} long-answer question${questions.length === 1 ? "" : "s"}`
                : `${questions.length} Questions`}{" "}
            • {assignment?.total_marks} Marks
          </p>
        </div>
        <div className="flex items-center gap-4 flex-wrap">
          {requiresProctoring ? (
          <div className={`flex items-center gap-2 font-bold px-4 py-2 rounded-full ${warnings > 0 ? 'bg-destructive/10 text-destructive' : 'bg-green-100 text-green-700'}`}>
            <AlertTriangle className="size-4" /> Warnings: {warnings}/{MAX_WARNINGS}
          </div>
          ) : isLinkAssignment ? (
            <Badge variant="secondary" className="gap-1 px-3 py-1.5 text-xs">
              <Link2 className="size-3.5" /> No time limit
            </Badge>
          ) : isLongAnswerAssignment ? (
            <Badge variant="secondary" className="gap-1 px-3 py-1.5 text-xs">
              <Clock className="size-3.5" /> Take your time — no timer
            </Badge>
          ) : null}
          {isTimed && timeLeft !== null ? (
          <div className="flex items-center gap-2 font-mono text-xl bg-slate-900 text-white px-4 py-2 rounded-full shadow-inner">
            <Clock className="size-5" /> {formatTime(timeLeft)}
          </div>
          ) : null}
          <Button onClick={() => handleSubmit(false)} disabled={submitting} className="gap-2">
            {submitting ? <Loader2 className="size-4 animate-spin" /> : <CheckCircle2 className="size-4" />}
            {isLinkAssignment ? (isResubmit ? "Update submission" : "Submit work") : isResubmit ? "Update submission" : "Submit"}
          </Button>
        </div>
      </header>

      {isResubmit ? (
        <div className="bg-amber-50 border-b border-amber-200 px-6 py-3 text-sm text-amber-950 text-center">
          You already submitted this assignment. Submit again anytime to replace your previous work.
        </div>
      ) : null}

      <main className="flex-1 container max-w-4xl py-8 pb-32">
        <div className="space-y-8">
          {assignment?.description ? (
            <Card className="p-5 bg-blue-50/60 border-blue-100">
              <p className="text-sm font-semibold text-blue-900 mb-1">Instructions</p>
              <p className="text-sm whitespace-pre-wrap text-slate-700">{assignment.description}</p>
              {assignment.due_at ? (
                <p className="text-xs text-muted-foreground mt-3">
                  Submit before: {new Date(assignment.due_at).toLocaleString()}
                </p>
              ) : null}
            </Card>
          ) : null}

          {isLinkAssignment ? (
            <Card className="p-6 shadow-sm border-t-4 border-t-primary">
              <div className="flex items-start gap-3 mb-5">
                <div className="size-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                  <Link2 className="size-5 text-primary" />
                </div>
                <div>
                  <h3 className="font-bold text-lg">Submit your work</h3>
                  <p className="text-sm text-muted-foreground mt-1">
                    Add links (Google Drive, GitHub, Figma, etc.) and/or attach PDF or image files.
                    Submit at least one link or one file.
                  </p>
                </div>
              </div>

              <div className="space-y-4">
                {workLinks.map((link, idx) => (
                  <div key={idx} className="space-y-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <Label htmlFor={`work-link-${idx}`} className="text-xs font-bold uppercase text-muted-foreground">
                        Link {idx + 1}
                      </Label>
                      {workLinks.length > 1 ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-7 text-destructive hover:text-destructive"
                          onClick={() => removeWorkLink(idx)}
                        >
                          <Trash2 className="size-3.5 mr-1" /> Remove
                        </Button>
                      ) : null}
                    </div>
                    <Input
                      id={`work-link-${idx}`}
                      type="url"
                      placeholder="https://drive.google.com/... or github.com/your-repo"
                      value={link}
                      onChange={(e) => updateWorkLink(idx, e.target.value)}
                      className="font-mono text-sm"
                    />
                  </div>
                ))}

                {workLinks.length < ASSIGNMENT_LINKS_MAX ? (
                  <Button type="button" variant="outline" size="sm" className="gap-1" onClick={addWorkLink}>
                    <Plus className="size-3.5" /> Add another link
                  </Button>
                ) : null}

                <div className="space-y-3 pt-4 border-t">
                  <div className="flex items-center gap-2">
                    <Paperclip className="size-4 text-primary" />
                    <Label className="text-xs font-bold uppercase text-muted-foreground">
                      File attachments (PDF, JPG, PNG)
                    </Label>
                  </div>
                  <Input
                    type="file"
                    accept={ASSIGNMENT_UPLOAD_ACCEPT}
                    multiple
                    className="text-sm"
                    onChange={(e) => {
                      const picked = Array.from(e.target.files || []);
                      if (!picked.length) return;
                      const combined = [...attachFiles, ...picked].slice(0, ASSIGNMENT_FILES_MAX);
                      if (combined.length > ASSIGNMENT_FILES_MAX) {
                        toast.error(`You can attach up to ${ASSIGNMENT_FILES_MAX} files.`);
                      }
                      for (const file of picked) {
                        const err = validateAssignmentUploadFile(file);
                        if (err) {
                          toast.error(err);
                          e.target.value = "";
                          return;
                        }
                      }
                      setAttachFiles(combined);
                      e.target.value = "";
                    }}
                  />
                  {attachFiles.length > 0 ? (
                    <ul className="space-y-2">
                      {attachFiles.map((file, idx) => (
                        <li
                          key={`${file.name}-${idx}`}
                          className="flex items-center justify-between gap-2 rounded-lg border bg-muted/30 px-3 py-2 text-sm"
                        >
                          <span className="truncate">
                            {file.name} ({(file.size / 1024 / 1024).toFixed(2)} MB)
                          </span>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-7 text-destructive hover:text-destructive shrink-0"
                            onClick={() => setAttachFiles((prev) => prev.filter((_, i) => i !== idx))}
                          >
                            <Trash2 className="size-3.5" />
                          </Button>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-xs text-muted-foreground">No files selected yet.</p>
                  )}
                </div>

                <div className="space-y-1.5 pt-2">
                  <Label htmlFor="link-note" className="text-xs font-bold uppercase text-muted-foreground">
                    Optional note for admin
                  </Label>
                  <Textarea
                    id="link-note"
                    placeholder="e.g. Main project is Link 1, documentation is Link 2"
                    value={linkNote}
                    onChange={(e) => setLinkNote(e.target.value)}
                    className="min-h-[80px] text-sm"
                  />
                </div>

                {(previewLinks.length > 0 || attachFiles.length > 0 || linkNote.trim()) ? (
                  <div className="rounded-lg border border-dashed p-4 bg-muted/30 space-y-3">
                    <p className="text-xs font-bold uppercase text-muted-foreground">Preview</p>
                    {previewLinks.length > 0 ? (
                      <SubmissionLinksList links={previewLinks} compact />
                    ) : null}
                    {attachFiles.length > 0 ? (
                      <ul className="text-sm space-y-1">
                        {attachFiles.map((file, idx) => (
                          <li key={`${file.name}-${idx}`} className="text-slate-700">
                            📎 {file.name} ({(file.size / 1024 / 1024).toFixed(2)} MB)
                          </li>
                        ))}
                      </ul>
                    ) : null}
                    {linkNote.trim() ? (
                      <p className="text-sm text-slate-600 whitespace-pre-wrap">
                        <span className="font-medium">Note:</span> {linkNote.trim()}
                      </p>
                    ) : null}
                  </div>
                ) : null}
              </div>
            </Card>
          ) : null}

          {questions.map((q, idx) => {
            const qType = q.question_type || "mcq";
            const opts = Array.isArray(q.options)
              ? (q.options as string[])
              : (typeof q.options === "string"
                  ? JSON.parse(q.options || "[]")
                  : []) as string[];
            const answerText = String(answers[q.id] || "");
            return (
            <Card key={q.id} className="p-6 shadow-sm border-t-4 border-t-transparent hover:border-t-primary transition-all">
              <div className="flex justify-between items-start mb-4 gap-4">
                <h3 className="font-bold text-lg leading-snug">
                  <span className="text-muted-foreground mr-2">Q{idx + 1}.</span> {q.question_text}
                  <Badge variant="outline" className="ml-2 text-[10px] align-middle">{qType === "long_answer" ? "Long answer" : "MCQ"}</Badge>
                </h3>
                <span className="text-xs font-bold bg-muted px-2 py-1 rounded shrink-0">[{q.marks} Marks]</span>
              </div>
              {qType === "long_answer" ? (
                <div className="space-y-2">
                  <Textarea
                    className="min-h-[260px] rounded-xl border-2 p-4 text-sm leading-relaxed focus-visible:ring-primary"
                    placeholder="Write your answer here. Take your time — there is no word limit or timer for long-answer assignments."
                    value={answerText}
                    onChange={(e) => setAnswers((prev) => ({ ...prev, [q.id]: e.target.value }))}
                  />
                  <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
                    <span>{answerText.length} characters</span>
                    <span>{countWords(answerText)} words</span>
                  </div>
                </div>
              ) : (
              <div className="space-y-3">
                {opts.map((opt: string, optIdx: number) => {
                  const isSelected = answers[q.id] === optIdx;
                  return (
                    <div
                      key={optIdx}
                      onClick={() => setAnswers(prev => ({ ...prev, [q.id]: optIdx }))}
                      className={`p-4 rounded-xl border-2 cursor-pointer transition-all flex items-center gap-3
                        ${isSelected ? 'border-primary bg-primary/5 shadow-sm' : 'border-muted hover:border-slate-300 hover:bg-slate-50'}
                      `}
                    >
                      <div className={`size-5 rounded-full border-2 flex items-center justify-center ${isSelected ? 'border-primary' : 'border-slate-300'}`}>
                        {isSelected && <div className="size-2.5 rounded-full bg-primary" />}
                      </div>
                      <span className={`${isSelected ? 'font-bold text-slate-900' : 'text-slate-700'}`}>{opt}</span>
                    </div>
                  );
                })}
              </div>
              )}
            </Card>
          );})}
        </div>
      </main>

      {requiresProctoring ? (
      <div className="fixed bottom-6 right-6 w-48 aspect-video rounded-xl overflow-hidden shadow-2xl border-4 border-slate-900 bg-black z-50">
        <div className="absolute top-2 right-2 z-10 flex items-center gap-1 bg-red-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full animate-pulse">
          <span className="size-1.5 rounded-full bg-white"></span> REC
        </div>
        <video
          ref={videoRef}
          autoPlay
          muted
          playsInline
          className="absolute inset-0 w-full h-full object-cover scale-x-[-1] bg-black"
        />
        <div className="absolute bottom-0 inset-x-0 z-10 bg-slate-900/80 text-white text-xs text-center py-1 flex items-center justify-center gap-1">
          <Camera className="size-3" /> AI Proctor Active
        </div>
      </div>
      ) : null}

      <Dialog open={isWarningOpen} onOpenChange={setIsWarningOpen}>
        <DialogContent className="sm:max-w-md border-destructive/20 border-2 shadow-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="size-5" /> Warning Received!
            </DialogTitle>
            <DialogDescription className="text-base text-slate-700 font-medium py-4">
              {warningMessage}
            </DialogDescription>
          </DialogHeader>
          <div className="bg-destructive/10 p-3 rounded-lg text-sm text-destructive font-bold text-center">
            You have received {warnings} out of {MAX_WARNINGS} warnings.<br/>
            Your assignment will be automatically submitted if you reach the limit.
          </div>
          <DialogFooter className="sm:justify-center">
            <Button
              variant="default"
              className="w-full sm:w-auto"
              onClick={() => {
                setIsWarningOpen(false);
                if (requiresProctoring && !document.fullscreenElement) {
                  void requestProctorFullscreen();
                }
              }}
            >
              I Understand, Continue Test
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
