import { Badge } from "@/components/ui/badge";
import {
  ADD_REGISTRATION_BADGE_LABEL,
  BULK_UPLOAD_BADGE_LABEL,
  STUDENT_DATA_UPLOAD_BADGE_LABEL,
  isStudentAdminAddedRegistration,
  isStudentBulkUploaded,
  isStudentDataUploadImported,
} from "@/lib/studentRegistrationSource";

type Props = {
  metadata?: Record<string, unknown> | null;
  className?: string;
  /** Student directory only — hide on Add Registration tab and profile dialogs. */
  showAddRegistration?: boolean;
};

/** Bulk upload badge; optional add-registration badge for the student directory table. */
export function BulkUploadStudentBadge({
  metadata,
  className,
  showAddRegistration = false,
}: Props) {
  if (isStudentDataUploadImported(metadata)) {
    return (
      <Badge
        variant="secondary"
        className={`bg-sky-50 text-sky-700 border border-sky-100 text-[9px] uppercase font-bold tracking-wide ${className || ""}`}
      >
        {STUDENT_DATA_UPLOAD_BADGE_LABEL}
      </Badge>
    );
  }

  if (isStudentBulkUploaded(metadata)) {
    return (
      <Badge
        variant="secondary"
        className={`bg-violet-50 text-violet-700 border border-violet-100 text-[9px] uppercase font-bold tracking-wide ${className || ""}`}
      >
        {BULK_UPLOAD_BADGE_LABEL}
      </Badge>
    );
  }

  if (showAddRegistration && isStudentAdminAddedRegistration(metadata)) {
    return (
      <Badge
        variant="secondary"
        className={`bg-emerald-50 text-emerald-700 border border-emerald-100 text-[9px] uppercase font-bold tracking-wide ${className || ""}`}
      >
        {ADD_REGISTRATION_BADGE_LABEL}
      </Badge>
    );
  }

  return null;
}
