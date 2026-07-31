import type { AssignmentWorkSubmission } from "@/lib/assignmentApi";
import { SubmissionFilesList } from "@/components/SubmissionFilesList";
import { SubmissionLinksList } from "@/components/SubmissionLinksList";

type Props = {
  submission: AssignmentWorkSubmission;
  compact?: boolean;
};

export function WorkSubmissionDisplay({ submission, compact }: Props) {
  const hasLinks = submission.links.length > 0;
  const hasFiles = submission.files.length > 0;

  if (!hasLinks && !hasFiles && !submission.note) {
    return <p className="text-sm text-muted-foreground italic">No submission content recorded.</p>;
  }

  return (
    <div className="space-y-4">
      {hasLinks ? (
        <div className="space-y-2">
          {!compact ? (
            <p className="text-sm font-medium text-slate-900">Submitted links</p>
          ) : null}
          <SubmissionLinksList links={submission.links} compact={compact} />
        </div>
      ) : null}
      {hasFiles ? (
        <div className="space-y-2">
          {!compact ? (
            <p className="text-sm font-medium text-slate-900">File attachments</p>
          ) : null}
          <SubmissionFilesList files={submission.files} compact={compact} />
        </div>
      ) : null}
      {submission.note ? (
        <div className={`text-sm ${compact ? "" : "rounded-lg border bg-slate-50 p-3"}`}>
          {!compact ? (
            <p className="text-xs font-bold uppercase text-muted-foreground mb-1">Student note</p>
          ) : null}
          <p className="whitespace-pre-wrap text-slate-700">{submission.note}</p>
        </div>
      ) : null}
    </div>
  );
}
