import { useState } from "react";
import { Download, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import {
  type AssignmentFileUploadMeta,
  createAssignmentFileSignedUrl,
} from "@/lib/assignmentApi";
import { toast } from "sonner";

type Props = {
  files: AssignmentFileUploadMeta[];
  compact?: boolean;
};

export function SubmissionFilesList({ files, compact }: Props) {
  const [loadingPath, setLoadingPath] = useState<string | null>(null);

  if (!files.length) {
    return compact ? null : (
      <p className="text-sm text-muted-foreground italic">No file attachments.</p>
    );
  }

  return (
    <ul className={`space-y-2 ${compact ? "" : "rounded-lg border bg-muted/20 p-3"}`}>
      {files.map((file, idx) => (
        <li
          key={`${file.path}-${idx}`}
          className="flex flex-wrap items-center justify-between gap-2 text-sm"
        >
          <div className="min-w-0">
            <p className="font-medium text-slate-900 truncate">
              {file.name || `File ${idx + 1}`}
            </p>
            {file.size ? (
              <p className="text-xs text-muted-foreground">
                {(file.size / 1024 / 1024).toFixed(2)} MB
              </p>
            ) : null}
          </div>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="gap-1 shrink-0"
            disabled={loadingPath === file.path}
            onClick={async () => {
              setLoadingPath(file.path);
              try {
                const url = await createAssignmentFileSignedUrl(supabase, file.path);
                if (!url) throw new Error("Could not open file");
                window.open(url, "_blank", "noopener,noreferrer");
              } catch (e: unknown) {
                toast.error(e instanceof Error ? e.message : "Could not open file");
              } finally {
                setLoadingPath(null);
              }
            }}
          >
            {loadingPath === file.path ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Download className="size-3.5" />
            )}
            Open
          </Button>
        </li>
      ))}
    </ul>
  );
}
