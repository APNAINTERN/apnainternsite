import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { InternshipModeFilterSelect } from "@/components/admin/InternshipModeFilterSelect";
import { MultiSelectCheckboxGroup } from "@/components/admin/MultiSelectCheckboxGroup";
import {
  ClassTargetFilters,
  collegesForUniversityNames,
  pruneCollegesForUniversities,
} from "@/lib/classLinkTargeting";

type Props = {
  filters: ClassTargetFilters;
  onChange: (filters: ClassTargetFilters) => void;
  unis: { id: string; name: string }[];
  colleges: { id: string; name: string; university_id: string }[];
  domains: { id: string; name: string }[];
  className?: string;
};

export function AssignmentAudienceFilters({
  filters,
  onChange,
  unis,
  colleges,
  domains,
  className = "space-y-4",
}: Props) {
  const filteredColleges = collegesForUniversityNames(colleges, unis, filters.universities);

  return (
    <div className={className}>
      <MultiSelectCheckboxGroup
        label="University"
        options={unis}
        selectedValues={filters.universities}
        onChange={(newUnis) => {
          onChange({
            ...filters,
            universities: newUnis,
            colleges: pruneCollegesForUniversities(colleges, unis, newUnis, filters.colleges),
          });
        }}
      />
      <MultiSelectCheckboxGroup
        label="College"
        options={filteredColleges}
        selectedValues={filters.colleges}
        onChange={(newColleges) => onChange({ ...filters, colleges: newColleges })}
      />
      <div className="space-y-2">
        <Label>Domain</Label>
        <Select value={filters.domain} onValueChange={(v) => onChange({ ...filters, domain: v })}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Domains</SelectItem>
            {domains.map((d) => (
              <SelectItem key={d.id} value={d.name}>
                {d.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label>Mode</Label>
        <InternshipModeFilterSelect
          value={filters.mode}
          onValueChange={(v) => onChange({ ...filters, mode: v })}
        />
      </div>
    </div>
  );
}
