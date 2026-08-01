import { useEffect, useMemo, useState } from "react";
import { Loader2, Pencil, Plus } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  fetchCollegesForUniversity,
  parseMultilineList,
  defaultEngineeringOptions,
  type EngineeringConfigInput,
  type EngineeringUniversityConfig,
  withOtherOption,
} from "@/lib/engineeringConfig";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  saving?: boolean;
  initialConfig?: EngineeringUniversityConfig | null;
  onSubmit: (input: EngineeringConfigInput) => void | Promise<void>;
};

function listWithoutOther(values: string[]): string {
  return values.filter((v) => v !== "Other").join("\n");
}

function branchRowsForCourses(courses: string[]): Array<{ course: string; branchesText: string }> {
  const defaults = defaultEngineeringOptions();
  return courses
    .filter((c) => c !== "Other")
    .map((course) => ({
      course,
      branchesText: listWithoutOther(defaults.branches_by_course[course] || []),
    }));
}

export function EngineeringConfigFormDialog({
  open,
  onOpenChange,
  saving = false,
  initialConfig = null,
  onSubmit,
}: Props) {
  const isEdit = !!initialConfig?.id;
  const [loading, setLoading] = useState(false);
  const [universityName, setUniversityName] = useState("");
  const [collegesText, setCollegesText] = useState("");
  const [coursesText, setCoursesText] = useState("");
  const [domainsText, setDomainsText] = useState("");
  const [branchRows, setBranchRows] = useState<Array<{ course: string; branchesText: string }>>([]);

  const courses = useMemo(() => parseMultilineList(coursesText), [coursesText]);

  useEffect(() => {
    if (!open) return;

    if (initialConfig) {
      setLoading(true);
      setUniversityName(initialConfig.university_name || "");
      setCoursesText(listWithoutOther(initialConfig.courses));
      setDomainsText(initialConfig.domains.join("\n"));
      setBranchRows(
        listWithoutOther(initialConfig.courses).split("\n").filter(Boolean).map((course) => ({
          course,
          branchesText: listWithoutOther(initialConfig.branches_by_course[course] || []),
        }))
      );

      void (async () => {
        try {
          const collegeNames = await fetchCollegesForUniversity(
            supabase,
            initialConfig.university_id
          );
          setCollegesText(collegeNames.join("\n"));
        } catch (e: unknown) {
          toast.error(e instanceof Error ? e.message : "Failed to load colleges");
          setCollegesText("");
        } finally {
          setLoading(false);
        }
      })();
      return;
    }

    setLoading(false);
    const defaults = defaultEngineeringOptions();
    const defaultCourses = listWithoutOther(defaults.courses);
    setUniversityName("");
    setCollegesText("");
    setCoursesText(defaultCourses);
    setDomainsText("");
    setBranchRows(branchRowsForCourses(parseMultilineList(defaultCourses)));
    return;
  }, [open, initialConfig]);

  useEffect(() => {
    const defaults = defaultEngineeringOptions();
    setBranchRows((prev) => {
      // Preserve branches when a course is renamed in-place (same index).
      return courses.map((course, index) => {
        const byName = prev.find((row) => row.course === course);
        if (byName) return { ...byName, course };
        const byIndex = prev[index];
        if (byIndex && !courses.includes(byIndex.course)) {
          return { course, branchesText: byIndex.branchesText };
        }
        return {
          course,
          branchesText: listWithoutOther(defaults.branches_by_course[course] || []),
        };
      });
    });
  }, [courses]);

  const handleSave = async () => {
    const uni = universityName.trim();
    if (!uni) {
      toast.error("Enter university name");
      return;
    }
    const collegeNames = parseMultilineList(collegesText);
    if (collegeNames.length === 0) {
      toast.error("Add at least one college");
      return;
    }
    const courseList = withOtherOption(parseMultilineList(coursesText).filter((c) => c !== "Other"));
    if (courseList.length === 0) {
      toast.error("Add at least one course");
      return;
    }
    const domains = parseMultilineList(domainsText);
    if (domains.length === 0) {
      toast.error("Add at least one internship domain for this university");
      return;
    }

    const branchesByCourse: Record<string, string[]> = {};
    for (const course of courseList) {
      const row = branchRows.find((r) => r.course === course);
      const branches = withOtherOption(
        parseMultilineList(row?.branchesText || "").filter((b) => b !== "Other")
      );
      if (course !== "Other" && branches.every((b) => b === "Other")) {
        toast.error(`Add branches for course: ${course}`);
        return;
      }
      branchesByCourse[course] = branches;
    }

    await onSubmit({
      universityName: uni,
      universityId: initialConfig?.university_id || undefined,
      configId: initialConfig?.id || undefined,
      collegeNames,
      courses: courseList,
      branchesByCourse,
      domains,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit Engineering Config" : "Add Engineering Config"}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? "Update colleges, courses, branches, and internship domains for this engineering university."
              : "Add an engineering university with colleges, courses, branches, and internship domains. Students selecting this university will only see these domains during registration."}
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="py-12 flex flex-col items-center justify-center text-muted-foreground gap-2">
            <Loader2 className="size-8 animate-spin text-primary" />
            <p className="text-xs">Loading config…</p>
          </div>
        ) : (
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label className="text-xs">University name *</Label>
              <Input
                className="h-9 text-xs"
                placeholder="e.g. Bihar Engineering University (BEU)"
                value={universityName}
                onChange={(e) => setUniversityName(e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Colleges * (one full name per line)</Label>
              <Textarea
                className="text-xs min-h-[80px]"
                placeholder={
                  "Government Engineering College, Patna\nMuzaffarpur Institute of Technology, Muzaffarpur"
                }
                value={collegesText}
                onChange={(e) => setCollegesText(e.target.value)}
              />
              <p className="text-[10px] text-muted-foreground">
                Keep commas in the college name (city). Put each college on its own line — do not
                separate colleges with commas.
              </p>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Courses * (one per line)</Label>
              <Textarea
                className="text-xs min-h-[72px]"
                placeholder={"B.Tech\nM.Tech\nDiploma"}
                value={coursesText}
                onChange={(e) => setCoursesText(e.target.value)}
              />
            </div>

            {branchRows.length > 0 && (
              <div className="space-y-3 rounded-lg border p-3 bg-muted/20">
                <Label className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                  Branches per course *
                </Label>
                {branchRows.map((row, index) => (
                  <div key={`${index}-${row.course}`} className="space-y-1.5">
                    <Label className="text-[11px]">{row.course}</Label>
                    <Textarea
                      className="text-xs min-h-[64px]"
                      placeholder="Computer Science & Engineering&#10;Information Technology&#10;Other"
                      value={row.branchesText}
                      onChange={(e) => {
                        const value = e.target.value;
                        setBranchRows((prev) =>
                          prev.map((item, i) => (i === index ? { ...item, branchesText: value } : item))
                        );
                      }}
                    />
                  </div>
                ))}
              </div>
            )}

            <div className="space-y-1.5">
              <Label className="text-xs">Internship domains for this university * (one per line)</Label>
              <Textarea
                className="text-xs min-h-[80px]"
                placeholder={"Web Development\nAI / ML\nCyber Security"}
                value={domainsText}
                onChange={(e) => setDomainsText(e.target.value)}
              />
              <p className="text-[10px] text-muted-foreground">
                Only these domains appear for engineering students of this university — general arts/science
                domains are hidden.
              </p>
            </div>
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving || loading}>
            Cancel
          </Button>
          <Button onClick={() => void handleSave()} disabled={saving || loading} className="gap-2">
            {saving ? (
              <Loader2 className="size-4 animate-spin" />
            ) : isEdit ? (
              <Pencil className="size-4" />
            ) : (
              <Plus className="size-4" />
            )}
            {isEdit ? "Update config" : "Save config"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
