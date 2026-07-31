import Papa from "papaparse";
import * as XLSX from "xlsx";
import type { SupabaseClient } from "@supabase/supabase-js";

export type StudentDataUploadMode = "paid" | "unpaid";

export const STUDENT_DATA_UPLOAD_REQUIRED_HEADERS = [
  "Full Name",
  "Gender",
  "Parent Name",
  "Contact Number",
  "Email Address",
  "University",
  "College",
  "Degree (UG/PG)",
  "Department",
  "Subject",
  "Session",
  "Semester",
  "Registration Number",
  "Roll Number",
  "Internship Domain",
  "Mode (Online/Offline)",
  "Password",
] as const;

export type StudentDataUploadRow = {
  rowNumber: number;
  fullName: string;
  gender: string;
  parentName: string;
  contactNumber: string;
  email: string;
  university: string;
  college: string;
  degree: string;
  department: string;
  subject: string;
  session: string;
  semester: string;
  registrationNumber: string;
  rollNumber: string;
  internshipDomain: string;
  mode: string;
  password: string;
};

export type StudentDataUploadValidationError = {
  rowNumber: number;
  message: string;
};

export type StudentDataUploadProcessResult = {
  rowNumber: number;
  email: string;
  registrationNumber: string;
  success: boolean;
  skipped?: boolean;
  message?: string;
  userId?: string | null;
};

export type StudentDataUploadHistoryRow = {
  id: string;
  upload_mode: string;
  file_name: string | null;
  total_rows: number;
  imported_count: number;
  skipped_count: number;
  failed_count: number;
  failed_rows: unknown;
  imported_user_ids?: unknown;
  created_at: string;
};

export type StudentDataUploadImportedStudent = {
  id: string;
  email: string | null;
  full_name: string | null;
  contact_number: string | null;
  registration_id: string | null;
  roll_number: string | null;
  university_name: string | null;
  college_name: string | null;
  degree: string | null;
  department: string | null;
  status: string | null;
  gender: string | null;
  parent_name: string | null;
  academic_session: string | null;
  class_semester: string | null;
  internship_domain: string | null;
  metadata: unknown;
};

/** Paid / Unpaid tag for Student Data Upload imported rows (from metadata). */
export function getStudentDataUploadPaymentTag(
  metadata: unknown
): "paid" | "unpaid" {
  let meta: Record<string, unknown> = {};
  if (metadata && typeof metadata === "object" && !Array.isArray(metadata)) {
    meta = metadata as Record<string, unknown>;
  } else if (typeof metadata === "string") {
    try {
      const parsed = JSON.parse(metadata);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        meta = parsed as Record<string, unknown>;
      }
    } catch {
      /* ignore */
    }
  }

  if (meta.payment_required === true || meta.payment_required === "true") {
    return "unpaid";
  }
  if (meta.bulk_upload_paid === false || meta.bulk_upload_paid === "false") {
    return "unpaid";
  }
  return "paid";
}

type RowField = keyof Omit<StudentDataUploadRow, "rowNumber">;

const HEADER_ALIASES: Record<string, RowField> = {
  "full name": "fullName",
  fullname: "fullName",
  name: "fullName",
  gender: "gender",
  "parent name": "parentName",
  parent: "parentName",
  "father name": "parentName",
  "mother name": "parentName",
  "contact number": "contactNumber",
  contact: "contactNumber",
  mobile: "contactNumber",
  phone: "contactNumber",
  "email address": "email",
  email: "email",
  "e-mail": "email",
  university: "university",
  "university name": "university",
  college: "college",
  "college name": "college",
  degree: "degree",
  "degree (ug/pg)": "degree",
  "ug/pg": "degree",
  department: "department",
  subject: "subject",
  session: "session",
  "academic session": "session",
  semester: "semester",
  "class semester": "semester",
  "registration number": "registrationNumber",
  registration: "registrationNumber",
  "reg number": "registrationNumber",
  "reg no": "registrationNumber",
  "registration id": "registrationNumber",
  "roll number": "rollNumber",
  roll: "rollNumber",
  "roll no": "rollNumber",
  "internship domain": "internshipDomain",
  domain: "internshipDomain",
  course: "internshipDomain",
  mode: "mode",
  "mode (online/offline)": "mode",
  "internship mode": "mode",
  password: "password",
};

function normalizeHeader(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function cellToString(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(Math.trunc(value));
  }
  return String(value).trim();
}

function mapHeaderRow(headerRow: unknown[]): Record<number, RowField> {
  const map: Record<number, RowField> = {};
  headerRow.forEach((cell, index) => {
    const key = HEADER_ALIASES[normalizeHeader(cell)];
    if (key) map[index] = key;
  });
  return map;
}

function emptyRow(rowNumber: number): StudentDataUploadRow {
  return {
    rowNumber,
    fullName: "",
    gender: "",
    parentName: "",
    contactNumber: "",
    email: "",
    university: "",
    college: "",
    degree: "",
    department: "",
    subject: "",
    session: "",
    semester: "",
    registrationNumber: "",
    rollNumber: "",
    internshipDomain: "",
    mode: "",
    password: "",
  };
}

function rowFromCells(
  rowNumber: number,
  cells: unknown[],
  columnMap: Record<number, RowField>
): StudentDataUploadRow {
  const row = emptyRow(rowNumber);
  for (const [indexStr, field] of Object.entries(columnMap)) {
    row[field] = cellToString(cells[Number(indexStr)]);
  }
  return row;
}

function isRowEmpty(row: StudentDataUploadRow): boolean {
  return !(
    row.fullName ||
    row.gender ||
    row.parentName ||
    row.contactNumber ||
    row.email ||
    row.university ||
    row.college ||
    row.degree ||
    row.department ||
    row.subject ||
    row.session ||
    row.semester ||
    row.registrationNumber ||
    row.rollNumber ||
    row.internshipDomain ||
    row.mode ||
    row.password
  );
}

export function parseStudentDataUploadSheetRows(rawRows: unknown[][]): StudentDataUploadRow[] {
  if (!rawRows.length) return [];

  const headerIndex = rawRows.findIndex((row) =>
    (row || []).some((cell) => normalizeHeader(cell) in HEADER_ALIASES)
  );
  if (headerIndex < 0) {
    throw new Error(
      `Could not find a header row. Expected columns: ${STUDENT_DATA_UPLOAD_REQUIRED_HEADERS.join(", ")}.`
    );
  }

  const columnMap = mapHeaderRow(rawRows[headerIndex] || []);
  const mapped = new Set(Object.values(columnMap));
  for (const required of [
    "fullName",
    "contactNumber",
    "email",
    "registrationNumber",
    "password",
  ] as RowField[]) {
    if (!mapped.has(required)) {
      throw new Error(`Missing required column for ${required} in the header row.`);
    }
  }

  const parsed: StudentDataUploadRow[] = [];
  for (let i = headerIndex + 1; i < rawRows.length; i++) {
    const rowNumber = i + 1;
    const row = rowFromCells(rowNumber, rawRows[i] || [], columnMap);
    if (isRowEmpty(row)) continue;
    parsed.push(row);
  }
  return parsed;
}

export async function parseStudentDataUploadFile(file: File): Promise<StudentDataUploadRow[]> {
  const name = file.name.toLowerCase();
  if (name.endsWith(".csv")) {
    const text = await file.text();
    const parsed = Papa.parse<string[]>(text, { skipEmptyLines: false });
    if (parsed.errors.length > 0) {
      throw new Error(parsed.errors[0]?.message || "Failed to parse CSV file.");
    }
    return parseStudentDataUploadSheetRows(parsed.data as unknown[][]);
  }

  if (name.endsWith(".xlsx") || name.endsWith(".xls")) {
    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: "array" });
    const sheetName = workbook.SheetNames[0];
    if (!sheetName) throw new Error("Excel file has no worksheets.");
    const sheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" }) as unknown[][];
    return parseStudentDataUploadSheetRows(rows);
  }

  throw new Error("Upload a .csv or .xlsx file.");
}

function validateSingleRow(row: StudentDataUploadRow): string | null {
  if (!row.fullName.trim()) return "Full Name is required.";
  if (!row.gender.trim()) return "Gender is required.";
  if (!row.parentName.trim()) return "Parent Name is required.";
  const phone = row.contactNumber.replace(/\D/g, "");
  if (phone.length < 10) return "Contact Number must have at least 10 digits.";
  const email = row.email.trim().toLowerCase();
  if (!email.includes("@")) return "Email Address is required.";
  if (!row.university.trim()) return "University is required.";
  if (!row.college.trim()) return "College is required.";
  if (!row.degree.trim()) return "Degree (UG/PG) is required.";
  if (!row.department.trim()) return "Department is required.";
  if (!row.subject.trim()) return "Subject is required.";
  if (!row.session.trim()) return "Session is required.";
  if (!row.semester.trim()) return "Semester is required.";
  if (!row.registrationNumber.trim()) return "Registration Number is required.";
  if (!row.rollNumber.trim()) return "Roll Number is required.";
  if (!row.internshipDomain.trim()) return "Internship Domain is required.";
  if (!row.mode.trim()) return "Mode (Online/Offline) is required.";
  if (row.password.trim().length < 5) return "Password must be at least 5 characters.";
  return null;
}

/** Mandatory-field validation only. Contact/email duplicates are allowed. */
export function validateStudentDataUploadRows(
  rows: StudentDataUploadRow[]
): StudentDataUploadValidationError[] {
  const errors: StudentDataUploadValidationError[] = [];
  if (rows.length === 0) {
    errors.push({ rowNumber: 0, message: "No student rows found in the file." });
    return errors;
  }

  for (const row of rows) {
    const message = validateSingleRow(row);
    if (message) errors.push({ rowNumber: row.rowNumber, message });
  }
  return errors;
}

export async function fetchExistingRegistrationNumbers(
  client: SupabaseClient,
  registrationNumbers: string[]
): Promise<Set<string>> {
  const normalized = [
    ...new Set(registrationNumbers.map((r) => r.trim().toLowerCase()).filter(Boolean)),
  ];
  const found = new Set<string>();
  const chunkSize = 100;

  for (let i = 0; i < normalized.length; i += chunkSize) {
    const chunk = normalized.slice(i, i + chunkSize);
    const { data, error } = await client
      .from("students")
      .select("registration_id")
      .in("registration_id", chunk);
    if (error) {
      // Fallback: case-insensitive check per value if .in is case-sensitive mismatch
      for (const reg of chunk) {
        const { data: rows, error: err2 } = await client
          .from("students")
          .select("registration_id")
          .ilike("registration_id", reg)
          .limit(1);
        if (err2) throw err2;
        if (rows?.[0]?.registration_id) {
          found.add(String(rows[0].registration_id).trim().toLowerCase());
        }
      }
      continue;
    }
    for (const row of data || []) {
      if (row.registration_id) found.add(String(row.registration_id).trim().toLowerCase());
    }
  }

  return found;
}

export async function processStudentDataUploadRows(
  client: SupabaseClient,
  rows: StudentDataUploadRow[],
  mode: StudentDataUploadMode,
  onProgress?: (completed: number, total: number) => void,
  uploadId?: string | null
): Promise<StudentDataUploadProcessResult[]> {
  const results: StudentDataUploadProcessResult[] = [];
  const seenRegs = new Map<string, number>();
  const existingRegs = await fetchExistingRegistrationNumbers(
    client,
    rows.map((r) => r.registrationNumber)
  );

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const email = row.email.trim().toLowerCase();
    const reg = row.registrationNumber.trim();
    const regKey = reg.toLowerCase();

    const firstRow = seenRegs.get(regKey);
    if (firstRow != null) {
      results.push({
        rowNumber: row.rowNumber,
        email,
        registrationNumber: reg,
        success: false,
        skipped: true,
        message: `Duplicate Registration Number in file (also on row ${firstRow}).`,
      });
      onProgress?.(i + 1, rows.length);
      continue;
    }
    seenRegs.set(regKey, row.rowNumber);

    if (existingRegs.has(regKey)) {
      results.push({
        rowNumber: row.rowNumber,
        email,
        registrationNumber: reg,
        success: false,
        skipped: true,
        message: "Duplicate Registration Number — skipped.",
      });
      onProgress?.(i + 1, rows.length);
      continue;
    }

    try {
      const { data, error } = await client.rpc("admin_student_data_upload_import", {
        p_email: email,
        p_password: row.password.trim(),
        p_phone: row.contactNumber.replace(/\D/g, ""),
        p_full_name: row.fullName.trim(),
        p_gender: row.gender.trim(),
        p_parent_name: row.parentName.trim(),
        p_university_name: row.university.trim(),
        p_college_name: row.college.trim(),
        p_degree: row.degree.trim(),
        p_department: row.department.trim(),
        p_subject: row.subject.trim(),
        p_session: row.session.trim(),
        p_semester: row.semester.trim(),
        p_registration_number: reg,
        p_roll_number: row.rollNumber.trim(),
        p_internship_domain: row.internshipDomain.trim(),
        p_mode: row.mode.trim(),
        p_paid: mode === "paid",
        p_upload_id: uploadId || null,
      });

      if (error) throw error;

      const payload = (data || {}) as {
        ok?: boolean;
        user_id?: string;
        registration_id?: string;
      };

      results.push({
        rowNumber: row.rowNumber,
        email,
        registrationNumber: payload.registration_id || reg,
        success: true,
        userId: payload.user_id || null,
      });
      existingRegs.add(regKey);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to import student.";
      const isSkip =
        /duplicate registration number/i.test(message) || /skipped/i.test(message);
      results.push({
        rowNumber: row.rowNumber,
        email,
        registrationNumber: reg,
        success: false,
        skipped: isSkip,
        message,
      });
    }

    onProgress?.(i + 1, rows.length);
  }

  return results;
}

export async function saveStudentDataUploadHistory(
  client: SupabaseClient,
  params: {
    uploadId: string;
    mode: StudentDataUploadMode;
    fileName: string;
    results: StudentDataUploadProcessResult[];
    uploadedBy?: string | null;
  }
): Promise<void> {
  const failedRows = params.results
    .filter((r) => !r.success)
    .map((r) => ({
      rowNumber: r.rowNumber,
      email: r.email,
      registrationNumber: r.registrationNumber,
      message: r.message || "Failed",
      skipped: Boolean(r.skipped),
    }));

  const importedUserIds = params.results
    .filter((r) => r.success && r.userId)
    .map((r) => String(r.userId));

  const imported = params.results.filter((r) => r.success).length;
  const skipped = params.results.filter((r) => !r.success && r.skipped).length;
  const failed = params.results.filter((r) => !r.success && !r.skipped).length;

  const { error } = await client.rpc("admin_student_data_upload_save_history", {
    p_upload_id: params.uploadId,
    p_mode: params.mode,
    p_file_name: params.fileName,
    p_total_rows: params.results.length,
    p_imported_count: imported,
    p_skipped_count: skipped,
    p_failed_count: failed,
    p_failed_rows: failedRows,
    p_imported_user_ids: importedUserIds,
    p_uploaded_by: params.uploadedBy || null,
  });

  if (error) {
    // Fallback to table upsert if RPC is not deployed yet.
    const { error: upsertError } = await client.from("student_data_uploads").upsert(
      {
        id: params.uploadId,
        uploaded_by: params.uploadedBy || null,
        upload_mode: params.mode,
        file_name: params.fileName,
        total_rows: params.results.length,
        imported_count: imported,
        skipped_count: skipped,
        failed_count: failed,
        failed_rows: failedRows,
        imported_user_ids: importedUserIds,
      },
      { onConflict: "id" }
    );
    if (upsertError) {
      throw new Error(`Failed to save upload history: ${upsertError.message}`);
    }
  }
}

/** Create an empty history row before import so the sheet can always be deleted. */
export async function beginStudentDataUploadSheet(
  client: SupabaseClient,
  params: {
    uploadId: string;
    mode: StudentDataUploadMode;
    fileName: string;
    uploadedBy?: string | null;
  }
): Promise<void> {
  const { error } = await client.rpc("admin_student_data_upload_save_history", {
    p_upload_id: params.uploadId,
    p_mode: params.mode,
    p_file_name: params.fileName,
    p_total_rows: 0,
    p_imported_count: 0,
    p_skipped_count: 0,
    p_failed_count: 0,
    p_failed_rows: [],
    p_imported_user_ids: [],
    p_uploaded_by: params.uploadedBy || null,
  });

  if (error) {
    const { error: upsertError } = await client.from("student_data_uploads").upsert(
      {
        id: params.uploadId,
        uploaded_by: params.uploadedBy || null,
        upload_mode: params.mode,
        file_name: params.fileName,
        total_rows: 0,
        imported_count: 0,
        skipped_count: 0,
        failed_count: 0,
        failed_rows: [],
        imported_user_ids: [],
      },
      { onConflict: "id" }
    );
    if (upsertError) {
      throw new Error(`Failed to start upload sheet: ${upsertError.message}`);
    }
  }
}

function parseImportedUserIds(value: unknown): string[] {
  if (!value) return [];
  if (Array.isArray(value)) {
    return value.map((v) => String(v).trim()).filter(Boolean);
  }
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) {
        return parsed.map((v) => String(v).trim()).filter(Boolean);
      }
    } catch {
      /* ignore */
    }
  }
  return [];
}

export async function deleteStudentDataUploadSheet(
  client: SupabaseClient,
  uploadId: string,
  options?: { knownUserIds?: unknown }
): Promise<{ deletedStudents: number }> {
  const knownIds = parseImportedUserIds(options?.knownUserIds);

  const { data, error } = await client.rpc("admin_student_data_upload_delete_batch", {
    p_upload_id: uploadId,
  });
  if (error) throw error;
  const payload = (data || {}) as { deleted_students?: number };
  let deletedStudents = Number(payload.deleted_students || 0);

  // Client safety net: remove any remaining students still tagged with this upload.
  const leftoverIds = new Set<string>(knownIds);
  const { data: tagged } = await client
    .from("students")
    .select("id")
    .ilike("metadata", `%${uploadId}%`)
    .limit(5000);
  for (const row of tagged || []) {
    if (row?.id) leftoverIds.add(String(row.id));
  }

  for (const id of leftoverIds) {
    const { data: still } = await client.from("students").select("id").eq("id", id).maybeSingle();
    if (!still?.id) continue;
    try {
      await deleteImportedStudentRecord(client, id);
      deletedStudents += 1;
    } catch (err) {
      console.warn("[student-data-upload] leftover student delete failed:", id, err);
    }
  }

  return { deletedStudents };
}

export async function deleteAllStudentDataUploadImports(
  client: SupabaseClient
): Promise<{ deletedStudents: number }> {
  const { data, error } = await client.rpc("admin_student_data_upload_delete_all_imported");
  if (error) throw error;
  const payload = (data || {}) as { deleted_students?: number };
  return { deletedStudents: Number(payload.deleted_students || 0) };
}

export async function fetchStudentDataUploadHistory(
  client: SupabaseClient,
  limit = 100
): Promise<StudentDataUploadHistoryRow[]> {
  // Recover sheets that exist on students but were lost from history.
  const { error: backfillError } = await client.rpc(
    "admin_student_data_upload_backfill_history"
  );
  if (backfillError) {
    console.warn("[student-data-upload] history backfill:", backfillError.message);
  }

  const { data, error } = await client
    .from("student_data_uploads")
    .select(
      "id, upload_mode, file_name, total_rows, imported_count, skipped_count, failed_count, failed_rows, imported_user_ids, created_at"
    )
    .order("created_at", { ascending: false })
    .limit(limit);

  if (!error && data && data.length > 0) {
    return data as StudentDataUploadHistoryRow[];
  }
  if (error) {
    console.warn("[student-data-upload] history fetch:", error.message);
  }

  // Fallback: rebuild sheet list from imported students' upload_id tags.
  return reconstructHistoryFromImportedStudents(client, limit);
}

async function reconstructHistoryFromImportedStudents(
  client: SupabaseClient,
  limit = 100
): Promise<StudentDataUploadHistoryRow[]> {
  const { data, error } = await client
    .from("students")
    .select("id, metadata, created_at")
    .ilike("metadata", "%admin_student_data_upload%")
    .order("created_at", { ascending: false })
    .limit(5000);
  if (error || !data?.length) return [];

  type Acc = {
    id: string;
    mode: "paid" | "unpaid";
    ids: string[];
    created_at: string;
  };
  const byUpload = new Map<string, Acc>();

  for (const row of data) {
    let meta: Record<string, unknown> = {};
    const raw = row.metadata;
    if (raw && typeof raw === "object" && !Array.isArray(raw)) {
      meta = raw as Record<string, unknown>;
    } else if (typeof raw === "string") {
      try {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
          meta = parsed as Record<string, unknown>;
        }
      } catch {
        /* ignore */
      }
    }
    const uploadId = String(meta.upload_id || "").trim();
    if (!uploadId) continue;
    const unpaid =
      meta.payment_required === true ||
      meta.payment_required === "true" ||
      meta.bulk_upload_paid === false ||
      meta.bulk_upload_paid === "false";
    const created =
      typeof row.created_at === "string" && row.created_at.trim()
        ? row.created_at
        : new Date().toISOString();
    const existing = byUpload.get(uploadId);
    if (!existing) {
      byUpload.set(uploadId, {
        id: uploadId,
        mode: unpaid ? "unpaid" : "paid",
        ids: [String(row.id)],
        created_at: created,
      });
    } else {
      existing.ids.push(String(row.id));
      if (unpaid) existing.mode = "unpaid";
      if (created < existing.created_at) existing.created_at = created;
    }
  }

  return [...byUpload.values()]
    .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))
    .slice(0, limit)
    .map((item) => ({
      id: item.id,
      upload_mode: item.mode,
      file_name: "recovered-upload",
      total_rows: item.ids.length,
      imported_count: item.ids.length,
      skipped_count: 0,
      failed_count: 0,
      failed_rows: [],
      imported_user_ids: item.ids,
      created_at: item.created_at,
    }));
}

export async function fetchImportedStudentsFromUpload(
  client: SupabaseClient,
  limit = 20000
): Promise<StudentDataUploadImportedStudent[]> {
  const pageSize = 1000;
  const all: StudentDataUploadImportedStudent[] = [];
  let offset = 0;

  while (offset < limit) {
    const end = Math.min(offset + pageSize - 1, limit - 1);
    const { data, error } = await client
      .from("students")
      .select(
        "id, email, full_name, contact_number, registration_id, roll_number, university_name, college_name, degree, department, status, gender, parent_name, academic_session, class_semester, internship_domain, metadata"
      )
      .ilike("metadata", "%admin_student_data_upload%")
      .order("created_at", { ascending: false })
      .range(offset, end);
    if (error) throw error;
    const batch = (data || []) as StudentDataUploadImportedStudent[];
    all.push(...batch);
    if (batch.length < pageSize) break;
    offset += pageSize;
  }

  return all;
}

function parseStudentUploadMetadata(metadata: unknown): Record<string, unknown> {
  if (metadata && typeof metadata === "object" && !Array.isArray(metadata)) {
    return metadata as Record<string, unknown>;
  }
  if (typeof metadata === "string") {
    try {
      const parsed = JSON.parse(metadata);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      /* ignore */
    }
  }
  return {};
}

export async function fetchStudentsForUploadSheet(
  client: SupabaseClient,
  uploadId: string
): Promise<StudentDataUploadImportedStudent[]> {
  const pageSize = 1000;
  const all: StudentDataUploadImportedStudent[] = [];
  let offset = 0;

  while (true) {
    const { data, error } = await client
      .from("students")
      .select(
        "id, email, full_name, contact_number, registration_id, roll_number, university_name, college_name, degree, department, status, gender, parent_name, academic_session, class_semester, internship_domain, metadata"
      )
      .ilike("metadata", `%${uploadId}%`)
      .order("created_at", { ascending: true })
      .range(offset, offset + pageSize - 1);
    if (error) throw error;
    const batch = (data || []) as StudentDataUploadImportedStudent[];
    const matched = batch.filter((row) => {
      const meta = parseStudentUploadMetadata(row.metadata);
      return String(meta.upload_id || "").trim() === uploadId;
    });
    all.push(...matched);
    if (batch.length < pageSize) break;
    offset += pageSize;
  }

  return all;
}

/** Download the imported students for one upload sheet as CSV (template columns). */
export function downloadStudentDataUploadSheetCsv(
  rows: StudentDataUploadImportedStudent[],
  fileName?: string | null
): void {
  const data = rows.map((row) => {
    const meta = parseStudentUploadMetadata(row.metadata);
    return [
      row.full_name || "",
      row.gender || "",
      row.parent_name || "",
      row.contact_number || "",
      row.email || "",
      row.university_name || "",
      row.college_name || "",
      row.degree || "",
      row.department || "",
      String(meta.subject || row.department || ""),
      row.academic_session || "",
      row.class_semester || "",
      row.registration_id || "",
      row.roll_number || "",
      row.internship_domain || "",
      String(meta.internship_mode || meta.mode || ""),
      String(meta.password || ""),
    ];
  });

  const csv = Papa.unparse({
    fields: [...STUDENT_DATA_UPLOAD_REQUIRED_HEADERS],
    data,
  });
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  const base = String(fileName || "student_data_upload_sheet")
    .replace(/\.(xlsx|xls|csv)$/i, "")
    .replace(/[^\w.-]+/g, "_")
    .slice(0, 80);
  link.download = `${base || "student_data_upload_sheet"}.csv`;
  link.click();
  URL.revokeObjectURL(link.href);
}

/** Download the imported students for one upload sheet as XLSX. */
export function downloadStudentDataUploadSheetXlsx(
  rows: StudentDataUploadImportedStudent[],
  fileName?: string | null
): void {
  const aoa: unknown[][] = [[...STUDENT_DATA_UPLOAD_REQUIRED_HEADERS]];
  for (const row of rows) {
    const meta = parseStudentUploadMetadata(row.metadata);
    aoa.push([
      row.full_name || "",
      row.gender || "",
      row.parent_name || "",
      row.contact_number || "",
      row.email || "",
      row.university_name || "",
      row.college_name || "",
      row.degree || "",
      row.department || "",
      String(meta.subject || row.department || ""),
      row.academic_session || "",
      row.class_semester || "",
      row.registration_id || "",
      row.roll_number || "",
      row.internship_domain || "",
      String(meta.internship_mode || meta.mode || ""),
      String(meta.password || ""),
    ]);
  }
  const sheet = XLSX.utils.aoa_to_sheet(aoa);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, "Students");
  const base = String(fileName || "student_data_upload_sheet")
    .replace(/\.(xlsx|xls|csv)$/i, "")
    .replace(/[^\w.-]+/g, "_")
    .slice(0, 80);
  XLSX.writeFile(workbook, `${base || "student_data_upload_sheet"}.xlsx`);
}

export async function updateImportedStudentRecord(
  client: SupabaseClient,
  id: string,
  patch: Partial<{
    full_name: string;
    gender: string;
    parent_name: string;
    contact_number: string;
    email: string;
    university_name: string;
    college_name: string;
    degree: string;
    department: string;
    academic_session: string;
    class_semester: string;
    registration_id: string;
    roll_number: string;
    internship_domain: string;
    status: string;
  }>
): Promise<void> {
  const { error } = await client.from("students").update(patch).eq("id", id);
  if (error) throw error;
}

export async function deleteImportedStudentRecord(
  client: SupabaseClient,
  id: string
): Promise<void> {
  const { data, error } = await client.rpc("admin_student_data_upload_delete_students", {
    p_ids: [id],
  });
  if (error) {
    // Fallback for environments without the new RPC yet.
    const { error: delErr } = await client.from("students").delete().eq("id", id);
    if (delErr) throw error;
    return;
  }
  const payload = (data || {}) as { deleted_students?: number };
  if (Number(payload.deleted_students || 0) < 1) {
    const { error: delErr } = await client.from("students").delete().eq("id", id);
    if (delErr) throw delErr;
  }
}

export async function deleteImportedStudentRecords(
  client: SupabaseClient,
  ids: string[]
): Promise<{ deletedStudents: number }> {
  const unique = [...new Set(ids.map((id) => String(id).trim()).filter(Boolean))];
  if (unique.length === 0) return { deletedStudents: 0 };

  const { data, error } = await client.rpc("admin_student_data_upload_delete_students", {
    p_ids: unique,
  });
  if (error) throw error;
  const payload = (data || {}) as { deleted_students?: number };
  return { deletedStudents: Number(payload.deleted_students || 0) };
}

/** Empty form values for adding one Student Data Upload student. */
export function emptyStudentDataUploadAddForm(): Record<string, string> {
  return {
    fullName: "",
    gender: "",
    parentName: "",
    contactNumber: "",
    email: "",
    university: "",
    college: "",
    degree: "",
    department: "",
    subject: "",
    session: "",
    semester: "",
    registrationNumber: "",
    rollNumber: "",
    internshipDomain: "",
    mode: "Online",
    password: "",
  };
}

export function studentDataUploadAddFormToRow(
  form: Record<string, string>,
  rowNumber = 1
): StudentDataUploadRow {
  return {
    rowNumber,
    fullName: form.fullName || "",
    gender: form.gender || "",
    parentName: form.parentName || "",
    contactNumber: form.contactNumber || "",
    email: form.email || "",
    university: form.university || "",
    college: form.college || "",
    degree: form.degree || "",
    department: form.department || "",
    subject: form.subject || "",
    session: form.session || "",
    semester: form.semester || "",
    registrationNumber: form.registrationNumber || "",
    rollNumber: form.rollNumber || "",
    internshipDomain: form.internshipDomain || "",
    mode: form.mode || "",
    password: form.password || "",
  };
}

export function downloadFailedStudentDataUploadRows(
  results: StudentDataUploadProcessResult[]
): void {
  const failed = results.filter((r) => !r.success);
  const csv = Papa.unparse({
    fields: ["Row", "Email", "Registration Number", "Status", "Message"],
    data: failed.map((r) => [
      r.rowNumber,
      r.email,
      r.registrationNumber,
      r.skipped ? "Skipped" : "Failed",
      r.message || "",
    ]),
  });
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `student_data_upload_failed_${Date.now()}.csv`;
  link.click();
  URL.revokeObjectURL(link.href);
}

export function downloadStudentDataUploadCsvTemplate(): void {
  const csv = Papa.unparse({
    fields: [...STUDENT_DATA_UPLOAD_REQUIRED_HEADERS],
    data: [
      [
        "Priya Sharma",
        "Female",
        "Ramesh Sharma",
        "9876543210",
        "priya.sharma@example.com",
        "Example University",
        "Example College",
        "UG",
        "Arts",
        "History",
        "2024-28",
        "4",
        "REG2024001",
        "ROLL101",
        "Digital Marketing",
        "Online",
        "pass123",
      ],
    ],
  });
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = "student_data_upload_template.csv";
  link.click();
  URL.revokeObjectURL(link.href);
}

export function downloadStudentDataUploadXlsxTemplate(): void {
  const sheet = XLSX.utils.aoa_to_sheet([
    [...STUDENT_DATA_UPLOAD_REQUIRED_HEADERS],
    [
      "Priya Sharma",
      "Female",
      "Ramesh Sharma",
      "9876543210",
      "priya.sharma@example.com",
      "Example University",
      "Example College",
      "UG",
      "Arts",
      "History",
      "2024-28",
      "4",
      "REG2024001",
      "ROLL101",
      "Digital Marketing",
      "Online",
      "pass123",
    ],
  ]);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, "Students");
  XLSX.writeFile(workbook, "student_data_upload_template.xlsx");
}
