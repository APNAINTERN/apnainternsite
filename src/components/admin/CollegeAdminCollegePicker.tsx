import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { displayCollegeName } from "@/lib/collegeDisplay";
import { ChevronDown, Plus, X } from "lucide-react";

type CollegeRow = { id: string; name: string; university_id: string };

type Props = {
  colleges: CollegeRow[];
  universityId: string;
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  disabled?: boolean;
};

export function CollegeAdminCollegePicker({
  colleges,
  universityId,
  selectedIds,
  onChange,
  disabled,
}: Props) {
  const [open, setOpen] = useState(false);
  const [draftIds, setDraftIds] = useState<string[]>([]);

  const options = useMemo(
    () =>
      colleges
        .filter((c) => c.university_id === universityId)
        .sort((a, b) => a.name.localeCompare(b.name)),
    [colleges, universityId]
  );

  const draftSet = useMemo(() => new Set(draftIds), [draftIds]);

  const committedColleges = useMemo(
    () =>
      selectedIds
        .map((id) => colleges.find((c) => c.id === id))
        .filter(Boolean) as CollegeRow[],
    [selectedIds, colleges]
  );

  useEffect(() => {
    if (open) setDraftIds(selectedIds);
  }, [open, selectedIds]);

  const toggleDraft = (id: string) => {
    if (draftSet.has(id)) {
      setDraftIds(draftIds.filter((x) => x !== id));
    } else {
      setDraftIds([...draftIds, id]);
    }
  };

  const applyDraft = () => {
    if (draftIds.length < 1) return;
    onChange(draftIds);
    setOpen(false);
  };

  const removeCommitted = (id: string) => {
    onChange(selectedIds.filter((x) => x !== id));
  };

  return (
    <div className="space-y-2">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            disabled={disabled || !universityId || options.length === 0}
            className="h-9 w-full justify-between bg-white border-emerald-100 font-bold text-xs font-normal"
          >
            <span className="truncate text-left">
              {!universityId
                ? "Pick university first"
                : "Choose colleges (tick boxes, then Add)"}
            </span>
            <ChevronDown className="size-4 shrink-0 opacity-60" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[min(100vw-2rem,22rem)] p-0" align="start">
          <div className="p-3 border-b">
            <p className="text-[10px] font-black uppercase text-slate-500">Colleges</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Tick one or more colleges, then press <strong>Add</strong> below.
            </p>
          </div>
          <ScrollArea className="h-[min(16rem,var(--radix-popover-content-available-height))]">
            <div className="p-2 space-y-1">
              {options.length === 0 ? (
                <p className="text-xs text-muted-foreground p-2">No colleges for this university.</p>
              ) : (
                options.map((c) => (
                  <label
                    key={c.id}
                    className="flex items-start gap-2 rounded-lg px-2 py-2 hover:bg-slate-50 cursor-pointer"
                  >
                    <Checkbox
                      checked={draftSet.has(c.id)}
                      onCheckedChange={() => toggleDraft(c.id)}
                      className="mt-0.5"
                    />
                    <span className="text-xs font-medium leading-snug">
                      {displayCollegeName(c.name)}
                    </span>
                  </label>
                ))
              )}
            </div>
          </ScrollArea>
          <div className="p-2 border-t space-y-2">
            <Button
              type="button"
              className="w-full h-9 bg-emerald-600 hover:bg-emerald-700 text-white font-black text-[11px] uppercase"
              disabled={draftIds.length < 1}
              onClick={applyDraft}
            >
              <Plus className="size-3.5 mr-1.5" />
              Add {draftIds.length > 0 ? `(${draftIds.length})` : ""}
            </Button>
            {draftIds.length > 0 ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="w-full text-[10px] font-bold uppercase text-slate-500"
                onClick={() => setDraftIds([])}
              >
                Clear ticks
              </Button>
            ) : null}
          </div>
        </PopoverContent>
      </Popover>

      {committedColleges.length > 0 ? (
        <div className="rounded-lg border border-emerald-100 bg-emerald-50/40 p-2 space-y-1.5">
          <p className="text-[10px] font-black uppercase text-emerald-800">
            Added colleges ({committedColleges.length})
          </p>
          <div className="flex flex-wrap gap-1">
            {committedColleges.map((c) => (
              <Badge
                key={c.id}
                variant="secondary"
                className="text-[10px] font-bold gap-1 pr-1 bg-white"
              >
                {displayCollegeName(c.name)}
                <button
                  type="button"
                  className="rounded-full hover:bg-slate-200 p-0.5"
                  aria-label={`Remove ${c.name}`}
                  onClick={() => removeCommitted(c.id)}
                >
                  <X className="size-3" />
                </button>
              </Badge>
            ))}
          </div>
        </div>
      ) : (
        <p className="text-[10px] text-amber-700 font-medium">
          No colleges added yet — open the list, tick colleges, then press Add.
        </p>
      )}
    </div>
  );
}
