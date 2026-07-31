import { useCallback, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { MultiSelectCheckboxGroup } from "@/components/admin/MultiSelectCheckboxGroup";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  Search,
  BookOpen,
  Calendar,
  Edit,
  ExternalLink,
  Eye,
  Loader2,
  ToggleLeft,
  ToggleRight,
  Trash2,
  Users,
  Copy,
} from "lucide-react";
import {
  ClassLinkRow,
  ClassTargetFilters,
  classRowToFilters,
  classTargetSummaryShort,
  collegesForUniversityNames,
  countStudentsForClassTargets,
  describeClassTargets,
  filtersToTargetArrays,
  inferLinkTypeFromUrl,
  linkTypeLabel,
  pruneCollegesForUniversities,
  rowMatchesAudienceListFilters,
  studentMatchesClassTargets,
  toDatetimeLocalValue,
} from "@/lib/classLinkTargeting";
import {
  buildClassLinkRpcRow,
  formatClassLinkError,
  insertClassLink,
  updateClassLink,
} from "@/lib/classLinkApi";
import { formatNotificationError, notifyClassPublished } from "@/lib/notificationApi";

type Props = {
  classesList: ClassLinkRow[];
  domains: { id: string; name: string }[];
  unis: { id: string; name: string }[];
  colleges: { id: string; name: string; university_id: string }[];
  studentsForTargeting: {
    university_name?: string | null;
    college_name?: string | null;
    internship_domain?: string | null;
    course?: string | null;
  }[];
  currentUserId?: string;
  onRefresh: () => void | Promise<void>;
  onLogAction: (
    action: string,
    entity: string,
    message: string,
    meta?: Record<string, unknown>
  ) => void | Promise<void>;
};

const emptyForm = {
  title: "",
  description: "",
  url: "",
  scheduledAt: "",
  linkType: "meet",
  universities: [] as string[],
  colleges: [] as string[],
  domains: [] as string[],
};

export function ClassLinkManagementPanel({
  classesList,
  domains,
  unis,
  colleges,
  studentsForTargeting,
  currentUserId,
  onRefresh,
  onLogAction,
}: Props) {
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editingClass, setEditingClass] = useState<ClassLinkRow | null>(null);
  const [editForm, setEditForm] = useState(emptyForm);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [detailsClass, setDetailsClass] = useState<ClassLinkRow | null>(null);
  const [audienceOpen, setAudienceOpen] = useState(false);
  const [audienceClass, setAudienceClass] = useState<ClassLinkRow | null>(null);
  const [listSearch, setListSearch] = useState("");
  const [listFilters, setListFilters] = useState<ClassTargetFilters>({
    universities: [],
    colleges: [],
    domain: "all",
    mode: "all",
  });

  const listCollegeOptions = useMemo(
    () => collegesForUniversityNames(colleges, unis, listFilters.universities),
    [colleges, unis, listFilters.universities]
  );

  const filterClassesForList = useCallback(
    (items: ClassLinkRow[]) =>
      items.filter((cl) =>
        rowMatchesAudienceListFilters(
          {
            title: cl.title,
            target_universities: cl.target_universities,
            target_colleges: cl.target_colleges,
            target_domains: cl.target_domains,
            target_modes: cl.target_modes,
          },
          listFilters,
          listSearch
        )
      ),
    [listFilters, listSearch]
  );

  const openDetails = (cls: ClassLinkRow) => {
    setDetailsClass(cls);
    setDetailsOpen(true);
  };

  const openAudience = (cls: ClassLinkRow) => {
    setAudienceClass(cls);
    setAudienceOpen(true);
  };

  const recipientCountForClass = (cls: ClassLinkRow | null) => {
    if (!cls) return 0;
    return studentsForTargeting.filter((s) =>
      studentMatchesClassTargets(s, cls, { colleges, unis })
    ).length;
  };

  const detailsRecipientCount = useMemo(
    () => recipientCountForClass(detailsClass),
    [detailsClass, studentsForTargeting, colleges, unis]
  );

  const audienceRecipientCount = useMemo(
    () => recipientCountForClass(audienceClass),
    [audienceClass, studentsForTargeting, colleges, unis]
  );

  const renderAudienceTargetingBody = (cls: ClassLinkRow) => {
    const matched = recipientCountForClass(cls);
    return (
    <div className="space-y-4 pr-3">
      <div className="flex items-center gap-2 rounded-lg bg-primary/5 border border-primary/10 p-3 text-sm shrink-0">
        <Users className="size-4 text-primary shrink-0" />
        <span>
          <span className="font-bold text-slate-900">{matched}</span> student
          {matched === 1 ? "" : "s"} will see this class
        </span>
      </div>
      {cls.target_universities?.length ? (
        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-2">
            Universities
          </p>
          <ul className="space-y-1.5 text-sm">
            {cls.target_universities.map((u) => (
              <li key={u} className="rounded-md border bg-muted/20 px-3 py-2 leading-snug">
                {u}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {cls.target_colleges?.length ? (
        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-2">
            Colleges
          </p>
          <ul className="space-y-1.5 text-sm">
            {cls.target_colleges.map((c) => (
              <li key={c} className="rounded-md border bg-muted/20 px-3 py-2 leading-snug">
                {c}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {cls.target_domains?.length ? (
        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-2">
            Internship domains
          </p>
          <ul className="space-y-1.5 text-sm">
            {cls.target_domains.map((d) => (
              <li key={d} className="rounded-md border bg-muted/20 px-3 py-2 leading-snug">
                {d}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {!cls.target_universities?.length &&
      !cls.target_colleges?.length &&
      !cls.target_domains?.length ? (
        <p className="text-sm text-muted-foreground rounded-lg border border-dashed p-4 text-center">
          {cls.internship_domains?.name
            ? `Legacy domain only: ${cls.internship_domains.name}`
            : "No filters — visible to all students."}
        </p>
      ) : null}
      <p className="text-xs text-muted-foreground border-t pt-3 leading-relaxed">
        {describeClassTargets(cls)}
      </p>
    </div>
    );
  };

  const recipientCount = useMemo(() => {
    const pseudoClass = {
      target_universities: form.universities.length > 0 ? form.universities : null,
      target_colleges: form.colleges.length > 0 ? form.colleges : null,
      target_domains: form.domains.length > 0 ? form.domains : null,
      domain_id: null,
      internship_domains: null,
    };
    return studentsForTargeting.filter((s) =>
      studentMatchesClassTargets(s, pseudoClass, { colleges, unis })
    ).length;
  }, [studentsForTargeting, form.universities, form.colleges, form.domains, colleges, unis]);

  const sortedClasses = useMemo(
    () =>
      [...classesList].sort(
        (a, b) =>
          new Date(b.scheduled_at || b.created_at || 0).getTime() -
          new Date(a.scheduled_at || a.created_at || 0).getTime()
      ),
    [classesList]
  );

  const nowTime = Date.now();

  const upcomingClasses = useMemo(() => {
    return filterClassesForList(
      sortedClasses.filter(
        (cl) => !cl.scheduled_at || new Date(cl.scheduled_at).getTime() >= nowTime
      )
    );
  }, [sortedClasses, nowTime, filterClassesForList]);

  const pastClasses = useMemo(() => {
    return filterClassesForList(
      sortedClasses.filter(
        (cl) => cl.scheduled_at && new Date(cl.scheduled_at).getTime() < nowTime
      )
    );
  }, [sortedClasses, nowTime, filterClassesForList]);

  const validateForm = (values: typeof emptyForm) => {
    if (!values.title.trim()) return "Class title is required.";
    if (!values.description.trim()) return "Class description is required.";
    if (!values.url.trim()) return "Class link URL is required.";
    if (!values.scheduledAt) return "Class date and time is required.";
    try {
      new URL(values.url.trim());
    } catch {
      return "Enter a valid class link URL.";
    }
    return null;
  };

  const legacyDomainIdFor = (values: typeof emptyForm) => {
    if (values.domains.length === 0) return null;
    return domains.find((d) => d.name === values.domains[0])?.id ?? null;
  };

  const buildPayload = (values: typeof emptyForm, existing?: ClassLinkRow | null) => {
    return buildClassLinkRpcRow({
      title: values.title,
      description: values.description,
      url: values.url,
      scheduledAt: values.scheduledAt,
      linkType: values.linkType,
      target_universities: values.universities.length > 0 ? values.universities : null,
      target_colleges: values.colleges.length > 0 ? values.colleges : null,
      target_domains: values.domains.length > 0 ? values.domains : null,
      is_active: existing?.is_active ?? true,
      created_by: existing ? undefined : currentUserId || null,
    });
  };

  const handlePublish = async () => {
    const err = validateForm(form);
    if (err) return toast.error(err);
    setSaving(true);
    try {
      const payload = buildPayload(form);
      const result = await insertClassLink(supabase, payload, {
        legacyDomainId: legacyDomainIdFor(form),
      });
      if (result.error) throw result.error;
      if ("warning" in result && result.warning) toast.warning(result.warning);

      const classId =
        typeof result.data === "string"
          ? result.data
          : Array.isArray(result.data) && result.data[0]?.id
            ? String(result.data[0].id)
            : (result.data as { id?: string } | null)?.id;

      let notified = false;
      if (classId) {
        try {
          await notifyClassPublished(supabase, classId);
          notified = true;
        } catch (notifyErr: unknown) {
          toast.warning(
            `Class saved but students were not notified: ${formatNotificationError(notifyErr)}`
          );
        }
      }

      await onLogAction("CREATE", "class", `Published class link: ${form.title}`, {
        title: form.title,
        recipients: recipientCount,
        notified,
        class_id: classId,
      });
      toast.success(
        notified
          ? `Class published — ${recipientCount} student(s) notified on their dashboard.`
          : `Class published to ${recipientCount} student(s).`
      );
      setForm(emptyForm);
      setPreviewOpen(false);
      await onRefresh();
    } catch (e: unknown) {
      toast.error(formatClassLinkError(e));
    } finally {
      setSaving(false);
    }
  };

  const handleDuplicate = (cls: ClassLinkRow) => {
    setForm({
      title: `${cls.title || ""} (Copy)`,
      description: cls.description || "",
      url: cls.url || "",
      scheduledAt: "",
      linkType: cls.link_type || "meet",
      universities: cls.target_universities || [],
      colleges: cls.target_colleges || [],
      domains: cls.target_domains || (cls.internship_domains?.name ? [cls.internship_domains.name] : []),
    });
    toast.success("Class details copied to Create form. Set a schedule to publish!");
    document.getElementById("create-class-form")?.scrollIntoView({ behavior: "smooth" });
  };

  const openEdit = (cls: ClassLinkRow) => {
    setEditingClass(cls);
    setEditForm({
      title: cls.title || "",
      description: cls.description || "",
      url: cls.url || "",
      scheduledAt: toDatetimeLocalValue(cls.scheduled_at),
      linkType: cls.link_type || "meet",
      universities: cls.target_universities || [],
      colleges: cls.target_colleges || [],
      domains: cls.target_domains || (cls.internship_domains?.name ? [cls.internship_domains.name] : []),
    });
    setEditOpen(true);
  };

  const handleUpdate = async () => {
    if (!editingClass?.id) return;
    const err = validateForm(editForm);
    if (err) return toast.error(err);
    setSaving(true);
    try {
      const payload = buildPayload(editForm, editingClass);
      const { error } = await updateClassLink(supabase, editingClass.id, payload);
      if (error) throw error;
      await onLogAction("UPDATE", "class", `Updated class link: ${editForm.title}`, {
        class_id: editingClass.id,
      });
      toast.success("Class updated.");
      setEditOpen(false);
      setEditingClass(null);
      await onRefresh();
    } catch (e: unknown) {
      toast.error(formatClassLinkError(e));
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (cls: ClassLinkRow) => {
    const newStatus = cls.is_active === false;
    const { error } = await supabase
      .from("classes")
      .update({ is_active: newStatus, updated_at: new Date().toISOString() })
      .eq("id", cls.id);
    if (error) return toast.error(error.message);
    await onLogAction(
      "UPDATE",
      "class",
      `${newStatus ? "Enabled" : "Disabled"} class: ${cls.title}`,
      { class_id: cls.id, active: newStatus }
    );
    toast.success(newStatus ? "Class visible to students." : "Class hidden from students.");
    await onRefresh();
    if (detailsClass?.id === cls.id) {
      setDetailsClass({ ...detailsClass, is_active: newStatus });
    }
  };

  const deleteClass = async (cls: ClassLinkRow) => {
    if (!cls.id || !confirm(`Delete class "${cls.title}"?`)) return;
    const { error } = await supabase.from("classes").delete().eq("id", cls.id);
    if (error) return toast.error(error.message);
    await onLogAction("DELETE", "class", `Deleted class: ${cls.title}`, { class_id: cls.id });
    toast.success("Class deleted.");
    await onRefresh();
  };

  const renderFilters = (
    values: typeof emptyForm,
    setValues: (next: typeof emptyForm) => void
  ) => {
    const filteredColleges = collegesForUniversityNames(colleges, unis, values.universities);

    return (
      <>
        <MultiSelectCheckboxGroup
          label="University"
          options={unis}
          selectedValues={values.universities}
          onChange={(newUnis) => {
            setValues({
              ...values,
              universities: newUnis,
              colleges: pruneCollegesForUniversities(colleges, unis, newUnis, values.colleges),
            });
          }}
        />

        <MultiSelectCheckboxGroup
          label="College"
          options={filteredColleges}
          selectedValues={values.colleges}
          onChange={(v) => setValues({ ...values, colleges: v })}
        />

        <MultiSelectCheckboxGroup
          label="Internship Domain"
          options={domains}
          selectedValues={values.domains}
          onChange={(v) => setValues({ ...values, domains: v })}
        />
      </>
    );
  };



  const renderClassTable = (classes: ClassLinkRow[]) => {
    if (classes.length === 0) {
      return (
        <div className="p-8 text-center text-muted-foreground min-w-0">
          {listSearch.trim() ? "No matching classes." : "No classes found."}
        </div>
      );
    }

    return (
      <div className="min-w-[950px] p-1">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="w-[140px]">Scheduled</TableHead>
              <TableHead className="min-w-[200px]">Class</TableHead>
              <TableHead className="w-[150px]">Audience</TableHead>
              <TableHead className="w-[110px]">Platform</TableHead>
              <TableHead className="w-[80px]">Status</TableHead>
              <TableHead className="w-[180px] text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {classes.map((cl) => (
              <TableRow
                key={cl.id}
                className={`h-14 ${cl.is_active === false ? "opacity-60" : ""}`}
              >
                <TableCell className="align-middle py-2 text-xs text-muted-foreground whitespace-nowrap">
                  {cl.scheduled_at
                    ? new Date(cl.scheduled_at).toLocaleString([], {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })
                    : "—"}
                </TableCell>
                <TableCell className="align-middle py-2 max-w-[220px]">
                  <button
                    type="button"
                    onClick={() => openDetails(cl)}
                    className="text-left font-semibold text-sm truncate block w-full hover:text-primary hover:underline"
                    title={cl.title || ""}
                  >
                    {cl.title || "Untitled"}
                  </button>
                </TableCell>
                <TableCell className="align-middle py-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 text-[11px] font-medium px-2 max-w-[130px] truncate"
                    title="View audience targeting"
                    onClick={() => openAudience(cl)}
                  >
                    {classTargetSummaryShort(cl)}
                  </Button>
                </TableCell>
                <TableCell className="align-middle py-2">
                  <Badge variant="secondary" className="text-[10px] font-medium whitespace-nowrap">
                    {linkTypeLabel(cl.link_type)}
                  </Badge>
                </TableCell>
                <TableCell className="align-middle py-2">
                  {cl.is_active !== false ? (
                    <Badge className="bg-emerald-600 hover:bg-emerald-600 text-[10px]">Active</Badge>
                  ) : (
                    <Badge variant="outline" className="text-[10px]">
                      Hidden
                    </Badge>
                  )}
                </TableCell>
                <TableCell className="align-middle py-2 text-right">
                  <div className="flex items-center justify-end gap-0.5">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-8 animate-none"
                      title="View details"
                      onClick={() => openDetails(cl)}
                    >
                      <Eye className="size-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-8"
                      title="Duplicate"
                      onClick={() => handleDuplicate(cl)}
                    >
                      <Copy className="size-4 text-indigo-600" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-8"
                      title="Edit"
                      onClick={() => openEdit(cl)}
                    >
                      <Edit className="size-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-8"
                      title={cl.is_active !== false ? "Hide from students" : "Show to students"}
                      onClick={() => toggleActive(cl)}
                    >
                      {cl.is_active !== false ? (
                        <ToggleRight className="size-4 text-emerald-600" />
                      ) : (
                        <ToggleLeft className="size-4 text-muted-foreground" />
                      )}
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-8 text-destructive hover:text-destructive"
                      title="Delete"
                      onClick={() => deleteClass(cl)}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    );
  };

  return (
    <div className="grid lg:grid-cols-3 gap-6">
      <div className="lg:col-span-1 space-y-6" id="create-class-form">
        <Card className="p-6 border-none shadow-elegant">
          <h3 className="text-lg font-bold mb-1 flex items-center gap-2">
            <BookOpen className="size-5 text-primary" /> Class Link Management
          </h3>
          <p className="text-xs text-muted-foreground mb-4">
            Target students by university, college, and domain. Only matched students see the class on their dashboard.
          </p>

          <div className="rounded-xl bg-primary/5 border border-primary/10 p-4 mb-4 flex items-center gap-3">
            <Users className="size-5 text-primary shrink-0" />
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-primary">Recipients</p>
              <p className="text-2xl font-black text-slate-900">{recipientCount}</p>
              <p className="text-[11px] text-muted-foreground">students will receive this class link</p>
            </div>
          </div>

          <div className="space-y-4">
            {renderFilters(form, setForm)}

            <div className="space-y-2">
              <Label>Class Title</Label>
              <Input
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder="e.g. Web Development — Session 3"
              />
            </div>

            <div className="space-y-2">
              <Label>Class Description</Label>
              <Textarea
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="What students should prepare or expect in this session"
                className="min-h-[90px]"
              />
            </div>

            <div className="space-y-2">
              <Label>Class Date & Time</Label>
              <Input
                type="datetime-local"
                value={form.scheduledAt}
                onChange={(e) => setForm({ ...form, scheduledAt: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <Label>Platform</Label>
              <Select value={form.linkType} onValueChange={(v) => setForm({ ...form, linkType: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="auto">Auto-detect from URL</SelectItem>
                  <SelectItem value="meet">Google Meet</SelectItem>
                  <SelectItem value="zoom">Zoom</SelectItem>
                  <SelectItem value="teams">Microsoft Teams</SelectItem>
                  <SelectItem value="youtube">YouTube Live / Video</SelectItem>
                  <SelectItem value="url">Other link</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Class Link</Label>
              <Input
                value={form.url}
                onChange={(e) => setForm({ ...form, url: e.target.value })}
                placeholder="https://meet.google.com/..."
              />
            </div>

            <Button
              className="w-full gap-2"
              onClick={() => {
                const err = validateForm(form);
                if (err) return toast.error(err);
                setPreviewOpen(true);
              }}
            >
              <Eye className="size-4" /> Preview & Publish
            </Button>
          </div>
        </Card>
      </div>

      <div className="lg:col-span-2">
        <Card className="overflow-hidden border-none shadow-elegant h-full">
          <Tabs defaultValue="upcoming" className="w-full">
            <div className="p-4 bg-muted/20 border-b flex flex-col gap-4">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                  <h3 className="font-bold">Class History</h3>
                  <p className="text-xs text-muted-foreground">Published classes with targeting and schedule</p>
                </div>
                <TabsList className="bg-slate-100/80 p-0.5 border border-slate-200/50 rounded-lg">
                  <TabsTrigger value="upcoming" className="text-xs font-bold px-3 py-1 rounded-md data-[state=active]:bg-white data-[state=active]:shadow-sm">
                    Upcoming ({upcomingClasses.length})
                  </TabsTrigger>
                  <TabsTrigger value="past" className="text-xs font-bold px-3 py-1 rounded-md data-[state=active]:bg-white data-[state=active]:shadow-sm">
                    Past ({pastClasses.length})
                  </TabsTrigger>
                </TabsList>
              </div>
              <div className="relative max-w-md">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-3 text-muted-foreground" />
                <Input
                  className="pl-8 h-9"
                  placeholder="Search by class title…"
                  value={listSearch}
                  onChange={(e) => setListSearch(e.target.value)}
                />
              </div>
              <div className="grid md:grid-cols-2 gap-4">
                <MultiSelectCheckboxGroup
                  label="Universities"
                  options={unis}
                  selectedValues={listFilters.universities}
                  onChange={(universities) =>
                    setListFilters((f) => ({
                      ...f,
                      universities,
                      colleges: pruneCollegesForUniversities(colleges, unis, universities, f.colleges),
                    }))
                  }
                />
                <MultiSelectCheckboxGroup
                  label="Colleges"
                  options={listCollegeOptions}
                  selectedValues={listFilters.colleges}
                  onChange={(collegesSelected) =>
                    setListFilters((f) => ({ ...f, colleges: collegesSelected }))
                  }
                />
                <div className="space-y-2">
                  <Label>Domain</Label>
                  <Select
                    value={listFilters.domain}
                    onValueChange={(domain) => setListFilters((f) => ({ ...f, domain }))}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All domains</SelectItem>
                      {domains.map((d) => (
                        <SelectItem key={d.id} value={d.name}>{d.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Mode</Label>
                  <Select
                    value={listFilters.mode}
                    onValueChange={(mode) => setListFilters((f) => ({ ...f, mode }))}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All modes</SelectItem>
                      <SelectItem value="Online">Online</SelectItem>
                      <SelectItem value="Offline">Offline</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="self-start text-xs"
                onClick={() => {
                  setListFilters({ universities: [], colleges: [], domain: "all", mode: "all" });
                  setListSearch("");
                }}
              >
                Clear all filters
              </Button>
            </div>

            <TabsContent value="upcoming" className="m-0 focus-visible:outline-none">
              <ScrollArea className="h-[min(540px,60vh)] w-full rounded-b-lg">
                {renderClassTable(upcomingClasses)}
                <ScrollBar orientation="horizontal" className="z-20" />
              </ScrollArea>
            </TabsContent>

            <TabsContent value="past" className="m-0 focus-visible:outline-none">
              <ScrollArea className="h-[min(540px,60vh)] w-full rounded-b-lg">
                {renderClassTable(pastClasses)}
                <ScrollBar orientation="horizontal" className="z-20" />
              </ScrollArea>
            </TabsContent>
          </Tabs>
        </Card>
      </div>

      <Dialog
        open={audienceOpen}
        onOpenChange={(open) => {
          setAudienceOpen(open);
          if (!open) setAudienceClass(null);
        }}
      >
        <DialogContent className="sm:max-w-md max-h-[85vh] flex flex-col p-0 gap-0 overflow-hidden">
          {audienceClass ? (
            <>
              <DialogHeader className="px-6 pt-6 pb-3 shrink-0 border-b bg-muted/20">
                <DialogTitle className="text-base leading-snug pr-2 line-clamp-2">
                  Audience — {audienceClass.title || "Class"}
                </DialogTitle>
                <DialogDescription>
                  {audienceRecipientCount} matching student
                  {audienceRecipientCount === 1 ? "" : "s"} · scroll for full targeting lists
                </DialogDescription>
              </DialogHeader>

              <ScrollArea className="flex-1 w-full min-h-0 max-h-[min(58vh,420px)]">
                <div className="px-6 py-4">{renderAudienceTargetingBody(audienceClass)}</div>
              </ScrollArea>

              <Separator />
              <DialogFooter className="px-6 py-4 shrink-0 flex-col-reverse sm:flex-row gap-2">
                <Button variant="outline" className="w-full sm:w-auto" onClick={() => setAudienceOpen(false)}>
                  Close
                </Button>
                <Button
                  className="w-full sm:w-auto gap-2"
                  variant="secondary"
                  onClick={() => {
                    setAudienceOpen(false);
                    openDetails(audienceClass);
                  }}
                >
                  <Eye className="size-4" /> All class details
                </Button>
              </DialogFooter>
            </>
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Preview class before publishing</DialogTitle>
            <DialogDescription>
              This class will appear on {recipientCount} student dashboard(s).
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            <div><span className="font-bold">Title:</span> {form.title}</div>
            <div><span className="font-bold">Description:</span> {form.description}</div>
            <div>
              <span className="font-bold">Date & Time:</span>{" "}
              {form.scheduledAt
                ? new Date(form.scheduledAt).toLocaleString([], { dateStyle: "full", timeStyle: "short" })
                : "—"}
            </div>
            <div><span className="font-bold">Platform:</span> {linkTypeLabel(form.linkType === "auto" ? inferLinkTypeFromUrl(form.url) : form.linkType)}</div>
            <div className="break-all"><span className="font-bold">Link:</span> {form.url}</div>
            <div>
              <span className="font-bold">Target:</span>{" "}
              {describeClassTargets({
                target_universities: form.universities.length > 0 ? form.universities : null,
                target_colleges: form.colleges.length > 0 ? form.colleges : null,
                target_domains: form.domains.length > 0 ? form.domains : null,
                domain_id: null,
                internship_domains: null,
              })}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPreviewOpen(false)}>Back</Button>
            <Button disabled={saving} onClick={() => void handlePublish()}>
              {saving ? <Loader2 className="size-4 animate-spin mr-2" /> : <Calendar className="size-4 mr-2" />}
              Publish to students
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={detailsOpen}
        onOpenChange={(open) => {
          setDetailsOpen(open);
          if (!open) setDetailsClass(null);
        }}
      >
        <DialogContent className="sm:max-w-xl max-h-[90vh] flex flex-col p-0 gap-0">
          {detailsClass ? (
            <>
              <DialogHeader className="px-6 pt-6 pb-2 shrink-0">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <DialogTitle className="text-lg leading-tight pr-2">
                      {detailsClass.title || "Class details"}
                    </DialogTitle>
                    <DialogDescription className="mt-1">
                      Full schedule, targeting, and link information
                    </DialogDescription>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    {detailsClass.is_active !== false ? (
                      <Badge className="bg-emerald-600 hover:bg-emerald-600">Active</Badge>
                    ) : (
                      <Badge variant="outline">Hidden</Badge>
                    )}
                    <Badge variant="secondary">{linkTypeLabel(detailsClass.link_type)}</Badge>
                  </div>
                </div>
              </DialogHeader>

              <ScrollArea className="w-full max-h-[min(58vh,480px)]">
                <div className="space-y-5 px-6 pb-4 text-sm">
                  <section>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-2">
                      Schedule
                    </p>
                    <div className="grid sm:grid-cols-2 gap-3 rounded-lg border bg-muted/30 p-3">
                      <div>
                        <p className="text-xs text-muted-foreground">Class date & time</p>
                        <p className="font-medium">
                          {detailsClass.scheduled_at
                            ? new Date(detailsClass.scheduled_at).toLocaleString([], {
                                dateStyle: "full",
                                timeStyle: "short",
                              })
                            : "—"}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Published</p>
                        <p className="font-medium">
                          {detailsClass.created_at
                            ? new Date(detailsClass.created_at).toLocaleString([], {
                                dateStyle: "medium",
                                timeStyle: "short",
                              })
                            : "—"}
                        </p>
                      </div>
                      {detailsClass.updated_at ? (
                        <div className="sm:col-span-2">
                          <p className="text-xs text-muted-foreground">Last updated</p>
                          <p className="font-medium">
                            {new Date(detailsClass.updated_at).toLocaleString([], {
                              dateStyle: "medium",
                              timeStyle: "short",
                            })}
                          </p>
                        </div>
                      ) : null}
                    </div>
                  </section>

                  {detailsClass.description ? (
                    <section>
                      <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-2">
                        Description
                      </p>
                      <p className="rounded-lg border bg-background p-3 leading-relaxed whitespace-pre-wrap">
                        {detailsClass.description}
                      </p>
                    </section>
                  ) : null}

                  <section>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-2">
                      Class link
                    </p>
                    {detailsClass.url ? (
                      <a
                        href={detailsClass.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-start gap-2 rounded-lg border border-primary/20 bg-primary/5 p-3 text-primary hover:underline break-all"
                      >
                        <ExternalLink className="size-4 shrink-0 mt-0.5" />
                        <span>{detailsClass.url}</span>
                      </a>
                    ) : (
                      <p className="text-muted-foreground">No link set</p>
                    )}
                  </section>

                  <section>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-2">
                      Target audience
                    </p>
                    <div className="rounded-lg border p-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                      <div className="flex items-center gap-2 text-sm min-w-0">
                        <Users className="size-4 text-primary shrink-0" />
                        <span className="truncate">
                          <span className="font-bold">{detailsRecipientCount}</span> students ·{" "}
                          {classTargetSummaryShort(detailsClass)}
                        </span>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        className="shrink-0 gap-1.5"
                        onClick={() => {
                          setDetailsOpen(false);
                          openAudience(detailsClass);
                        }}
                      >
                        <Users className="size-3.5" /> View audience
                      </Button>
                    </div>
                  </section>
                </div>
              </ScrollArea>

              <Separator />
              <DialogFooter className="px-6 py-4 shrink-0 gap-2 sm:gap-2">
                <Button variant="outline" onClick={() => setDetailsOpen(false)}>
                  Close
                </Button>
                <Button
                  variant="outline"
                  className="gap-2"
                  onClick={() => {
                    setDetailsOpen(false);
                    openEdit(detailsClass);
                  }}
                >
                  <Edit className="size-4" /> Edit
                </Button>
                <Button
                  variant="outline"
                  className="gap-2"
                  onClick={() => {
                    void toggleActive(detailsClass);
                  }}
                >
                  {detailsClass.is_active !== false ? (
                    <ToggleLeft className="size-4" />
                  ) : (
                    <ToggleRight className="size-4" />
                  )}
                  {detailsClass.is_active !== false ? "Hide" : "Show"}
                </Button>
              </DialogFooter>
            </>
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit class</DialogTitle>
            <DialogDescription>Update details, reschedule, or change the class link.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {renderFilters(editForm, setEditForm)}
            <div className="space-y-2">
              <Label>Class Title</Label>
              <Input value={editForm.title} onChange={(e) => setEditForm({ ...editForm, title: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Class Description</Label>
              <Textarea value={editForm.description} onChange={(e) => setEditForm({ ...editForm, description: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Class Date & Time</Label>
              <Input type="datetime-local" value={editForm.scheduledAt} onChange={(e) => setEditForm({ ...editForm, scheduledAt: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Platform</Label>
              <Select value={editForm.linkType} onValueChange={(v) => setEditForm({ ...editForm, linkType: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="meet">Google Meet</SelectItem>
                  <SelectItem value="zoom">Zoom</SelectItem>
                  <SelectItem value="teams">Microsoft Teams</SelectItem>
                  <SelectItem value="youtube">YouTube</SelectItem>
                  <SelectItem value="url">Other link</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Class Link</Label>
              <Input value={editForm.url} onChange={(e) => setEditForm({ ...editForm, url: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)}>Cancel</Button>
            <Button disabled={saving} onClick={() => void handleUpdate()}>
              {saving ? <Loader2 className="size-4 animate-spin mr-2" /> : null}
              Save changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
