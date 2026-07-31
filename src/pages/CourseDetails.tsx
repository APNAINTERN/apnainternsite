import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  Award,
  BookOpen,
  CheckCircle2,
  ChevronDown,
  Clock,
  Heart,
  Loader2,
  Share2,
  Star,
  Users,
} from "lucide-react";
import { SiteNav } from "@/components/SiteNav";
import { SiteFooter } from "@/components/SiteFooter";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { CourseCard } from "@/components/courses/CourseCard";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  addToWishlist,
  effectiveCoursePrice,
  formatCoursePrice,
  getCourseBySlug,
  isCourseWishlisted,
  isStudentEnrolled,
  listCourses,
  removeFromWishlist,
  type Course,
  type CourseDetail,
  type Enrollment,
} from "@/lib/coursesApi";

export default function CourseDetails() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [course, setCourse] = useState<CourseDetail | null>(null);
  const [related, setRelated] = useState<Course[]>([]);
  const [userId, setUserId] = useState<string | null>(null);
  const [enrollment, setEnrollment] = useState<Enrollment | null>(null);
  const [wishlisted, setWishlisted] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

  useEffect(() => {
    if (!slug) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const { data: sessionData } = await supabase.auth.getSession();
        const uid = sessionData.session?.user?.id || null;
        if (!cancelled) setUserId(uid);

        const detail = await getCourseBySlug(supabase, slug);
        if (cancelled) return;
        if (!detail) {
          setCourse(null);
          return;
        }
        setCourse(detail);

        const relatedRows = await listCourses(supabase, {
          category: detail.category_id || undefined,
          limit: 4,
        });
        if (!cancelled) {
          setRelated(relatedRows.filter((c) => c.id !== detail.id).slice(0, 3));
        }

        if (uid) {
          const [enr, wish] = await Promise.all([
            isStudentEnrolled(supabase, uid, detail.id),
            isCourseWishlisted(supabase, uid, detail.id),
          ]);
          if (!cancelled) {
            setEnrollment(enr);
            setWishlisted(wish);
          }
        }
      } catch (err) {
        console.warn("[course-details] load failed:", err);
        toast.error("Could not load course details.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [slug]);

  const handleEnroll = async () => {
    if (!course) return;
    if (enrollment) {
      navigate("/dashboard?view=courses");
      return;
    }
    // Funnel: form (if needed) → college-fee payment → course enrollment
    navigate(`/courses/${course.slug}/enroll`);
  };

  const toggleWishlist = async () => {
    if (!course || !userId) {
      navigate("/login", { state: { from: `/courses/${course?.slug}` } });
      return;
    }
    setActionLoading(true);
    try {
      if (wishlisted) {
        await removeFromWishlist(supabase, userId, course.id);
        setWishlisted(false);
        toast.success("Removed from wishlist.");
      } else {
        await addToWishlist(supabase, userId, course.id);
        setWishlisted(true);
        toast.success("Added to wishlist.");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Wishlist update failed.");
    } finally {
      setActionLoading(false);
    }
  };

  const handleShare = async () => {
    const url = window.location.href;
    try {
      if (navigator.share) {
        await navigator.share({ title: course?.title, url });
      } else {
        await navigator.clipboard.writeText(url);
        toast.success("Link copied to clipboard.");
      }
    } catch {
      /* user cancelled share */
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen flex-col bg-slate-50">
        <SiteNav />
        <div className="flex flex-1 items-center justify-center">
          <Loader2 className="size-10 animate-spin text-primary" />
        </div>
        <SiteFooter />
      </div>
    );
  }

  if (!course) {
    return (
      <div className="flex min-h-screen flex-col bg-slate-50">
        <SiteNav />
        <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6">
          <BookOpen className="size-16 text-slate-300" />
          <h1 className="text-2xl font-black text-slate-800">Course not found</h1>
          <Button asChild className="rounded-xl font-bold">
            <Link to="/courses">Browse Courses</Link>
          </Button>
        </div>
        <SiteFooter />
      </div>
    );
  }

  const price = effectiveCoursePrice(course);
  const totalMinutes = course.modules.reduce(
    (sum, m) => sum + (m.lessons || []).reduce((s, l) => s + l.duration_minutes, 0),
    0
  );

  return (
    <div className="flex min-h-screen flex-col bg-slate-50">
      <SiteNav />
      <main className="flex-1">
        <section className="bg-slate-900 text-white">
          <div className="container mx-auto grid gap-8 px-6 py-12 lg:grid-cols-5 lg:py-16">
            <div className="lg:col-span-3">
              {course.category?.name ? (
                <Badge className="mb-4 border-none bg-white/10 font-bold">{course.category.name}</Badge>
              ) : null}
              <h1 className="font-display mb-4 text-3xl font-black md:text-4xl">{course.title}</h1>
              <p className="mb-6 text-lg text-slate-300">{course.short_description}</p>
              <div className="flex flex-wrap gap-4 text-sm text-slate-300">
                {course.instructor_name ? <span>Instructor: {course.instructor_name}</span> : null}
                {course.duration_text ? (
                  <span className="flex items-center gap-1">
                    <Clock className="size-4" /> {course.duration_text}
                  </span>
                ) : null}
                <span className="flex items-center gap-1">
                  <Star className="size-4 fill-amber-400 text-amber-400" />
                  {Number(course.rating_avg).toFixed(1)} ({course.rating_count} reviews)
                </span>
                <span className="flex items-center gap-1">
                  <Users className="size-4" /> {course.students_count} students
                </span>
                {totalMinutes > 0 ? <span>{totalMinutes} min total</span> : null}
              </div>
            </div>
            <div className="lg:col-span-2">
              <Card className="overflow-hidden rounded-2xl border-none shadow-2xl">
                {course.banner_url || course.thumbnail_url ? (
                  <img
                    src={course.banner_url || course.thumbnail_url || ""}
                    alt={course.title}
                    className="aspect-video w-full object-cover"
                  />
                ) : (
                  <div className="flex aspect-video items-center justify-center bg-slate-100">
                    <BookOpen className="size-16 text-slate-300" />
                  </div>
                )}
                <div className="space-y-4 p-6">
                  <div className="text-2xl font-black text-slate-900">
                    {course.is_free || price === 0 ? "Free" : formatCoursePrice(price)}
                  </div>
                  <Button
                    className="w-full rounded-xl font-bold"
                    size="lg"
                    disabled={actionLoading}
                    onClick={handleEnroll}
                  >
                    {actionLoading ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : enrollment ? (
                      "Continue Learning"
                    ) : (
                      "Enroll Now"
                    )}
                  </Button>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      className="flex-1 rounded-xl font-bold gap-2"
                      disabled={actionLoading}
                      onClick={toggleWishlist}
                    >
                      <Heart className={`size-4 ${wishlisted ? "fill-rose-500 text-rose-500" : ""}`} />
                      Wishlist
                    </Button>
                    <Button variant="outline" className="flex-1 rounded-xl font-bold gap-2" onClick={handleShare}>
                      <Share2 className="size-4" />
                      Share
                    </Button>
                  </div>
                </div>
              </Card>
            </div>
          </div>
        </section>

        <section className="container mx-auto grid gap-10 px-6 py-12 lg:grid-cols-3">
          <div className="space-y-10 lg:col-span-2">
            {course.full_description ? (
              <div>
                <h2 className="mb-4 text-xl font-black text-slate-900">About This Course</h2>
                <p className="whitespace-pre-wrap leading-relaxed text-slate-600">{course.full_description}</p>
              </div>
            ) : null}

            <div>
              <h2 className="mb-4 text-xl font-black text-slate-900">Curriculum</h2>
              <Accordion type="multiple" className="rounded-2xl border border-slate-200 bg-white px-4">
                {course.modules.map((mod, idx) => (
                  <AccordionItem key={mod.id} value={mod.id}>
                    <AccordionTrigger className="font-bold hover:no-underline">
                      <span>
                        Module {idx + 1}: {mod.title}
                        <span className="ml-2 text-sm font-normal text-slate-400">
                          ({(mod.lessons || []).length} lessons)
                        </span>
                      </span>
                    </AccordionTrigger>
                    <AccordionContent>
                      <ul className="space-y-2 pb-2">
                        {(mod.lessons || []).map((lesson) => (
                          <li
                            key={lesson.id}
                            className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 text-sm"
                          >
                            <span>{lesson.title}</span>
                            {lesson.duration_minutes > 0 ? (
                              <span className="text-slate-400">{lesson.duration_minutes} min</span>
                            ) : null}
                          </li>
                        ))}
                      </ul>
                    </AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            </div>

            {course.reviews.length > 0 ? (
              <div>
                <h2 className="mb-4 text-xl font-black text-slate-900">Student Reviews</h2>
                <div className="space-y-4">
                  {course.reviews.slice(0, 5).map((r) => (
                    <Card key={r.id} className="rounded-xl border-slate-200 p-4">
                      <div className="mb-2 flex items-center gap-1 text-amber-500">
                        {Array.from({ length: r.rating }).map((_, i) => (
                          <Star key={i} className="size-4 fill-current" />
                        ))}
                      </div>
                      {r.comment ? <p className="text-sm text-slate-600">{r.comment}</p> : null}
                    </Card>
                  ))}
                </div>
              </div>
            ) : null}
          </div>

          <div className="space-y-6">
            {course.learning_points.length > 0 ? (
              <Card className="rounded-2xl border-slate-200 p-6">
                <h3 className="mb-4 flex items-center gap-2 font-black text-slate-900">
                  <CheckCircle2 className="size-5 text-emerald-600" />
                  What You&apos;ll Learn
                </h3>
                <ul className="space-y-2">
                  {course.learning_points.map((p, i) => (
                    <li key={i} className="flex gap-2 text-sm text-slate-600">
                      <ChevronDown className="mt-0.5 size-4 shrink-0 rotate-[-90deg] text-emerald-600" />
                      {p.body}
                    </li>
                  ))}
                </ul>
              </Card>
            ) : null}

            {course.requirements.length > 0 ? (
              <Card className="rounded-2xl border-slate-200 p-6">
                <h3 className="mb-4 font-black text-slate-900">Requirements</h3>
                <ul className="list-disc space-y-1 pl-5 text-sm text-slate-600">
                  {course.requirements.map((p, i) => (
                    <li key={i}>{p.body}</li>
                  ))}
                </ul>
              </Card>
            ) : null}

            {course.includes.length > 0 ? (
              <Card className="rounded-2xl border-slate-200 p-6">
                <h3 className="mb-4 flex items-center gap-2 font-black text-slate-900">
                  <Award className="size-5 text-primary" />
                  This Course Includes
                </h3>
                <ul className="space-y-2 text-sm text-slate-600">
                  {course.includes.map((p, i) => (
                    <li key={i}>{p.body}</li>
                  ))}
                </ul>
              </Card>
            ) : null}

            {course.target_audience.length > 0 ? (
              <Card className="rounded-2xl border-slate-200 p-6">
                <h3 className="mb-4 font-black text-slate-900">Who Is This For</h3>
                <ul className="list-disc space-y-1 pl-5 text-sm text-slate-600">
                  {course.target_audience.map((p, i) => (
                    <li key={i}>{p.body}</li>
                  ))}
                </ul>
              </Card>
            ) : null}
          </div>
        </section>

        {related.length > 0 ? (
          <section className="border-t border-slate-200 bg-white py-12">
            <div className="container mx-auto px-6">
              <h2 className="mb-8 text-2xl font-black text-slate-900">Related Courses</h2>
              <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                {related.map((c) => (
                  <CourseCard key={c.id} course={c} compact />
                ))}
              </div>
            </div>
          </section>
        ) : null}
      </main>
      <SiteFooter />
    </div>
  );
}
