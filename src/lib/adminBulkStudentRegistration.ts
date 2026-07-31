import Papa from "papaparse";
import * as XLSX from "xlsx";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  adminCreateMinimalStudentRegistration,
  type AdminAddRegistrationInput,
  validateAdminAddRegistrationInput,
} from "@/lib/adminCreateMinimalStudentRegistration";
import { ADMIN_BULK_UPLOAD_SOURCE } from "@/lib/studentRegistrationSource";

export const BULK_REGISTRATION_REQUIRED_HEADERS = [
  "Email",
  "Mobile",
  "Password",
] as const;

export const BULK_REGISTRATION_OPTIONAL_HEADERS = [
  "Full Name",
  "Razorpay Pay ID",
  "University",
  "College",
  "Degree",
  "Department",
  "Subject",
  "Internship Domain",
] as const;

export const BULK_REGISTRATION_HEADERS = [
  ...BULK_REGISTRATION_REQUIRED_HEADERS,
  ...BULK_REGISTRATION_OPTIONAL_HEADERS,
] as const;

export type BulkRegistrationRow = {
  rowNumber: number;
  email: string;
  mobile: string;
  password: string;
  fullName: string;
  paymentId: string;
  universityName: string;
  collegeName: string;
  degree: string;
  department: string;
  subject: string;
  course: string;
};

export type BulkRegistrationValidationError = {
  rowNumber: number;
  message: string;
};

export type BulkRegistrationProcessResult = {
  rowNumber: number;
  email: string;
  success: boolean;
  message?: string;
  registrationId?: string | null;
};

const HEADER_ALIASES: Record<string, keyof Omit<BulkRegistrationRow, "rowNumber">> = {
  email: "email",
  "e-mail": "email",
  mobile: "mobile",
  phone: "mobile",
  "contact number": "mobile",
  contact: "mobile",
  password: "password",
  "full name": "fullName",
  fullname: "fullName",
  name: "fullName",
  "razorpay pay id": "paymentId",
  "razorpay payment id": "paymentId",
  "payment id": "paymentId",
  payid: "paymentId",
  "pay id": "paymentId",
  university: "universityName",
  "university name": "universityName",
  college: "collegeName",
  "college name": "collegeName",
  degree: "degree",
  department: "department",
  subject: "subject",
  course: "course",
  "internship domain": "course",
  domain: "course",
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

function mapHeaderRow(headerRow: unknown[]): Record<number, keyof Omit<BulkRegistrationRow, "rowNumber">> {
  const map: Record<number, keyof Omit<BulkRegistrationRow, "rowNumber">> = {};
  headerRow.forEach((cell, index) => {
    const key = HEADER_ALIASES[normalizeHeader(cell)];
    if (key) map[index] = key;
  });
  return map;
}

function rowFromCells(
  rowNumber: number,
  cells: unknown[],
  columnMap: Record<number, keyof Omit<BulkRegistrationRow, "rowNumber">>
): BulkRegistrationRow {
  const row: BulkRegistrationRow = {
    rowNumber,
    email: "",
    mobile: "",
    password: "",
    fullName: "",
    paymentId: "",
    universityName: "",
    collegeName: "",
    degree: "",
    department: "",
    subject: "",
    course: "",
  };
  for (const [indexStr, field] of Object.entries(columnMap)) {
    const index = Number(indexStr);
    row[field] = cellToString(cells[index]);
  }
  return row;
}

function isRowEmpty(row: BulkRegistrationRow): boolean {
  return (
    !row.email &&
    !row.mobile &&
    !row.password &&
    !row.fullName &&
    !row.paymentId &&
    !row.universityName &&
    !row.collegeName &&
    !row.degree &&
    !row.department &&
    !row.subject &&
    !row.course
  );
}

export function parseBulkRegistrationSheetRows(rawRows: unknown[][]): BulkRegistrationRow[] {
  if (!rawRows.length) return [];

  const headerIndex = rawRows.findIndex((row) =>
    (row || []).some((cell) => normalizeHeader(cell) in HEADER_ALIASES)
  );
  if (headerIndex < 0) {
    throw new Error(
      `Could not find a header row. Use these columns in order: ${BULK_REGISTRATION_HEADERS.join(", ")}.`
    );
  }

  const columnMap = mapHeaderRow(rawRows[headerIndex] || []);
  if (!Object.values(columnMap).includes("email")) {
    throw new Error('Missing required "Email" column in the header row.');
  }

  const parsed: BulkRegistrationRow[] = [];
  for (let i = headerIndex + 1; i < rawRows.length; i++) {
    const rowNumber = i + 1;
    const row = rowFromCells(rowNumber, rawRows[i] || [], columnMap);
    if (isRowEmpty(row)) continue;
    parsed.push(row);
  }
  return parsed;
}

export async function parseBulkRegistrationFile(file: File): Promise<BulkRegistrationRow[]> {
  const name = file.name.toLowerCase();
  if (name.endsWith(".csv")) {
    const text = await file.text();
    const parsed = Papa.parse<string[]>(text, { skipEmptyLines: false });
    if (parsed.errors.length > 0) {
      throw new Error(parsed.errors[0]?.message || "Failed to parse CSV file.");
    }
    return parseBulkRegistrationSheetRows(parsed.data as unknown[][]);
  }

  if (name.endsWith(".xlsx") || name.endsWith(".xls")) {
    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: "array" });
    const sheetName = workbook.SheetNames[0];
    if (!sheetName) throw new Error("Excel file has no worksheets.");
    const sheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" }) as unknown[][];
    return parseBulkRegistrationSheetRows(rows);
  }

  throw new Error("Upload a .csv or .xlsx file.");
}

function toRegistrationInput(row: BulkRegistrationRow): AdminAddRegistrationInput {
  return {
    email: row.email,
    phone: row.mobile,
    password: row.password,
    fullName: row.fullName || undefined,
    paymentId: row.paymentId || undefined,
    universityName: row.universityName || undefined,
    collegeName: row.collegeName || undefined,
    course: row.course || undefined,
    degree: row.degree || undefined,
    department: row.department || undefined,
    subject: row.subject || undefined,
  };
}

export function validateBulkRegistrationRows(
  rows: BulkRegistrationRow[],
  existingEmails: Set<string> = new Set()
): BulkRegistrationValidationError[] {
  const errors: BulkRegistrationValidationError[] = [];
  const seenEmails = new Map<string, number>();

  if (rows.length === 0) {
    errors.push({ rowNumber: 0, message: "No student rows found in the file." });
    return errors;
  }

  for (const row of rows) {
    const input = toRegistrationInput(row);
    const validationError = validateAdminAddRegistrationInput(input);
    if (validationError) {
      errors.push({ rowNumber: row.rowNumber, message: validationError });
      continue;
    }

    const email = input.email.trim().toLowerCase();
    const phoneDigits = input.phone.replace(/\D/g, "");
    if (phoneDigits.length !== 10) {
      errors.push({
        rowNumber: row.rowNumber,
        message: "Mobile must be exactly 10 digits.",
      });
    }

    const firstRow = seenEmails.get(email);
    if (firstRow != null) {
      errors.push({
        rowNumber: row.rowNumber,
        message: `Duplicate email in file (also on row ${firstRow}).`,
      });
    } else {
      seenEmails.set(email, row.rowNumber);
    }

    if (existingEmails.has(email)) {
      errors.push({
        rowNumber: row.rowNumber,
        message: "Email is already registered in the student directory.",
      });
    }
  }

  return errors;
}

export async function fetchExistingRegistrationEmails(
  client: SupabaseClient,
  emails: string[]
): Promise<Set<string>> {
  const normalized = [...new Set(emails.map((e) => e.trim().toLowerCase()).filter(Boolean))];
  const found = new Set<string>();
  const chunkSize = 100;

  for (let i = 0; i < normalized.length; i += chunkSize) {
    const chunk = normalized.slice(i, i + chunkSize);
    const { data, error } = await client.from("students").select("email").in("email", chunk);
    if (error) throw error;
    for (const row of data || []) {
      if (row.email) found.add(String(row.email).trim().toLowerCase());
    }
  }

  return found;
}

export async function processBulkRegistrationRows(
  client: SupabaseClient,
  rows: BulkRegistrationRow[],
  onProgress?: (completed: number, total: number) => void
): Promise<BulkRegistrationProcessResult[]> {
  const results: BulkRegistrationProcessResult[] = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const input = toRegistrationInput(row);
    try {
      const result = await adminCreateMinimalStudentRegistration(client, {
        ...input,
        registrationSource: ADMIN_BULK_UPLOAD_SOURCE,
      });
      results.push({
        rowNumber: row.rowNumber,
        email: result.email,
        success: true,
        registrationId: result.registrationId,
      });
    } catch (err) {
      results.push({
        rowNumber: row.rowNumber,
        email: input.email,
        success: false,
        message: err instanceof Error ? err.message : "Failed to create registration.",
      });
    }
    onProgress?.(i + 1, rows.length);
  }

  return results;
}

export function buildBulkRegistrationCsvTemplate(): string {
  return Papa.unparse({
    fields: [...BULK_REGISTRATION_HEADERS],
    data: [
      [
        "student@example.com",
        "9876543210",
        "pass123",
        "Priya Sharma",
        "pay_ABC123",
        "Lalit Narayan Mithila University",
        "Example College, Darbhanga",
        "UG",
        "B.A.",
        "History",
        "Digital Marketing",
      ],
    ],
  });
}

export function downloadBulkRegistrationCsvTemplate(): void {
  const csv = buildBulkRegistrationCsvTemplate();
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = "bulk_registration_template.csv";
  link.click();
  URL.revokeObjectURL(link.href);
}

export function downloadBulkRegistrationXlsxTemplate(): void {
  const sheet = XLSX.utils.aoa_to_sheet([
    [...BULK_REGISTRATION_HEADERS],
    [
      "student@example.com",
      "9876543210",
      "pass123",
      "Priya Sharma",
      "pay_ABC123",
      "Lalit Narayan Mithila University",
      "Example College, Darbhanga",
      "UG",
      "B.A.",
      "History",
      "Digital Marketing",
    ],
  ]);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, "Students");
  XLSX.writeFile(workbook, "bulk_registration_template.xlsx");
}
