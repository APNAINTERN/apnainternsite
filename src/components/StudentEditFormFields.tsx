import { useMemo, useState } from "react";
import { GraduationCap, Briefcase, Phone } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { EDIT_DOMAIN_SENTINEL } from "@/lib/studentCredentials";
import { displayCollegeName } from "@/lib/collegeDisplay";
import { matchSubjectToOption, subjectsFor } from "@/lib/subjectOptions";
import { isBnmuStudent } from "@/lib/feeRules";
import {
  collegesForUniversity,
  institutionsMatch,
  resolveUniversityId,
} from "@/lib/institutionCatalog";
import { resolveInternshipModeForUniversity } from "@/lib/internshipProgramme";
import { resolveBnmuUniversityRollNumber } from "@/lib/certificateFormat";
import {
  BEU_BRANCHES,
  BEU_COURSES,
  BEU_SECTION_HOURS,
  BEU_SECTION_WEEKS,
  type BeuSectionType,
} from "@/lib/beuRegistration";
import {
  NON_TECH_DEPARTMENTS_PG,
  NON_TECH_DEPARTMENTS_UG,
} from "@/lib/studentTrack";

const SESSION_OPTIONS = ["2023-2027", "2024-2028", "2025-2029"] as const;
const SEMESTER_OPTIONS = [1, 2, 3, 4, 5, 6, 7, 8].map((s) => `Semester ${s}`);
const MODE_OPTIONS = ["Online", "Offline", "Hybrid"] as const;

const DEPARTMENT_OTHER = "__other__";

const SUBJECT_UNSET = "__subject_unset__";
const SUBJECT_CUSTOM = "__subject_custom__";

function inferSectionType(duration: string, explicit?: string | null): BeuSectionType {
  const raw = String(explicit || "").trim();
  if (raw === "Hours" || raw === "Weeks") return raw;
  if (/week/i.test(duration)) return "Weeks";
  return "Hours";
}

export type StudentEditFormVariant = "directory" | "engineering";

export type StudentEditFormFieldsProps = {
  editData: Record<string, any>;
  setEditData: (updater: Record<string, any> | ((prev: Record<string, any>) => Record<string, any>)) => void;
  domains: { id: string; name: string }[];
  unis: { id: string; name: string }[];
  colleges: { id: string; name: string; university_id: string }[];
  registrationNumLabel?: string;
  /** directory = Non-Technical options only; engineering = Eng courses/branches/domains */
  variant?: StudentEditFormVariant;
  /** Engineering course/department options (from eng config). */
  engineeringCourses?: string[];
  /** Engineering branch options (from eng config for selected course). */
  engineeringBranches?: string[];
};

export function StudentEditFormFields({
  editData,
  setEditData,
  domains,
  unis,
  colleges,
  registrationNumLabel = "Registration number",
  variant = "directory",
  engineeringCourses,
  engineeringBranches,
}: StudentEditFormFieldsProps) {
  const [collegeSearch, setCollegeSearch] = useState("");

  const isEngineeringEdit = variant === "engineering";
  const engCourseOptions =
    engineeringCourses && engineeringCourses.length > 0
      ? engineeringCourses
      : [...BEU_COURSES];
  const engBranchOptions =
    engineeringBranches && engineeringBranches.length > 0
      ? engineeringBranches
      : [...BEU_BRANCHES];

  const uniId = resolveUniversityId(unis, editData.university_name as string | undefined);

  const collegeOptions = useMemo(() => {
    const forUni = collegesForUniversity(colleges, unis, editData.university_name as string | undefined);
    const currentName = String(editData.college_name || "").trim();
    if (!currentName) return forUni;

    const alreadyListed = forUni.some(
      (c) =>
        c.name === currentName ||
        displayCollegeName(c.name) === currentName ||
        institutionsMatch(c.name, currentName)
    );
    if (alreadyListed) return forUni;

    // Keep the student's current college visible even if university_id / name spelling differs.
    const orphan = colleges.find(
      (c) =>
        c.name === currentName ||
        displayCollegeName(c.name) === currentName ||
        institutionsMatch(c.name, currentName)
    );
    if (orphan && !forUni.some((c) => c.id === orphan.id)) {
      return [...forUni, orphan].sort((a, b) =>
        displayCollegeName(a.name).localeCompare(displayCollegeName(b.name))
      );
    }
    return forUni;
  }, [colleges, unis, editData.university_name, editData.college_name]);

  const selectedCollegeId =
    collegeOptions.find(
      (c) =>
        c.name === editData.college_name ||
        displayCollegeName(c.name) === editData.college_name ||
        institutionsMatch(c.name, editData.college_name as string)
    )?.id ?? "__unset__";

  const filteredCollegeOptions = useMemo(() => {
    const q = collegeSearch.trim();
    const base = !q
      ? collegeOptions
      : collegeOptions.filter(
          (c) =>
            institutionsMatch(c.name, q) ||
            institutionsMatch(displayCollegeName(c.name), q) ||
            displayCollegeName(c.name).toLowerCase().includes(q.toLowerCase())
        );
    // Keep the currently selected college visible even while searching.
    if (selectedCollegeId && selectedCollegeId !== "__unset__") {
      const selected = collegeOptions.find((c) => c.id === selectedCollegeId);
      if (selected && !base.some((c) => c.id === selected.id)) {
        return [selected, ...base];
      }
    }
    return base;
  }, [collegeOptions, collegeSearch, selectedCollegeId]);

  const internshipMode = resolveInternshipModeForUniversity(
    editData.university_name as string | undefined,
    (editData.internship_mode as string) ||
      (typeof editData.metadata === "object" && editData.metadata?.internship_mode) ||
      "Online"
  );
  const bnmuModeLocked = isBnmuStudent(editData.university_name as string | undefined);
  const bnmuStudent = bnmuModeLocked;
  const universityRollNumber =
    String(editData.university_roll_number ?? "").trim() ||
    resolveBnmuUniversityRollNumber(editData);

  const subjectFromRow =
    typeof editData.subject === "string"
      ? editData.subject
      : typeof editData.metadata === "object" && editData.metadata && "subject" in editData.metadata
        ? String((editData.metadata as { subject?: string }).subject ?? "")
        : "";

  const isEngineeringEditResolved = isEngineeringEdit;

  const sectionType = inferSectionType(
    String(editData.section_duration || editData.internship_duration || ""),
    String(editData.section_type || editData.beu_section_type || "")
  );
  const durationOptions =
    sectionType === "Weeks" ? [...BEU_SECTION_WEEKS] : [...BEU_SECTION_HOURS];
  const currentDuration = String(
    editData.section_duration || editData.internship_duration || ""
  ).trim();

  const subjectDeptOptions = isEngineeringEditResolved
    ? engBranchOptions
    : subjectsFor(editData.department as string);
  const subjectCanonical = isEngineeringEditResolved
    ? subjectDeptOptions.includes(subjectFromRow)
      ? subjectFromRow
      : ""
    : matchSubjectToOption(subjectFromRow, editData.department as string);
  const subjectResolved =
    subjectCanonical ||
    (subjectDeptOptions.includes(subjectFromRow) ? subjectFromRow : "");

  let subjectSelectValue: string;
  if (subjectDeptOptions.length === 0) {
    subjectSelectValue = SUBJECT_CUSTOM;
  } else if (!subjectResolved.trim()) {
    subjectSelectValue = SUBJECT_UNSET;
  } else if (subjectDeptOptions.includes(subjectResolved)) {
    subjectSelectValue = subjectResolved;
  } else {
    subjectSelectValue = SUBJECT_CUSTOM;
  }

  const domainOptions = useMemo(() => {
    const list = [...domains];
    const current = String(editData.internship_domain || editData.course || "").trim();
    if (current && !list.some((d) => d.name === current)) {
      list.unshift({ id: `current-${current}`, name: current });
    }
    return list;
  }, [domains, editData.internship_domain, editData.course]);

  const deptOptions = isEngineeringEditResolved
    ? engCourseOptions
    : editData.degree === "UG"
      ? [...NON_TECH_DEPARTMENTS_UG]
      : editData.degree === "PG"
        ? [...NON_TECH_DEPARTMENTS_PG]
        : [];
  const deptKnown =
    deptOptions.length > 0 &&
    deptOptions.includes(String(editData.department || "") as (typeof deptOptions)[number]);
  const deptSelectValue =
    isEngineeringEditResolved
      ? !editData.department
        ? "__unset__"
        : deptKnown
          ? editData.department
          : editData.department
            ? DEPARTMENT_OTHER
            : "__unset__"
      : !editData.degree || deptOptions.length === 0
        ? "__unset__"
        : deptKnown
          ? editData.department
          : editData.department
            ? DEPARTMENT_OTHER
            : "__unset__";

  return (
    <>
      <Separator className="bg-slate-100" />

      <div className="space-y-4">
        <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-primary flex items-center gap-2">
          <GraduationCap className="size-3" /> Academic details
        </h4>
        <div className="grid grid-cols-2 gap-6">
          <div className="space-y-1">
            <Label className="text-xs">University</Label>
            <Select
              value={uniId || "__unset__"}
              onValueChange={(id) => {
                setCollegeSearch("");
                if (id === "__unset__") {
                  setEditData({ ...editData, university_name: "", college_name: "" });
                  return;
                }
                const u = unis.find((x) => x.id === id);
                setEditData({ ...editData, university_name: u?.name ?? "", college_name: "" });
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select university" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__unset__">Not specified</SelectItem>
                {unis.map((u) => (
                  <SelectItem key={u.id} value={u.id}>
                    {u.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">College</Label>
            {uniId ? (
              <Input
                className="h-8 text-xs mb-1.5"
                value={collegeSearch}
                onChange={(e) => setCollegeSearch(e.target.value)}
                placeholder="Search college (e.g. UVK)"
              />
            ) : null}
            <Select
              value={selectedCollegeId}
              onValueChange={(id) => {
                if (id === "__unset__") {
                  setEditData({ ...editData, college_name: "" });
                  return;
                }
                const c = colleges.find((x) => x.id === id);
                const canonical = c?.name ?? "";
                setEditData({
                  ...editData,
                  college_name: canonical,
                });
                setCollegeSearch("");
              }}
              disabled={!uniId}
            >
              <SelectTrigger>
                <SelectValue placeholder={uniId ? "Select college" : "Pick university first"} />
              </SelectTrigger>
              <SelectContent className="max-h-72">
                <SelectItem value="__unset__">Not specified</SelectItem>
                {filteredCollegeOptions.length === 0 ? (
                  <SelectItem value="__none__" disabled>
                    {collegeSearch.trim()
                      ? "No college matches search"
                      : "No colleges for this university"}
                  </SelectItem>
                ) : (
                  filteredCollegeOptions.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {displayCollegeName(c.name)}
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
            {editData.college_name && selectedCollegeId === "__unset__" ? (
              <p className="text-[10px] text-amber-700 mt-1">
                Current value not in list:{" "}
                <span className="font-semibold">{String(editData.college_name)}</span>. Search or
                pick the matching college (e.g. U V K College, Madhepura).
              </p>
            ) : null}
          </div>
          {!isEngineeringEdit ? (
            <div className="space-y-1">
              <Label className="text-xs">Degree</Label>
              <Select
                value={editData.degree === "UG" || editData.degree === "PG" ? editData.degree : "__unset__"}
                onValueChange={(v) => {
                  const deg = v === "__unset__" ? "" : v;
                  const nextOpts =
                    deg === "UG"
                      ? [...NON_TECH_DEPARTMENTS_UG]
                      : deg === "PG"
                        ? [...NON_TECH_DEPARTMENTS_PG]
                        : [];
                  const keep =
                    nextOpts.length > 0 &&
                    nextOpts.includes(editData.department as (typeof nextOpts)[number]);
                  setEditData({
                    ...editData,
                    degree: deg,
                    ...(keep ? {} : { department: "" }),
                  });
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Degree" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__unset__">Not specified</SelectItem>
                  <SelectItem value="UG">UG</SelectItem>
                  <SelectItem value="PG">PG</SelectItem>
                </SelectContent>
              </Select>
            </div>
          ) : null}
          <div className="space-y-1 md:col-span-2">
            <Label className="text-xs">{isEngineeringEdit ? "Course" : "Department"}</Label>
            {isEngineeringEdit || editData.degree === "UG" || editData.degree === "PG" ? (
              <>
                <Select
                  value={deptSelectValue}
                  onValueChange={(v) => {
                    if (v === "__unset__") {
                      setEditData({ ...editData, department: "" });
                      return;
                    }
                    if (v === DEPARTMENT_OTHER) {
                      setEditData({ ...editData, department: "" });
                      return;
                    }
                    setEditData({
                      ...editData,
                      department: v,
                      ...(isEngineeringEdit ? { subject: "" } : {}),
                    });
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={isEngineeringEdit ? "Select course" : "Select department"} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__unset__">Not specified</SelectItem>
                    {deptOptions.map((d) => (
                      <SelectItem key={d} value={d}>
                        {d}
                      </SelectItem>
                    ))}
                    <SelectItem value={DEPARTMENT_OTHER}>Other (type below)</SelectItem>
                  </SelectContent>
                </Select>
                {(deptSelectValue === DEPARTMENT_OTHER || (!deptKnown && !!editData.department)) && (
                  <Input
                    className="mt-2"
                    value={editData.department || ""}
                    onChange={(e) => setEditData({ ...editData, department: e.target.value })}
                    placeholder={
                      isEngineeringEdit
                        ? "e.g. B.Tech, Diploma"
                        : "e.g. B.A. (English), or faculty name"
                    }
                  />
                )}
              </>
            ) : (
              <Input
                value={editData.department || ""}
                onChange={(e) => setEditData({ ...editData, department: e.target.value })}
                placeholder="Choose UG/PG above for standard departments, or type here"
              />
            )}
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Academic session</Label>
            <Select
              value={
                SESSION_OPTIONS.includes(editData.academic_session as any)
                  ? editData.academic_session
                  : "__unset__"
              }
              onValueChange={(v) =>
                setEditData({
                  ...editData,
                  academic_session: v === "__unset__" ? "" : v,
                })
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="Session" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__unset__">Not specified</SelectItem>
                {SESSION_OPTIONS.map((s) => (
                  <SelectItem key={s} value={s}>
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Semester</Label>
            <Select
              value={
                SEMESTER_OPTIONS.includes(editData.class_semester) ? editData.class_semester : "__unset__"
              }
              onValueChange={(v) =>
                setEditData({
                  ...editData,
                  class_semester: v === "__unset__" ? "" : v,
                })
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="Semester" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__unset__">Not specified</SelectItem>
                {SEMESTER_OPTIONS.map((s) => (
                  <SelectItem key={s} value={s}>
                    {s.replace("Semester ", "Sem ")}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">{registrationNumLabel}</Label>
            <Input
              value={editData.roll_number || ""}
              onChange={(e) => setEditData({ ...editData, roll_number: e.target.value })}
            />
          </div>
          {bnmuStudent ? (
            <div className="space-y-1">
              <Label className="text-xs">Roll number</Label>
              <Input
                value={universityRollNumber}
                onChange={(e) =>
                  setEditData({
                    ...editData,
                    university_roll_number: e.target.value,
                    metadata: {
                      ...(typeof editData.metadata === "object" && editData.metadata
                        ? editData.metadata
                        : {}),
                      university_roll_number: e.target.value,
                    },
                  })
                }
                placeholder="University roll number"
              />
            </div>
          ) : null}
          <div className="space-y-1 md:col-span-2">
            <Label className="text-xs">{isEngineeringEdit ? "Branch / Subject" : "Subject"}</Label>
            {subjectDeptOptions.length > 0 ? (
              <>
                <Select
                  value={subjectSelectValue}
                  onValueChange={(v) => {
                    if (v === SUBJECT_UNSET) {
                      setEditData({ ...editData, subject: "" });
                      return;
                    }
                    if (v === SUBJECT_CUSTOM) {
                      setEditData({
                        ...editData,
                        subject: (editData.subject as string) || subjectFromRow || "",
                      });
                      return;
                    }
                    setEditData({ ...editData, subject: v });
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select subject" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={SUBJECT_UNSET}>Not specified</SelectItem>
                    {subjectDeptOptions.map((s) => (
                      <SelectItem key={s} value={s}>
                        {s}
                      </SelectItem>
                    ))}
                    <SelectItem value={SUBJECT_CUSTOM}>Other (type below)</SelectItem>
                  </SelectContent>
                </Select>
                {subjectSelectValue === SUBJECT_CUSTOM && (
                  <Input
                    className="mt-2"
                    value={(editData.subject as string) ?? subjectFromRow}
                    onChange={(e) =>
                      setEditData({
                        ...editData,
                        subject: e.target.value,
                      })
                    }
                    placeholder="Enter subject name"
                  />
                )}
              </>
            ) : (
              <Input
                value={subjectFromRow}
                onChange={(e) =>
                  setEditData({
                    ...editData,
                    subject: e.target.value,
                  })
                }
                placeholder="e.g. M.A. specialization (no preset list for this department)"
              />
            )}
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Internship domain</Label>
            <Select
              value={
                editData.internship_domain &&
                domainOptions.some((d) => d.name === editData.internship_domain)
                  ? editData.internship_domain
                  : EDIT_DOMAIN_SENTINEL
              }
              onValueChange={(v) =>
                setEditData({
                  ...editData,
                  internship_domain: v === EDIT_DOMAIN_SENTINEL ? "" : v,
                  course: v === EDIT_DOMAIN_SENTINEL ? editData.course : v,
                })
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="Select domain" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={EDIT_DOMAIN_SENTINEL}>Not specified</SelectItem>
                {domainOptions.map((d) => (
                  <SelectItem key={d.id} value={d.name}>
                    {d.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Internship mode</Label>
            <Select
              value={MODE_OPTIONS.includes(internshipMode as any) ? internshipMode : "Online"}
              disabled={bnmuModeLocked}
              onValueChange={(v) => setEditData({ ...editData, internship_mode: v })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MODE_OPTIONS.map((m) => (
                  <SelectItem key={m} value={m}>
                    {m}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      <Separator className="bg-slate-100" />

      <div className="space-y-4">
        <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-primary flex items-center gap-2">
          <Briefcase className="size-3" /> Internship information
        </h4>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-1">
            <Label className="text-xs">Registration ID</Label>
            <Input
              value={editData.registration_id || ""}
              onChange={(e) => setEditData({ ...editData, registration_id: e.target.value })}
              placeholder="e.g. EZY/2026/INT/10001"
            />
          </div>
          {isEngineeringEdit ? (
            <>
              <div className="space-y-1">
                <Label className="text-xs">Duration type</Label>
                <Select
                  value={sectionType}
                  onValueChange={(v) => {
                    const nextType = v as BeuSectionType;
                    const nextOptions =
                      nextType === "Weeks" ? [...BEU_SECTION_WEEKS] : [...BEU_SECTION_HOURS];
                    const keep =
                      currentDuration && nextOptions.includes(currentDuration as never)
                        ? currentDuration
                        : nextOptions[0] || "";
                    setEditData({
                      ...editData,
                      section_type: nextType,
                      beu_section_type: nextType,
                      section_duration: keep,
                      internship_duration: keep,
                    });
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Hours or Weeks" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Hours">Hours</SelectItem>
                    <SelectItem value="Weeks">Weeks</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Internship duration</Label>
                <Select
                  value={
                    currentDuration && durationOptions.includes(currentDuration as never)
                      ? currentDuration
                      : durationOptions[0] || ""
                  }
                  onValueChange={(v) =>
                    setEditData({
                      ...editData,
                      section_type: sectionType,
                      beu_section_type: sectionType,
                      section_duration: v,
                      internship_duration: v,
                    })
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select duration" />
                  </SelectTrigger>
                  <SelectContent>
                    {durationOptions.map((d) => (
                      <SelectItem key={d} value={d}>
                        {d}
                      </SelectItem>
                    ))}
                    {currentDuration &&
                      !durationOptions.includes(currentDuration as never) && (
                        <SelectItem value={currentDuration}>{currentDuration}</SelectItem>
                      )}
                  </SelectContent>
                </Select>
              </div>
            </>
          ) : (
            <div className="space-y-1">
              <Label className="text-xs">Internship duration</Label>
              <Input
                value={editData.internship_duration || ""}
                onChange={(e) => setEditData({ ...editData, internship_duration: e.target.value })}
                placeholder="e.g. 120 Hours"
              />
            </div>
          )}
          <div className="space-y-1">
            <Label className="text-xs">Date of joining</Label>
            <Input
              type="date"
              value={editData.joining_date || ""}
              onChange={(e) => setEditData({ ...editData, joining_date: e.target.value })}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Date of completion</Label>
            <Input
              type="date"
              value={editData.completion_date || ""}
              onChange={(e) => setEditData({ ...editData, completion_date: e.target.value })}
            />
          </div>
        </div>
      </div>

      <Separator className="bg-slate-100" />

      <div className="space-y-4">
        <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-primary flex items-center gap-2">
          <Phone className="size-3" /> Emergency contacts
        </h4>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="space-y-1">
            <Label className="text-xs">Contact name</Label>
            <Input
              value={editData.emergency_name || ""}
              onChange={(e) => setEditData({ ...editData, emergency_name: e.target.value })}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Relationship</Label>
            <Input
              value={editData.emergency_relation || ""}
              onChange={(e) => setEditData({ ...editData, emergency_relation: e.target.value })}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Contact phone</Label>
            <Input
              value={editData.emergency_contact || ""}
              onChange={(e) => setEditData({ ...editData, emergency_contact: e.target.value })}
            />
          </div>
        </div>
      </div>
    </>
  );
}
