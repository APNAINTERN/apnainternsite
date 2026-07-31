import { Link, useNavigate } from "react-router-dom";
import { Clock, GraduationCap, IndianRupee, Star, Users } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  type Course,
  effectiveCoursePrice,
  formatCoursePrice,
} from "@/lib/coursesApi";

type Props = {
  course: Course;
  currency?: string;
  enrolled?: boolean;
  onEnroll?: (course: Course) => void;
  compact?: boolean;
};

export function CourseCard({ course, currency = "INR", enrolled, onEnroll, compact }: Props) {
  const navigate = useNavigate();
  const price = effectiveCoursePrice(course);
  const hasDiscount =
    !course.is_free &&
    course.discount_price_paise > 0 &&
    course.original_price_paise > course.discount_price_paise;

  return (
    <Card className="group flex h-full flex-col overflow-hidden rounded-2xl border-slate-200/80 bg-white shadow-soft transition-all duration-300 hover:-translate-y-1 hover:shadow-xl">
      <div className="relative aspect-[16/10] overflow-hidden bg-slate-100">
        {course.thumbnail_url ? (
          <img
            src={course.thumbnail_url}
            alt={course.title}
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
            loading="lazy"
          />
        ) : (
          <div className="flex h-full items-center justify-center bg-gradient-to-br from-slate-100 to-slate-200">
            <GraduationCap className="size-12 text-slate-300" />
          </div>
        )}
        {course.is_featured ? (
          <Badge className="absolute left-3 top-3 border-none bg-emerald-600 font-bold">Featured</Badge>
        ) : null}
        {course.is_free ? (
          <Badge className="absolute right-3 top-3 border-none bg-primary font-bold">Free</Badge>
        ) : null}
        {course.difficulty ? (
          <Badge variant="secondary" className="absolute bottom-3 left-3 capitalize font-semibold">
            {course.difficulty}
          </Badge>
        ) : null}
      </div>

      <div className="flex flex-1 flex-col p-5">
        {course.category?.name ? (
          <p className="mb-1 text-[10px] font-black uppercase tracking-widest text-primary">
            {course.category.name}
          </p>
        ) : null}
        <h3 className="font-display mb-2 line-clamp-2 text-lg font-bold text-slate-900">{course.title}</h3>
        {!compact && course.short_description ? (
          <p className="mb-4 line-clamp-2 text-sm leading-relaxed text-slate-500">{course.short_description}</p>
        ) : null}

        <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
          {course.instructor_name ? (
            <span className="flex items-center gap-1">
              <GraduationCap className="size-3.5" />
              {course.instructor_name}
            </span>
          ) : null}
          {course.duration_text ? (
            <span className="flex items-center gap-1">
              <Clock className="size-3.5" />
              {course.duration_text}
            </span>
          ) : null}
          {course.lessons_count > 0 ? (
            <span>{course.lessons_count} lessons</span>
          ) : null}
        </div>

        <div className="mb-4 flex flex-wrap items-center gap-3 text-sm">
          <span className="flex items-center gap-1 font-semibold text-amber-600">
            <Star className="size-4 fill-amber-400 text-amber-400" />
            {Number(course.rating_avg).toFixed(1)}
            <span className="font-normal text-slate-400">({course.rating_count})</span>
          </span>
          <span className="flex items-center gap-1 text-slate-500">
            <Users className="size-4" />
            {course.students_count.toLocaleString()} students
          </span>
        </div>

        <div className="mt-auto flex items-end justify-between gap-3 border-t border-slate-100 pt-4">
          <div>
            {course.is_free || price === 0 ? (
              <span className="text-lg font-black text-emerald-600">Free</span>
            ) : (
              <div className="flex items-baseline gap-2">
                <span className="flex items-center text-lg font-black text-slate-900">
                  <IndianRupee className="size-4" />
                  {formatCoursePrice(price, currency).replace("₹", "")}
                </span>
                {hasDiscount ? (
                  <span className="text-sm text-slate-400 line-through">
                    {formatCoursePrice(course.original_price_paise, currency)}
                  </span>
                ) : null}
              </div>
            )}
          </div>
          <div className="flex shrink-0 gap-2">
            <Button
              variant="outline"
              size="sm"
              className="rounded-xl font-bold"
              onClick={() => navigate(`/courses/${course.slug}`)}
            >
              View Details
            </Button>
            {enrolled ? (
              <Button size="sm" className="rounded-xl font-bold" asChild>
                <Link to="/dashboard?view=courses">Continue</Link>
              </Button>
            ) : onEnroll ? (
              <Button size="sm" className="rounded-xl font-bold" onClick={() => onEnroll(course)}>
                Enroll
              </Button>
            ) : (
              <Button size="sm" className="rounded-xl font-bold" asChild>
                <Link to={`/courses/${course.slug}/enroll`}>Enroll</Link>
              </Button>
            )}
          </div>
        </div>
      </div>
    </Card>
  );
}
