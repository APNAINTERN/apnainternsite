import type { SupabaseClient } from "@supabase/supabase-js";
import type { AssignmentType } from "@/lib/assignmentApi";

export type AssignmentTakePayload = {
  assignment: {
    id: string;
    title: string;
    description?: string | null;
    duration_minutes: number;
    total_marks: number;
    passing_marks: number;
    is_active: boolean;
    due_at?: string | null;
    assignment_type?: AssignmentType | string;
  };
  questions: Array<{
    id: string;
    assignment_id: string;
    question_text: string;
    question_type?: "mcq" | "long_answer";
    options: unknown;
    marks: number;
    order_index: number;
    word_limit_min?: number;
    word_limit_max?: number;
  }>;
};

function isMissingRpc(err: { code?: string; message?: string } | null): boolean {
  const msg = String(err?.message || "").toLowerCase();
  return err?.code === "PGRST202" || msg.includes("could not find") || msg.includes("does not exist");
}

export async function fetchAssignmentTakePayload(
  client: SupabaseClient,
  assignmentId: string
): Promise<AssignmentTakePayload> {
  const { data, error } = await client.rpc("get_assignment_take_payload", {
    p_assignment_id: assignmentId,
  });
  if (error) {
    if (isMissingRpc(error)) {
      throw new Error(
        "Run supabase/hotfix_assignment_management_complete.sql in Supabase SQL Editor."
      );
    }
    throw error;
  }
  if (!data || typeof data !== "object") {
    throw new Error("Assignment payload empty");
  }
  return data as AssignmentTakePayload;
}

export async function submitAssignmentGraded(
  client: SupabaseClient,
  params: {
    assignmentId: string;
    answers: Record<string, unknown>;
    warningsReceived: number;
    cheatingDetected: boolean;
  }
): Promise<{
  score: number;
  is_passed: boolean;
  total_marks: number;
  grading_status?: string;
  pending_review?: boolean;
}> {
  const { data, error } = await client.rpc("submit_assignment_graded", {
    p_assignment_id: params.assignmentId,
    p_answers: params.answers,
    p_warnings_received: params.warningsReceived,
    p_cheating_detected: params.cheatingDetected,
  });
  if (error) {
    if (isMissingRpc(error)) {
      throw new Error(
        "Run supabase/hotfix_assignment_management_complete.sql in Supabase SQL Editor."
      );
    }
    throw error;
  }
  const row = (data || {}) as {
    score?: number;
    is_passed?: boolean;
    total_marks?: number;
    grading_status?: string;
    pending_review?: boolean;
  };
  return {
    score: Number(row.score ?? 0),
    is_passed: Boolean(row.is_passed),
    total_marks: Number(row.total_marks ?? 0),
    grading_status: row.grading_status,
    pending_review: row.pending_review,
  };
}

export function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}
