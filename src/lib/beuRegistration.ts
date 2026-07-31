export const BEU_COURSES = [
  "B.Tech",
  "M.Tech",
  "Diploma",
  "MBA",
  "MCA",
  "Other",
] as const;

export const BEU_BRANCHES = [
  "Computer Science & Engineering",
  "Artificial Intelligence & Data Science",
  "Information Technology",
  "Electronics & Communication",
  "Electrical Engineering",
  "Mechanical Engineering",
  "Civil Engineering",
  "Other",
] as const;

export const BEU_SPECIALIZATIONS = [
  "Artificial Intelligence",
  "Data Science",
  "Cyber Security",
  "Machine Learning",
  "Cloud Computing",
  "IoT",
  "Robotics",
  "VLSI",
  "Structural Engineering",
  "Power Systems",
  "Software Engineering",
  "Other",
] as const;

export const BEU_SECTION_HOURS = [
  "20 Hours",
  "40 Hours",
  "60 Hours",
  "80 Hours",
  "100 Hours",
  "120 Hours",
] as const;

export const BEU_SECTION_WEEKS = [
  "2 Weeks",
  "4 Weeks",
  "6 Weeks",
  "8 Weeks",
  "10 Weeks",
  "12 Weeks",
  "16 Weeks",
  "20 Weeks",
  "24 Weeks",
] as const;

export const BEU_SESSIONS = ["2023-2027", "2024-2028", "2025-2029"] as const;

export const BEU_SEMESTERS = [
  "Semester 1",
  "Semester 2",
  "Semester 3",
  "Semester 4",
  "Semester 5",
  "Semester 6",
  "Semester 7",
  "Semester 8",
] as const;

export const BEU_MODES = ["Online", "Offline", "Hybrid"] as const;

export type BeuSectionType = "Hours" | "Weeks";

export type BeuFormData = {
  collegeId: string;
  collegeName: string;
  course: string;
  branchSubject: string;
  specialization: string;
  sectionType: BeuSectionType;
  sectionDuration: string;
  semester: string;
  session: string;
  internshipDomain: string;
  registrationNumber: string;
  mode: string;
};

export function beuCourseToDegree(course: string): string {
  if (course === "M.Tech" || course === "MBA" || course === "MCA") return "PG";
  return "UG";
}

export function beuDurationLabel(data: Pick<BeuFormData, "sectionType" | "sectionDuration">): string {
  return data.sectionDuration.trim();
}

export function beuFormToStudentFields(data: BeuFormData) {
  return {
    degree: beuCourseToDegree(data.course),
    departmentName: data.course,
    subject: data.branchSubject,
    session: data.session,
    classSem: data.semester,
    rollNo: data.registrationNumber,
    course: data.internshipDomain,
    internshipMode: data.mode,
    internshipDuration: beuDurationLabel(data),
  };
}

export function validateBeuForm(data: Partial<BeuFormData>): string | null {
  if (!data.collegeId?.trim()) return "Select college";
  if (!data.course?.trim()) return "Select course";
  if (!data.branchSubject?.trim()) return "Select branch / subject";
  if (!data.specialization?.trim()) return "Enter specialization";
  if (!data.sectionType?.trim()) return "Select section type";
  if (!data.sectionDuration?.trim()) return "Select duration";
  if (!data.semester?.trim()) return "Select semester";
  if (!data.session?.trim()) return "Select session";
  if (!data.internshipDomain?.trim()) return "Select internship domain";
  if (!data.registrationNumber?.trim()) return "Enter registration number";
  if (!data.mode?.trim()) return "Select mode";
  return null;
}
