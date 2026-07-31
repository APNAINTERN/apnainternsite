import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { INTERNSHIP_MODE_FILTER_OPTIONS } from "@/lib/internshipMode";

type Props = {
  value: string;
  onValueChange: (value: string) => void;
  className?: string;
  placeholder?: string;
};

export function InternshipModeFilterSelect({
  value,
  onValueChange,
  className,
  placeholder = "All Modes",
}: Props) {
  return (
    <Select value={value} onValueChange={onValueChange}>
      <SelectTrigger className={className}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {INTERNSHIP_MODE_FILTER_OPTIONS.map((opt) => (
          <SelectItem key={opt.value} value={opt.value}>
            {opt.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
