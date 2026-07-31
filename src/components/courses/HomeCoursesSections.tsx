import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, GraduationCap, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { CourseCard } from "@/components/courses/CourseCard";
import { listCategories, listCourses, type Category, type Course } from "@/lib/coursesApi";

function SectionHead({
  pill,
  title,
  action,
}: {
  pill: string;
  title: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <div className="mb-2 text-[10px] font-black uppercase tracking-widest text-primary">{pill}</div>
        <h2 className="font-display text-2xl font-black text-slate-900 md:text-3xl">{title}</h2>
      </div>
      {action}
    </div>
  );
}

export function HomeCoursesSections() {
  const [loading, setLoading] = useState(true);
  const [featured, setFeatured] = useState<Course[]>([]);
  const [latest, setLatest] = useState<Course[]>([]);
  const [popular, setPopular] = useState<Course[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        // One courses fetch + client-side slices (was 3 parallel listCourses).
        const [all, cats] = await Promise.all([
          listCourses(supabase, { sort: "newest", limit: 48 }),
          listCategories(supabase, true),
        ]);
        if (!cancelled) {
          setFeatured(all.filter((c) => c.is_featured).slice(0, 4));
          setLatest(all.slice(0, 4));
          setPopular(
            [...all]
              .sort((a, b) => (b.students_count || 0) - (a.students_count || 0))
              .slice(0, 4)
          );
          setCategories(cats);
        }
      } catch (err) {
        console.warn("[courses] home sections load failed:", err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return (
      <section className="bg-slate-50 py-16 md:py-20">
        <div className="mx-auto flex max-w-[1200px] justify-center px-8 py-12">
          <Loader2 className="size-8 animate-spin text-primary" />
        </div>
      </section>
    );
  }

  if (!featured.length && !latest.length && !popular.length) return null;

  const viewAllBtn = (
    <Button variant="outline" className="rounded-xl font-bold gap-2" asChild>
      <Link to="/courses">
        View All Courses
        <ArrowRight className="size-4" />
      </Link>
    </Button>
  );

  return (
    <section id="courses" className="scroll-mt-24 bg-slate-50 py-16 md:py-20">
      <div className="mx-auto max-w-[1200px] px-8">
        <SectionHead pill="Learn & Grow" title="Explore Our Courses" action={viewAllBtn} />

        {categories.length > 0 ? (
          <div className="mb-12 flex flex-wrap gap-2">
            {categories.map((cat) => (
              <Link key={cat.id} to={`/courses?category=${cat.slug}`}>
                <Badge
                  variant="secondary"
                  className="cursor-pointer rounded-full px-4 py-1.5 text-sm font-semibold hover:bg-primary/10"
                >
                  {cat.name}
                </Badge>
              </Link>
            ))}
          </div>
        ) : null}

        {featured.length > 0 ? (
          <div className="mb-14">
            <div className="mb-6 flex items-center gap-2">
              <GraduationCap className="size-5 text-emerald-600" />
              <h3 className="text-lg font-black text-slate-900">Featured Courses</h3>
            </div>
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
              {featured.map((course) => (
                <CourseCard key={course.id} course={course} compact />
              ))}
            </div>
          </div>
        ) : null}

        {latest.length > 0 ? (
          <div className="mb-14">
            <h3 className="mb-6 text-lg font-black text-slate-900">Latest Courses</h3>
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
              {latest.map((course) => (
                <CourseCard key={`latest-${course.id}`} course={course} compact />
              ))}
            </div>
          </div>
        ) : null}

        {popular.length > 0 ? (
          <div>
            <h3 className="mb-6 text-lg font-black text-slate-900">Most Popular</h3>
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
              {popular.map((course) => (
                <CourseCard key={`pop-${course.id}`} course={course} compact />
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
}
