import { useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { displayCollegeName } from "@/lib/collegeDisplay";
import {
  BEU_MODES,
  type BeuFormData,
  type BeuSectionType,
  validateBeuForm,
} from "@/lib/beuRegistration";
import { resolveEngineeringOptions } from "@/lib/engineeringConfig";
import type { EngineeringUniversityConfig } from "@/lib/engineeringConfig";

type CollegeOption = { id: string; name: string };

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  colleges: CollegeOption[];
  engineeringConfig?: EngineeringUniversityConfig | null;
  universityLabel?: string;
  initialCollegeId?: string;
  initialSession?: string;
  initialSemester?: string;
  initialRegistrationNumber?: string;
  initialMode?: string;
  initialDomain?: string;
  saving?: boolean;
  onSubmit: (data: BeuFormData) => void | Promise<void>;
};

const emptyForm = (): Partial<BeuFormData> => ({
  collegeId: "",
  collegeName: "",
  course: "",
  branchSubject: "",
  specialization: "",
  sectionType: "Weeks",
  sectionDuration: "",
  semester: "",
  session: "",
  internshipDomain: "",
  registrationNumber: "",
  mode: "Online",
});

export function BeuRegistrationModal({
  open,
  onOpenChange,
  colleges,
  engineeringConfig = null,
  universityLabel,
  initialCollegeId,
  initialSession,
  initialSemester,
  initialRegistrationNumber,
  initialMode,
  initialDomain,
  saving = false,
  onSubmit,
}: Props) {
  const [form, setForm] = useState<Partial<BeuFormData>>(emptyForm());

  const options = useMemo(() => resolveEngineeringOptions(engineeringConfig), [engineeringConfig]);

  const freeFormMode =
    form.course === "Other" || form.branchSubject === "Other";

  const branchOptions = useMemo(() => {
    if (!form.course) return options.branchesByCourse[options.courses[0]] || [];
    return options.branchesByCourse[form.course] || [];
  }, [form.course, options.branchesByCourse, options.courses]);

  const durationOptions = useMemo(() => {
    return form.sectionType === "Hours" ? options.sectionHours : options.sectionWeeks;
  }, [form.sectionType, options.sectionHours, options.sectionWeeks]);

  useEffect(() => {
    if (!open) return;
    const college = colleges.find((c) => c.id === initialCollegeId);
    setForm({
      ...emptyForm(),
      collegeId: initialCollegeId || "",
      collegeName: college ? displayCollegeName(college.name) : "",
      session: initialSession || "",
      semester: initialSemester || "",
      registrationNumber: initialRegistrationNumber || "",
      mode: initialMode || "Online",
      internshipDomain: initialDomain || "",
    });
  }, [
    open,
    colleges,
    initialCollegeId,
    initialSession,
    initialSemester,
    initialRegistrationNumber,
    initialMode,
    initialDomain,
  ]);

  const patch = (patchData: Partial<BeuFormData>) => {
    setForm((prev) => ({ ...prev, ...patchData }));
  };

  const handleCollegeChange = (collegeId: string) => {
    const college = colleges.find((c) => c.id === collegeId);
    patch({
      collegeId,
      collegeName: college ? displayCollegeName(college.name) : "",
    });
  };

  const handleCourseChange = (value: string) => {
    patch({
      course: value,
      branchSubject: value === "Other" ? "" : "",
      specialization: value === "Other" ? "" : form.specialization,
      internshipDomain: value === "Other" ? "" : form.internshipDomain,
    });
  };

  const handleBranchChange = (value: string) => {
    patch({
      branchSubject: value,
      specialization: value === "Other" ? "" : form.specialization,
      internshipDomain: value === "Other" ? "" : form.internshipDomain,
    });
  };

  const handleSave = async () => {
    const payload: Partial<BeuFormData> = { ...form };
    const err = validateBeuForm(payload);
    if (err) {
      toast.error(err);
      return;
    }
    await onSubmit(payload as BeuFormData);
  };

  const renderSelectOrInput = (
    label: string,
    value: string,
    onChange: (v: string) => void,
    selectItems: string[],
    placeholder: string,
    inputPlaceholder?: string
  ) => (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      {freeFormMode ? (
        <Input
          className="h-9 text-xs"
          placeholder={inputPlaceholder || placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      ) : (
        <Select value={value || ""} onValueChange={onChange}>
          <SelectTrigger className="h-9 text-xs">
            <SelectValue placeholder={placeholder} />
          </SelectTrigger>
          <SelectContent>
            {selectItems.map((item) => (
              <SelectItem key={item} value={item}>
                {item}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Engineering Registration Form</DialogTitle>
          <DialogDescription>
            {universityLabel
              ? `Please provide engineering details for ${universityLabel}.`
              : "Please provide your course, branch, specialization, and internship details."}
          </DialogDescription>
        </DialogHeader>

        {freeFormMode ? (
          <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
            You selected <strong>Other</strong> — please type your course, branch, and related details below.
          </p>
        ) : null}

        <div className="grid sm:grid-cols-2 gap-4 py-2">
          <div className="space-y-1.5 sm:col-span-2">
            <Label className="text-xs">College *</Label>
            <Select value={form.collegeId || ""} onValueChange={handleCollegeChange}>
              <SelectTrigger className="h-9 text-xs">
                <SelectValue placeholder="Select college" />
              </SelectTrigger>
              <SelectContent>
                {colleges.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {displayCollegeName(c.name)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {renderSelectOrInput(
            "Course *",
            form.course || "",
            handleCourseChange,
            options.courses,
            "Select course",
            "Enter course"
          )}

          {renderSelectOrInput(
            "Branch / Subject *",
            form.branchSubject || "",
            handleBranchChange,
            branchOptions,
            "Select branch",
            "Enter branch / subject"
          )}

          {renderSelectOrInput(
            "Specialization *",
            form.specialization || "",
            (v) => patch({ specialization: v }),
            options.specializations,
            "Select specialization",
            "Enter specialization"
          )}

          <div className="space-y-1.5">
            <Label className="text-xs">Section Type *</Label>
            {freeFormMode ? (
              <Input
                className="h-9 text-xs"
                placeholder="Hours or Weeks"
                value={form.sectionType || ""}
                onChange={(e) => patch({ sectionType: e.target.value as BeuSectionType, sectionDuration: "" })}
              />
            ) : (
              <Select
                value={form.sectionType || "Weeks"}
                onValueChange={(v) => patch({ sectionType: v as BeuSectionType, sectionDuration: "" })}
              >
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Hours">Hours</SelectItem>
                  <SelectItem value="Weeks">Weeks</SelectItem>
                </SelectContent>
              </Select>
            )}
          </div>

          {renderSelectOrInput(
            form.sectionType === "Hours" ? "Select Hours *" : "Select Weeks *",
            form.sectionDuration || "",
            (v) => patch({ sectionDuration: v }),
            durationOptions,
            "Select duration",
            "Enter duration"
          )}

          {renderSelectOrInput(
            "Semester *",
            form.semester || "",
            (v) => patch({ semester: v }),
            options.semesters,
            "Select semester",
            "Enter semester"
          )}

          {renderSelectOrInput(
            "Session *",
            form.session || "",
            (v) => patch({ session: v }),
            options.sessions,
            "Select session",
            "Enter session"
          )}

          {renderSelectOrInput(
            "Internship Domain *",
            form.internshipDomain || "",
            (v) => patch({ internshipDomain: v }),
            options.domains,
            "Select domain",
            "Enter internship domain"
          )}

          <div className="space-y-1.5">
            <Label className="text-xs">Registration Number *</Label>
            <Input
              className="h-9 text-xs"
              value={form.registrationNumber || ""}
              onChange={(e) => patch({ registrationNumber: e.target.value })}
            />
          </div>

          <div className="space-y-1.5 sm:col-span-2">
            <Label className="text-xs">Mode *</Label>
            <RadioGroup
              value={form.mode || "Online"}
              onValueChange={(v) => patch({ mode: v })}
              className="flex flex-wrap gap-4 pt-1"
            >
              {BEU_MODES.map((mode) => (
                <label key={mode} className="flex items-center gap-1.5 cursor-pointer text-xs">
                  <RadioGroupItem value={mode} id={`beu-mode-${mode}`} />
                  <span>{mode}</span>
                </label>
              ))}
            </RadioGroup>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={() => void handleSave()} disabled={saving}>
            {saving ? <Loader2 className="size-4 animate-spin" /> : "Save & Continue"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
