import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  Award,
  BookOpen,
  CheckCircle2,
  Download,
  GraduationCap,
  Loader2,
  PlayCircle,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  listStudentEnrollments,
  type Enrollment,
} from "@/lib/coursesApi";

type Props = {
  studentId: string;
  compact?: boolean;
  onViewAll?: () => void;
};

function statusLabel(enrollment: Enrollment) {
  if (enrollment.status === "completed") return "Completed";
  if (enrollment.progress_percent <= 0) return "Not Started";
  if (enrollment.progress_percent >= 100) return "Completed";
  return "In Progress";
}

function statusBadgeVariant(enrollment: Enrollment): "default" | "secondary" | "outline" {
  const label = statusLabel(enrollment);
  if (label === "Completed") return "default";
  if (label === "In Progress") return "secondary";
  return "outline";
}

export function StudentMyCoursesPanel({ studentId, compact, onViewAll }: Props) {
  const [loading, setLoading] = useState(true);
  const [enrollments, setEnrollments] = useState<Enrollment[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const rows = await listStudentEnrollments(supabase, studentId);
        if (!cancelled) setEnrollments(rows);
      } catch (err) {
        console.warn("[my-courses] load failed:", err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [studentId]);

  const grouped = useMemo(() => {
    const active = enrollments.filter((e) => e.status === "active");
    const completed = enrollments.filter((e) => e.status === "completed");
    const inProgress = active.filter((e) => e.progress_percent > 0 && e.progress_percent < 100);
    const notStarted = active.filter((e) => e.progress_percent <= 0);
    const continueLearning = [...inProgress, ...notStarted].slice(0, compact ? 2 : undefined);
    return { continueLearning, completed, inProgress, notStarted, all: enrollments };
  }, [enrollments, compact]);

  if (loading) {
    return (
      <div className="flex justify-center py-8">
        <Loader2 className="size-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!enrollments.length) {
    if (compact) return null;
    return (
      <Card className="rounded-2xl border-dashed border-slate-200 p-10 text-center">
        <GraduationCap className="mx-auto mb-4 size-12 text-slate-300" />
        <h3 className="mb-2 text-lg font-black text-slate-800">No courses yet</h3>
        <p className="mb-6 text-sm text-slate-500">Browse our catalogue and enroll in a course to get started.</p>
        <Button className="rounded-xl font-bold" asChild>
          <Link to="/courses">Browse Courses</Link>
        </Button>
      </Card>
    );
  }

  const renderEnrollmentCard = (enrollment: Enrollment) => {
    const course = enrollment.course;
    if (!course) return null;
    const label = statusLabel(enrollment);

    return (
      <Card key={enrollment.id} className="overflow-hidden rounded-2xl border-slate-200/80 shadow-soft">
        <div className="flex flex-col sm:flex-row">
          <div className="relative aspect-[16/10] w-full shrink-0 bg-slate-100 sm:w-48">
            {course.thumbnail_url ? (
              <img src={course.thumbnail_url} alt={course.title} className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full items-center justify-center">
                <BookOpen className="size-10 text-slate-300" />
              </div>
            )}
          </div>
          <div className="flex flex-1 flex-col p-5">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <Badge variant={statusBadgeVariant(enrollment)} className="font-bold capitalize">
                {label}
              </Badge>
              {course.is_free ? (
                <Badge variant="outline" className="font-semibold text-emerald-600">
                  Free
                </Badge>
              ) : null}
            </div>
            <h4 className="mb-1 font-bold text-slate-900">{course.title}</h4>
            {course.instructor_name ? (
              <p className="mb-3 text-xs text-slate-500">Instructor: {course.instructor_name}</p>
            ) : null}
            <div className="mb-4 space-y-2">
              <div className="flex justify-between text-xs font-semibold text-slate-500">
                <span>Progress</span>
                <span>{Math.round(enrollment.progress_percent)}%</span>
              </div>
              <Progress value={enrollment.progress_percent} className="h-2" />
            </div>
            <div className="mt-auto flex flex-wrap gap-2">
              <Button size="sm" className="rounded-xl font-bold gap-2" asChild>
                <Link to={`/courses/${course.slug}`}>
                  {label === "Completed" ? (
                    <>
                      <CheckCircle2 className="size-4" /> Review
                    </>
                  ) : (
                    <>
                      <PlayCircle className="size-4" /> Continue
                    </>
                  )}
                </Link>
              </Button>
              {label === "Completed" ? (
                <Button
                  size="sm"
                  variant="outline"
                  className="rounded-xl font-bold gap-2"
                  onClick={() => toast.info("Certificate download will be available soon.")}
                >
                  <Download className="size-4" />
                  Certificate
                </Button>
              ) : null}
            </div>
          </div>
        </div>
      </Card>
    );
  };

  if (compact) {
    return (
      <section className="rounded-2xl border border-emerald-200/60 bg-emerald-50/50 p-6">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <GraduationCap className="size-5 text-emerald-600" />
            <h3 className="font-black text-slate-900">My Courses</h3>
            <Badge className="border-none bg-emerald-600 font-bold">{enrollments.length}</Badge>
          </div>
          {onViewAll ? (
            <Button variant="ghost" size="sm" className="font-bold text-emerald-700" onClick={onViewAll}>
              View All
            </Button>
          ) : null}
        </div>
        <div className="grid gap-4 md:grid-cols-2">{grouped.continueLearning.map(renderEnrollmentCard)}</div>
      </section>
    );
  }

  return (
    <div className="space-y-10">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="flex items-center gap-3 text-2xl font-black text-slate-900">
            <GraduationCap className="size-7 text-emerald-600" />
            My Courses
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            {enrollments.length} enrolled · {grouped.completed.length} completed
          </p>
        </div>
        <Button variant="outline" className="rounded-xl font-bold" asChild>
          <Link to="/courses">Browse More Courses</Link>
        </Button>
      </div>

      {grouped.continueLearning.length > 0 ? (
        <section>
          <h3 className="mb-4 flex items-center gap-2 text-lg font-black text-slate-800">
            <PlayCircle className="size-5 text-primary" />
            Continue Learning
          </h3>
          <div className="grid gap-4 lg:grid-cols-2">{grouped.continueLearning.map(renderEnrollmentCard)}</div>
        </section>
      ) : null}

      {grouped.notStarted.length > 0 ? (
        <section>
          <h3 className="mb-4 text-lg font-black text-slate-800">Not Started</h3>
          <div className="grid gap-4 lg:grid-cols-2">{grouped.notStarted.map(renderEnrollmentCard)}</div>
        </section>
      ) : null}

      {grouped.completed.length > 0 ? (
        <section>
          <h3 className="mb-4 flex items-center gap-2 text-lg font-black text-slate-800">
            <Award className="size-5 text-emerald-600" />
            Completed
          </h3>
          <div className="grid gap-4 lg:grid-cols-2">{grouped.completed.map(renderEnrollmentCard)}</div>
        </section>
      ) : null}
    </div>
  );
}

/** Compact preview for StudentHomeView — exported for enrollment count checks */
export function useStudentCourseEnrollments(studentId: string | null) {
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!studentId) {
      setCount(0);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const rows = await listStudentEnrollments(supabase, studentId);
        if (!cancelled) setCount(rows.length);
      } catch {
        if (!cancelled) setCount(0);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [studentId]);

  return { count, loading };
}
