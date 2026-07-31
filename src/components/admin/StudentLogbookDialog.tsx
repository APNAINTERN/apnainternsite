import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { FileText, ExternalLink } from "lucide-react";
import { getStudentLogbookUrl } from "@/lib/studentDocuments";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  student: {
    full_name?: string | null;
    email?: string | null;
    metadata?: Record<string, unknown> | null;
  } | null;
};

export function StudentLogbookDialog({ open, onOpenChange, student }: Props) {
  const logbookUrl = student ? getStudentLogbookUrl(student) : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="size-5 text-primary" />
            Internship logbook
          </DialogTitle>
          <DialogDescription>
            {student?.full_name || student?.email || "Student"} — view-only from registration uploads.
          </DialogDescription>
        </DialogHeader>
        {logbookUrl ? (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Opens the file the student uploaded during registration or from their portal.
            </p>
            <Button variant="outline" className="w-full gap-2 font-bold" asChild>
              <a href={logbookUrl} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="size-4" />
                Open logbook
              </a>
            </Button>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground py-4">
            No logbook file is on record for this student yet.
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}
