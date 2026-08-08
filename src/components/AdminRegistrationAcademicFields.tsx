import { useEffect, useMemo, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { GraduationCap } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { displayCollegeName } from "@/lib/collegeDisplay";
import {
  fetchRegistrationColleges,
  fetchRegistrationUniversities,
  type RegistrationCollege,
  type RegistrationUniversity,
} from "@/lib/registrationCatalog";
import { baSubjects, bcomSubjects, bscSubjects } from "@/lib/subjectOptions";
import { isBeuStudent } from "@/lib/feeRules";
import {
  fetchEngineeringConfigMap,
  type EngineeringUniversityConfig,
} from "@/lib/engineeringConfig";
import {
  fetchNonEngineeringConfigMap,
  resolveNonEngineeringOptions,
  type NonEngineeringUniversityConfig,
} from "@/lib/nonEngineeringConfig";
import {
  departmentsForNonTechDegree,
  filterNonEngineeringCoursesForDegree,
} from "@/lib/studentTrack";
import type { BeuFormData } from "@/lib/beuRegistration";
import { BeuRegistrationModal } from "@/components/BeuRegistrationModal";

export type AdminRegistrationAcademicValues = {
  universityName: string;
  collegeName: string;
  degree: string;
  department: string;
  subject: string;
  course: string;
  beuFormData?: BeuFormData | null;
  /** engineering | non_tech — set from selected university flow */
  studentTrack?: "engineering" | "non_tech";
};

export const EMPTY_ADMIN_REGISTRATION_ACADEMIC: AdminRegistrationAcademicValues = {
  universityName: "",
  collegeName: "",
  degree: "",
  department: "",
  subject: "",
  course: "",
  beuFormData: null,
  studentTrack: "non_tech",
};

type Props = {
  client: SupabaseClient;
  values: AdminRegistrationAcademicValues;
  onChange: (values: AdminRegistrationAcademicValues) => void;
  idPrefix?: string;
};

export function AdminRegistrationAcademicFields({
  client,
  values,
  onChange,
  idPrefix = "add-reg",
}: Props) {
  const [unis, setUnis] = useState<RegistrationUniversity[]>([]);
  const [colleges, setColleges] = useState<RegistrationCollege[]>([]);
  const [domains, setDomains] = useState<Array<{ name: string }>>([]);
  const [engineeringConfigByUniId, setEngineeringConfigByUniId] = useState<
    Map<string, EngineeringUniversityConfig>
  >(new Map());
  const [nonTechConfigByUniId, setNonTechConfigByUniId] = useState<
    Map<string, NonEngineeringUniversityConfig>
  >(new Map());
  const [universityId, setUniversityId] = useState("");
  const [collegeId, setCollegeId] = useState("");
  const [beuModalOpen, setBeuModalOpen] = useState(false);

  useEffect(() => {
    void fetchRegistrationUniversities(client).then(setUnis).catch(() => setUnis([]));
    void client
      .from("internship_domains")
      .select("name")
      .order("name")
      .then(({ data }) => setDomains((data as Array<{ name: string }>) || []));
    void fetchEngineeringConfigMap(client)
      .then(setEngineeringConfigByUniId)
      .catch(() => setEngineeringConfigByUniId(new Map()));
    void fetchNonEngineeringConfigMap(client)
      .then(setNonTechConfigByUniId)
      .catch(() => setNonTechConfigByUniId(new Map()));
  }, [client]);

  useEffect(() => {
    if (!universityId) {
      setColleges([]);
      setCollegeId("");
      return;
    }
    void fetchRegistrationColleges(client, universityId)
      .then(setColleges)
      .catch(() => setColleges([]));
  }, [client, universityId]);

  useEffect(() => {
    if (!values.universityName || !unis.length) return;
    const match = unis.find((u) => u.name === values.universityName);
    if (match && match.id !== universityId) setUniversityId(match.id);
  }, [values.universityName, unis, universityId]);

  useEffect(() => {
    if (!values.collegeName || !colleges.length) return;
    const match = colleges.find((c) => c.name === values.collegeName);
    if (match && match.id !== collegeId) setCollegeId(match.id);
  }, [values.collegeName, colleges, collegeId]);

  const selectedUni = unis.find((u) => u.id === universityId);
  const activeEngineeringConfig = universityId
    ? engineeringConfigByUniId.get(universityId)
    : undefined;
  const activeNonTechConfig = universityId
    ? nonTechConfigByUniId.get(universityId) || null
    : null;
  const nonTechOptions = useMemo(
    () => resolveNonEngineeringOptions(activeNonTechConfig),
    [activeNonTechConfig]
  );
  const departmentOptions = useMemo(() => {
    if (activeNonTechConfig) {
      return filterNonEngineeringCoursesForDegree(values.degree, nonTechOptions.courses);
    }
    return departmentsForNonTechDegree(values.degree);
  }, [activeNonTechConfig, values.degree, nonTechOptions.courses]);
  const isEngineeringFlow =
    Boolean(activeEngineeringConfig) || isBeuStudent(selectedUni?.name);
  const beuDetailsCompleted = Boolean(values.beuFormData);

  useEffect(() => {
    if (!isEngineeringFlow) {
      if (values.beuFormData) {
        onChange({ ...values, beuFormData: null });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reset engineering payload when university changes
  }, [isEngineeringFlow, universityId]);

  const domainOptions = useMemo(() => {
    if (isEngineeringFlow && activeEngineeringConfig?.domains?.length) {
      return activeEngineeringConfig.domains;
    }
    return domains.map((d) => d.name);
  }, [isEngineeringFlow, activeEngineeringConfig, domains]);

  const patch = (partial: Partial<AdminRegistrationAcademicValues>) =>
    onChange({ ...values, ...partial });

  const handleBeuSubmit = (data: BeuFormData) => {
    patch({
      beuFormData: data,
      collegeName: data.collegeName || values.collegeName,
      course: data.internshipDomain || values.course,
      degree: data.course || values.degree,
      department: data.branchSubject || values.department,
      subject: data.specialization || values.subject,
      studentTrack: "engineering",
    });
    setBeuModalOpen(false);
  };

  return (
    <div className="space-y-3 rounded-xl border border-slate-100 bg-slate-50/80 p-4">
      <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">
        Academic details (optional — same as registration form)
      </p>

      {isEngineeringFlow && (
        <div className="rounded-xl border-2 border-primary/30 bg-primary/5 p-3 text-xs">
          <p className="font-bold text-primary flex items-center gap-1.5">
            <GraduationCap className="size-3.5" />
            {selectedUni?.name || "Engineering university"} registration
          </p>
          <p className="text-muted-foreground mt-1">
            Select university and college, then complete the engineering form for course, branch,
            specialization, and internship domain.
          </p>
          {beuDetailsCompleted && values.beuFormData ? (
            <p className="text-emerald-700 font-medium mt-2">
              Engineering details saved: {values.beuFormData.course} ·{" "}
              {values.beuFormData.branchSubject} · {values.beuFormData.sectionDuration}
            </p>
          ) : (
            <Button
              type="button"
              size="sm"
              className="mt-2 h-8 text-xs font-bold"
              disabled={!collegeId}
              onClick={() => setBeuModalOpen(true)}
            >
              Complete engineering details
            </Button>
          )}
        </div>
      )}

      <div className="grid sm:grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor={`${idPrefix}-uni`} className="text-xs">
            University
          </Label>
          <Select
            value={universityId || undefined}
            onValueChange={(id) => {
              setUniversityId(id);
              setCollegeId("");
              const uni = unis.find((u) => u.id === id);
              const engFlow =
                Boolean(engineeringConfigByUniId.get(id)) || isBeuStudent(uni?.name);
              patch({
                universityName: uni?.name || "",
                collegeName: "",
                degree: "",
                department: "",
                subject: "",
                course: "",
                beuFormData: null,
                studentTrack: engFlow ? "engineering" : "non_tech",
              });
            }}
          >
            <SelectTrigger id={`${idPrefix}-uni`} className="h-9 text-xs bg-white">
              <SelectValue placeholder="Select university" />
            </SelectTrigger>
            <SelectContent>
              {unis.map((u) => (
                <SelectItem key={u.id} value={u.id}>
                  {u.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`${idPrefix}-college`} className="text-xs">
            College
          </Label>
          <Select
            value={collegeId || undefined}
            onValueChange={(id) => {
              setCollegeId(id);
              const college = colleges.find((c) => c.id === id);
              patch({ collegeName: college?.name || "", beuFormData: null });
            }}
            disabled={!universityId}
          >
            <SelectTrigger id={`${idPrefix}-college`} className="h-9 text-xs bg-white">
              <SelectValue placeholder={universityId ? "Select college" : "Pick university first"} />
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

        {!isEngineeringFlow && (
          <>
            <div className="space-y-1.5">
              <Label className="text-xs">Degree</Label>
              <RadioGroup
                value={values.degree}
                onValueChange={(degree) =>
                  patch({ degree, department: "", subject: "", course: "" })
                }
                className="flex gap-4 pt-1"
              >
                {["UG", "PG"].map((d) => (
                  <label key={d} className="flex items-center gap-1.5 cursor-pointer text-xs">
                    <RadioGroupItem value={d} id={`${idPrefix}-deg-${d}`} />
                    {d}
                  </label>
                ))}
              </RadioGroup>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`${idPrefix}-dept`} className="text-xs">
                Department
              </Label>
              <Select
                value={values.department || undefined}
                onValueChange={(department) => patch({ department, subject: "", course: "" })}
                disabled={!values.degree}
              >
                <SelectTrigger id={`${idPrefix}-dept`} className="h-9 text-xs bg-white">
                  <SelectValue placeholder={values.degree ? "Select department" : "Select degree first"} />
                </SelectTrigger>
                <SelectContent>
                  {departmentOptions.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`${idPrefix}-subject`} className="text-xs">
                Subject
              </Label>
              {activeNonTechConfig &&
              (nonTechOptions.branchesByCourse[values.department] || []).filter((s) => s !== "Other")
                .length > 0 ? (
                <Select
                  value={values.subject || undefined}
                  onValueChange={(subject) => patch({ subject, course: "" })}
                >
                  <SelectTrigger id={`${idPrefix}-subject`} className="h-9 text-xs bg-white">
                    <SelectValue placeholder="Select subject" />
                  </SelectTrigger>
                  <SelectContent>
                    {(nonTechOptions.branchesByCourse[values.department] || [])
                      .filter((s) => s !== "Other")
                      .map((s) => (
                        <SelectItem key={s} value={s}>
                          {s}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              ) : values.department?.includes(".") ? (
                <Select
                  value={values.subject || undefined}
                  onValueChange={(subject) => patch({ subject, course: "" })}
                >
                  <SelectTrigger id={`${idPrefix}-subject`} className="h-9 text-xs bg-white">
                    <SelectValue placeholder="Select subject" />
                  </SelectTrigger>
                  <SelectContent>
                    {values.department === "B.A." &&
                      baSubjects.map((s) => (
                        <SelectItem key={s} value={s}>
                          {s}
                        </SelectItem>
                      ))}
                    {values.department === "B.Sc" &&
                      bscSubjects.map((s) => (
                        <SelectItem key={s} value={s}>
                          {s}
                        </SelectItem>
                      ))}
                    {values.department === "B.Com" &&
                      bcomSubjects.map((s) => (
                        <SelectItem key={s} value={s}>
                          {s}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              ) : (
                <Input
                  id={`${idPrefix}-subject`}
                  className="h-9 text-xs bg-white"
                  value={values.subject}
                  onChange={(e) => patch({ subject: e.target.value, course: "" })}
                  placeholder="Optional"
                />
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`${idPrefix}-course`} className="text-xs">
                Internship domain / course
              </Label>
              <Select
                value={values.course || undefined}
                onValueChange={(course) => patch({ course })}
                disabled={!values.subject && !!values.department?.includes(".")}
              >
                <SelectTrigger id={`${idPrefix}-course`} className="h-9 text-xs bg-white">
                  <SelectValue
                    placeholder={
                      values.department?.includes(".") && !values.subject
                        ? "Select subject first"
                        : "Select domain"
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  {domainOptions.map((name) => (
                    <SelectItem key={name} value={name}>
                      {name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </>
        )}

        {isEngineeringFlow && beuDetailsCompleted && values.beuFormData ? (
          <div className="sm:col-span-2 space-y-1.5">
            <Label className="text-xs">Internship domain (from engineering form)</Label>
            <Input
              className="h-9 text-xs bg-white"
              readOnly
              value={values.beuFormData.internshipDomain || values.course}
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 text-xs"
              onClick={() => setBeuModalOpen(true)}
            >
              Edit engineering details
            </Button>
          </div>
        ) : null}
      </div>

      <BeuRegistrationModal
        open={beuModalOpen}
        onOpenChange={setBeuModalOpen}
        colleges={colleges}
        engineeringConfig={activeEngineeringConfig}
        universityLabel={selectedUni?.name}
        initialCollegeId={collegeId}
        initialDomain={values.course}
        onSubmit={handleBeuSubmit}
      />
    </div>
  );
}
