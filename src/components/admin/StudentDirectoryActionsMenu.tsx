import {
  Ban,
  BookOpen,
  CheckCircle2,
  ClipboardList,
  Edit,
  Eye,
  FileText,
  LogIn,
  Mail,
  MoreHorizontal,
  Trash2,
  Upload,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export type StudentDirectoryStudent = {
  id: string;
  status?: string | null;
  full_name?: string | null;
  email?: string | null;
  [key: string]: unknown;
};

type Props = {
  student: StudentDirectoryStudent;
  onViewDetails: (student: StudentDirectoryStudent) => void;
  onEditDetails: (student: StudentDirectoryStudent) => void;
  onResetPassword: (student: StudentDirectoryStudent) => void;
  onResendCredentials: (student: StudentDirectoryStudent) => void;
  onViewConsentLetter: (student: StudentDirectoryStudent) => void;
  onUploadConsentLetter: (student: StudentDirectoryStudent) => void;
  onViewLogbook: (student: StudentDirectoryStudent) => void;
  onDownloadAttendanceReport: (student: StudentDirectoryStudent) => void;
  onDownloadOfferLetter: (student: StudentDirectoryStudent) => void;
  onToggleBlock: (student: StudentDirectoryStudent) => void;
  onDelete: (student: StudentDirectoryStudent) => void;
};

export function StudentDirectoryActionsMenu({
  student,
  onViewDetails,
  onEditDetails,
  onResetPassword,
  onResendCredentials,
  onViewConsentLetter,
  onUploadConsentLetter,
  onViewLogbook,
  onDownloadAttendanceReport,
  onDownloadOfferLetter,
  onToggleBlock,
  onDelete,
}: Props) {
  const isBlocked = student.status === "Blocked";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="size-8 p-0">
          <MoreHorizontal className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56 shadow-elegant">
        <DropdownMenuItem onClick={() => onViewDetails(student)} className="gap-2">
          <Eye className="size-4" /> View Details
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => onEditDetails(student)} className="gap-2 text-primary">
          <Edit className="size-4" /> Edit Details
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => onResetPassword(student)} className="gap-2 text-orange-600">
          <LogIn className="size-4" /> Reset Password
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => onResendCredentials(student)} className="gap-2 text-indigo-600">
          <Mail className="size-4" /> Resend Credentials
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => onViewConsentLetter(student)} className="gap-2">
          <FileText className="size-4" /> View consent letter
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => onUploadConsentLetter(student)} className="gap-2 text-violet-700">
          <Upload className="size-4" /> Upload consent letter
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => onViewLogbook(student)} className="gap-2">
          <BookOpen className="size-4" /> View logbook
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => onDownloadAttendanceReport(student)}
          className="gap-2 text-emerald-700"
        >
          <ClipboardList className="size-4" /> Download Attendance Report
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => onDownloadOfferLetter(student)} className="gap-2 text-indigo-600">
          <FileText className="size-4" /> Download offer letter
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={() => !isBlocked && onToggleBlock(student)}
          disabled={isBlocked}
          className={`gap-2 ${isBlocked ? "opacity-40 cursor-not-allowed text-destructive" : "text-destructive"}`}
        >
          <Ban className="size-4" /> Block
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => isBlocked && onToggleBlock(student)}
          disabled={!isBlocked}
          className={`gap-2 ${!isBlocked ? "opacity-40 cursor-not-allowed text-green-600" : "text-green-600"}`}
        >
          <CheckCircle2 className="size-4" /> Unblock
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => onDelete(student)} className="gap-2 text-destructive">
          <Trash2 className="size-4" /> Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
