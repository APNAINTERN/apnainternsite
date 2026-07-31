import { ExternalLink } from "lucide-react";
import { normalizeExternalUrl } from "@/lib/assignmentApi";

type Props = {
  links: string[];
  note?: string;
  compact?: boolean;
};

export function SubmissionLinksList({ links, note, compact }: Props) {
  if (!links.length) {
    return <p className="text-sm text-muted-foreground italic">No links submitted.</p>;
  }

  return (
    <div className="space-y-3">
      <ul className={`space-y-2 ${compact ? "" : "rounded-lg border bg-muted/20 p-3"}`}>
        {links.map((raw, idx) => {
          const href = normalizeExternalUrl(raw) || raw;
          let label = raw;
          try {
            label = new URL(href).hostname.replace(/^www\./, "");
          } catch {
            /* keep raw */
          }
          return (
            <li key={`${raw}-${idx}`}>
              <a
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 text-sm font-medium text-primary hover:underline break-all"
              >
                <ExternalLink className="size-3.5 shrink-0" />
                <span>
                  Link {idx + 1}
                  {!compact ? ` · ${label}` : ""}
                </span>
              </a>
              {!compact ? (
                <p className="text-xs text-muted-foreground mt-0.5 break-all pl-5">{raw}</p>
              ) : null}
            </li>
          );
        })}
      </ul>
      {note ? (
        <div className="text-sm rounded-lg border bg-slate-50 p-3">
          <p className="text-xs font-bold uppercase text-muted-foreground mb-1">Student note</p>
          <p className="whitespace-pre-wrap text-slate-700">{note}</p>
        </div>
      ) : null}
    </div>
  );
}
