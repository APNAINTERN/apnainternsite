import { useEffect, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

type Props = {
  label: string;
  options: { id: string; name: string }[];
  selectedValues: string[];
  onChange: (values: string[]) => void;
  triggerClassName?: string;
  labelClassName?: string;
  popoverClassName?: string;
  /** When false, empty selection means none (not "all"). Default true. */
  showAllOption?: boolean;
  emptyLabel?: string;
};

export function MultiSelectCheckboxGroup({
  label,
  options,
  selectedValues,
  onChange,
  triggerClassName,
  labelClassName,
  popoverClassName,
  showAllOption = true,
  emptyLabel,
}: Props) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const filtered = options.filter((opt) =>
    (opt.name || "").toLowerCase().includes(search.toLowerCase())
  );

  const toggleOption = (name: string) => {
    if (selectedValues.includes(name)) {
      onChange(selectedValues.filter((v) => v !== name));
    } else {
      onChange([...selectedValues, name]);
    }
  };

  const isAllSelected = showAllOption && selectedValues.length === 0;
  const triggerText = isAllSelected
    ? emptyLabel || `All ${label}s`
    : selectedValues.length === 0
      ? emptyLabel || `Select ${label.toLowerCase()}…`
      : `${selectedValues.length} selected`;

  return (
    <div className="space-y-1.5" ref={containerRef}>
      <div className="flex justify-between items-center">
        <Label className={cn("text-xs font-semibold text-slate-700", labelClassName)}>{label}</Label>
        {selectedValues.length > 0 && (
          <button
            type="button"
            onClick={() => onChange([])}
            className="text-[10px] text-primary font-bold uppercase tracking-wider hover:underline"
          >
            Clear All
          </button>
        )}
      </div>

      <div className="relative">
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          className={cn(
            "flex h-9 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-xs ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50 text-left",
            triggerClassName
          )}
        >
          <span className="truncate">
            {triggerText}
          </span>
          <span className="text-muted-foreground text-[10px]">▼</span>
        </button>

        {isOpen && (
          <div
            className={cn(
              "absolute z-50 mt-1 w-full rounded-md border bg-popover p-2 text-popover-foreground shadow-md outline-none animate-in fade-in-0 zoom-in-95",
              popoverClassName
            )}
          >
            <div className="flex justify-between items-center border-b pb-2 mb-2">
              <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                Select Options
              </span>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="text-xs font-bold text-primary hover:underline"
              >
                Done
              </button>
            </div>
            <Input
              placeholder="Search..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-8 mb-2 text-xs"
            />
            <ScrollArea className="h-40">
              <div className="space-y-1.5 p-1">
                {showAllOption ? (
                  <div
                    className="flex items-center space-x-2 rounded-sm p-1.5 hover:bg-slate-100 cursor-pointer"
                    onClick={() => onChange([])}
                  >
                    <Checkbox
                      id={`${label}-all`}
                      checked={selectedValues.length === 0}
                      onCheckedChange={() => onChange([])}
                    />
                    <Label
                      htmlFor={`${label}-all`}
                      className="text-xs cursor-pointer font-medium text-slate-800 w-full"
                    >
                      All {label}s
                    </Label>
                  </div>
                ) : null}

                {filtered.map((opt) => {
                  const checked = selectedValues.includes(opt.name);
                  return (
                    <div
                      key={opt.id}
                      className="flex items-center space-x-2 rounded-sm p-1.5 hover:bg-slate-100 cursor-pointer"
                      onClick={() => toggleOption(opt.name)}
                    >
                      <Checkbox
                        id={`${label}-${opt.id}`}
                        checked={checked}
                        onCheckedChange={() => toggleOption(opt.name)}
                      />
                      <Label
                        htmlFor={`${label}-${opt.id}`}
                        className="text-xs cursor-pointer font-medium text-slate-800 w-full"
                      >
                        {opt.name}
                      </Label>
                    </div>
                  );
                })}
                {filtered.length === 0 && (
                  <p className="text-[11px] text-muted-foreground p-2 text-center">No options found</p>
                )}
              </div>
            </ScrollArea>
          </div>
        )}
      </div>

      {selectedValues.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-1 max-h-20 overflow-y-auto p-1 border rounded-md bg-slate-50">
          {selectedValues.map((val) => (
            <Badge
              key={val}
              variant="secondary"
              className="text-[9px] gap-1 pr-1 py-0.5 bg-white border border-slate-200"
            >
              <span className="truncate max-w-[150px]">{val}</span>
              <span
                className="hover:bg-slate-200 rounded-full p-0.5 cursor-pointer text-[8px] font-bold text-slate-500 hover:text-slate-800"
                onClick={(e) => {
                  e.stopPropagation();
                  onChange(selectedValues.filter((v) => v !== val));
                }}
              >
                ✕
              </span>
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}
