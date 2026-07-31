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
  type NonEngineeringConfigInput,
  type NonEngineeringUniversityConfig,
  withOtherOption,
} from "@/lib/nonEngineeringConfig";

const DEFAULT_COURSES = "B.A.\nB.Sc\nB.Com\nM.A.\nM.Sc\nM.Com";

type CatalogPrefill = {
  universityName: string;
  universityId: string;
  collegeNames: string[];
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  saving?: boolean;
  initialConfig?: NonEngineeringUniversityConfig | null;
  /** Prefill when starting a config from an existing catalog university. */
  catalogPrefill?: CatalogPrefill | null;
  onSubmit: (input: NonEngineeringConfigInput) => void | Promise<void>;
};

function listWithoutOther(values: string[]): string {
  return values.filter((v) => v !== "Other").join("\n");
}

export function NonEngineeringConfigFormDialog({
  open,
  onOpenChange,
  saving = false,
  initialConfig = null,
  catalogPrefill = null,
  onSubmit,
}: Props) {
  const isEdit = !!initialConfig?.id;
  const [loading, setLoading] = useState(false);
  const [universityName, setUniversityName] = useState("");
  const [lockedUniversityId, setLockedUniversityId] = useState<string | undefined>();
  const [collegesText, setCollegesText] = useState("");
  const [coursesText, setCoursesText] = useState("");
  const [branchRows, setBranchRows] = useState<Array<{ course: string; branchesText: string }>>([]);

  const courses = useMemo(() => parseMultilineList(coursesText), [coursesText]);

  useEffect(() => {
    if (!open) return;

    if (initialConfig) {
      setLoading(true);
      setUniversityName(initialConfig.university_name || "");
      setLockedUniversityId(initialConfig.university_id || undefined);
      setCoursesText(listWithoutOther(initialConfig.courses));
      setBranchRows(
        listWithoutOther(initialConfig.courses)
          .split("\n")
          .filter(Boolean)
          .map((course) => ({
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

    if (catalogPrefill) {
      setLoading(false);
      setUniversityName(catalogPrefill.universityName);
      setLockedUniversityId(catalogPrefill.universityId);
      setCollegesText(catalogPrefill.collegeNames.join("\n"));
      setCoursesText("");
      setBranchRows([]);
      return;
    }

    setLoading(false);
    setUniversityName("");
    setLockedUniversityId(undefined);
    setCollegesText("");
    setCoursesText("");
    setBranchRows([]);
  }, [open, initialConfig, catalogPrefill]);

  useEffect(() => {
    setBranchRows((prev) => {
      const next = courses.map((course) => {
        const existing = prev.find((row) => row.course === course);
        return existing || { course, branchesText: "" };
      });
      return next;
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
    const parsedCourses = parseMultilineList(coursesText).filter((c) => c !== "Other");
    // Programmes / courses are optional — empty is allowed.
    const courseList = parsedCourses.length > 0 ? withOtherOption(parsedCourses) : [];

    const branchesByCourse: Record<string, string[]> = {};
    for (const row of branchRows) {
      if (!parsedCourses.includes(row.course)) continue;
      const subjects = withOtherOption(
        parseMultilineList(row.branchesText).filter((b) => b !== "Other")
      );
      if (subjects.length === 0) {
        toast.error(`Add subjects for programme: ${row.course}`);
        return;
      }
      branchesByCourse[row.course] = subjects;
    }

    await onSubmit({
      universityName: uni,
      universityId: lockedUniversityId || initialConfig?.university_id || undefined,
      configId: initialConfig?.id || undefined,
      collegeNames,
      courses: courseList,
      branchesByCourse,
      // Domains are global for non-tech — do not override per university.
      domains: [],
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit Non-Tech Config" : "Add Non-Tech Config"}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? "Update colleges, programmes, and subjects for this university. Internship domains stay on the global list."
              : "Add a general (BSc / BCom / arts / science) university with colleges and programmes. They sync into the catalog and registration. Domains use the existing global list."}
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
                placeholder="e.g. Magadh University (MU), Bodh Gaya"
                value={universityName}
                onChange={(e) => setUniversityName(e.target.value)}
                disabled={!!lockedUniversityId && !isEdit}
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Colleges * (one full name per line)</Label>
              <Textarea
                className="text-xs min-h-[80px]"
                placeholder={"Gaya College, Gaya\nA. N. College, Patna"}
                value={collegesText}
                onChange={(e) => setCollegesText(e.target.value)}
              />
              <p className="text-[10px] text-muted-foreground">
                Keep commas in the college name (city). Put each college on its own line.
              </p>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Programmes / courses (optional, one per line)</Label>
              <Textarea
                className="text-xs min-h-[72px]"
                placeholder={DEFAULT_COURSES}
                value={coursesText}
                onChange={(e) => setCoursesText(e.target.value)}
              />
            </div>

            {branchRows.length > 0 && (
              <div className="space-y-3 rounded-lg border p-3 bg-muted/20">
                <Label className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                  Subjects / departments per programme
                </Label>
                {branchRows.map((row, index) => (
                  <div key={row.course} className="space-y-1.5">
                    <Label className="text-[11px]">{row.course}</Label>
                    <Textarea
                      className="text-xs min-h-[64px]"
                      placeholder={"History\nPolitical Science\nEconomics\nOther"}
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

            <p className="text-[10px] text-muted-foreground rounded-md border border-dashed p-2 bg-slate-50">
              Internship domains are not set here — non-tech registration uses the global domains already
              configured in the admin panel.
            </p>
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
