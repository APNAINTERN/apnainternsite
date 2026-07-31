import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { GraduationCap, Loader2, Search, SlidersHorizontal } from "lucide-react";
import { SiteNav } from "@/components/SiteNav";
import { SiteFooter } from "@/components/SiteFooter";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CourseCard } from "@/components/courses/CourseCard";
import { supabase } from "@/integrations/supabase/client";
import {
  listCategories,
  listCourses,
  type Category,
  type Course,
  type CourseListFilters,
} from "@/lib/coursesApi";

export default function Courses() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [courses, setCourses] = useState<Course[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [search, setSearch] = useState(searchParams.get("q") || "");
  const [categorySlug, setCategorySlug] = useState(searchParams.get("category") || "all");
  const [priceFilter, setPriceFilter] = useState(searchParams.get("price") || "all");
  const [ratingFilter, setRatingFilter] = useState(searchParams.get("rating") || "all");
  const [sort, setSort] = useState<CourseListFilters["sort"]>(
    (searchParams.get("sort") as CourseListFilters["sort"]) || "newest"
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const cats = await listCategories(supabase, true);
        if (cancelled) return;
        setCategories(cats);
        const catId =
          categorySlug !== "all" ? cats.find((c) => c.slug === categorySlug)?.id : undefined;
        const rows = await listCourses(supabase, {
          search: search || undefined,
          category: catId,
          sort,
        });
        if (!cancelled) setCourses(rows);
      } catch (err) {
        console.warn("[courses] listing failed:", err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [search, categorySlug, sort]);

  const filtered = useMemo(() => {
    return courses.filter((c) => {
      if (priceFilter === "free" && !c.is_free) return false;
      if (priceFilter === "paid" && c.is_free) return false;
      if (ratingFilter !== "all" && c.rating_avg < Number(ratingFilter)) return false;
      return true;
    });
  }, [courses, priceFilter, ratingFilter]);

  const applyFilters = () => {
    const params = new URLSearchParams();
    if (search) params.set("q", search);
    if (categorySlug !== "all") params.set("category", categorySlug);
    if (priceFilter !== "all") params.set("price", priceFilter);
    if (ratingFilter !== "all") params.set("rating", ratingFilter);
    if (sort) params.set("sort", sort);
    setSearchParams(params);
  };

  return (
    <div className="flex min-h-screen flex-col bg-slate-50">
      <SiteNav />
      <main className="flex-1">
        <section className="relative overflow-hidden bg-slate-900 py-16 text-white md:py-20">
          <div className="absolute inset-0 opacity-20">
            <div className="absolute -right-20 top-0 size-96 rounded-full bg-primary blur-3xl" />
          </div>
          <div className="container relative mx-auto px-6 text-center">
            <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-white/10 px-4 py-1.5 text-sm font-semibold">
              <GraduationCap className="size-4" />
              Apna Intern Courses
            </div>
            <h1 className="font-display mb-4 text-4xl font-black md:text-5xl">Browse All Courses</h1>
            <p className="mx-auto max-w-2xl text-slate-300">
              Upskill with industry-ready programmes designed for UG students across India.
            </p>
          </div>
        </section>

        <section className="container mx-auto px-6 py-10">
          <div className="mb-8 rounded-2xl border border-slate-200 bg-white p-4 shadow-soft md:p-6">
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-6">
              <div className="relative lg:col-span-2">
                <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
                <Input
                  placeholder="Search courses..."
                  className="rounded-xl pl-10"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && applyFilters()}
                />
              </div>
              <Select value={categorySlug} onValueChange={setCategorySlug}>
                <SelectTrigger className="rounded-xl">
                  <SelectValue placeholder="Category" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Categories</SelectItem>
                  {categories.map((c) => (
                    <SelectItem key={c.id} value={c.slug}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={priceFilter} onValueChange={setPriceFilter}>
                <SelectTrigger className="rounded-xl">
                  <SelectValue placeholder="Price" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Prices</SelectItem>
                  <SelectItem value="free">Free</SelectItem>
                  <SelectItem value="paid">Paid</SelectItem>
                </SelectContent>
              </Select>
              <Select value={ratingFilter} onValueChange={setRatingFilter}>
                <SelectTrigger className="rounded-xl">
                  <SelectValue placeholder="Rating" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Any Rating</SelectItem>
                  <SelectItem value="4">4+ Stars</SelectItem>
                  <SelectItem value="3">3+ Stars</SelectItem>
                </SelectContent>
              </Select>
              <Select value={sort || "newest"} onValueChange={(v) => setSort(v as CourseListFilters["sort"])}>
                <SelectTrigger className="rounded-xl">
                  <SelectValue placeholder="Sort" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="newest">Newest</SelectItem>
                  <SelectItem value="popular">Most Popular</SelectItem>
                  <SelectItem value="rating">Top Rated</SelectItem>
                  <SelectItem value="price_low">Price: Low to High</SelectItem>
                  <SelectItem value="price_high">Price: High to Low</SelectItem>
                  <SelectItem value="title">Title A–Z</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="mt-4 flex justify-end">
              <Button className="rounded-xl font-bold gap-2" onClick={applyFilters}>
                <SlidersHorizontal className="size-4" />
                Apply Filters
              </Button>
            </div>
          </div>

          {loading ? (
            <div className="flex justify-center py-20">
              <Loader2 className="size-10 animate-spin text-primary" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-200 bg-white py-20 text-center">
              <GraduationCap className="mx-auto mb-4 size-12 text-slate-300" />
              <p className="text-lg font-bold text-slate-700">No courses found</p>
              <p className="text-sm text-slate-500">Try adjusting your filters or search terms.</p>
            </div>
          ) : (
            <>
              <p className="mb-6 text-sm font-semibold text-slate-500">
                Showing {filtered.length} course{filtered.length === 1 ? "" : "s"}
              </p>
              <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                {filtered.map((course) => (
                  <CourseCard key={course.id} course={course} />
                ))}
              </div>
            </>
          )}
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
