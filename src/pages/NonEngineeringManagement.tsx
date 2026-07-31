import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, BookOpen, Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { NonEngineeringConfigFormDialog } from "@/components/admin/NonEngineeringConfigFormDialog";
import {
  deleteNonEngineeringConfig,
  fetchAllNonEngineeringConfigs,
  saveNonEngineeringConfig,
  type NonEngineeringUniversityConfig,
} from "@/lib/nonEngineeringConfig";
import {
  fetchNonTechUniversityCatalog,
  type NonTechUniversityCatalog,
} from "@/lib/nonTechInstitutions";

export default function NonEngineeringManagement({
  embedded = false,
  backTo = "/admin",
}: {
  embedded?: boolean;
  backTo?: string;
} = {}) {
  const navigate = useNavigate();
  const [configs, setConfigs] = useState<NonEngineeringUniversityConfig[]>([]);
  const [catalog, setCatalog] = useState<NonTechUniversityCatalog[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [editingConfig, setEditingConfig] = useState<NonEngineeringUniversityConfig | null>(null);
  /** Prefill when configuring from catalog (new config for existing uni). */
  const [prefillFromCatalog, setPrefillFromCatalog] = useState<{
    universityName: string;
    universityId: string;
    collegeNames: string[];
  } | null>(null);

  const openAddForm = () => {
    setEditingConfig(null);
    setPrefillFromCatalog(null);
    setFormOpen(true);
  };

  const openEditForm = (config: NonEngineeringUniversityConfig) => {
    setPrefillFromCatalog(null);
    setEditingConfig(config);
    setFormOpen(true);
  };

  const openConfigureFromCatalog = (uni: NonTechUniversityCatalog) => {
    setEditingConfig(null);
    setPrefillFromCatalog({
      universityName: uni.name,
      universityId: uni.id,
      collegeNames: uni.colleges.map((c) => c.name),
    });
    setFormOpen(true);
  };

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [cfgRows, catRows] = await Promise.all([
        fetchAllNonEngineeringConfigs(supabase),
        fetchNonTechUniversityCatalog(supabase),
      ]);
      setConfigs(cfgRows);
      setCatalog(catRows);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to load Non-Tech Management");
      setConfigs([]);
      setCatalog([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  const configuredUniIds = new Set(configs.map((c) => c.university_id).filter(Boolean));
  const unconfiguredCatalog = catalog.filter((u) => !configuredUniIds.has(u.id));

  const handleSave = async (input: Parameters<typeof saveNonEngineeringConfig>[1]) => {
    setSaving(true);
    try {
      const saved = await saveNonEngineeringConfig(supabase, input);
      const collegeCount = input.collegeNames.filter((n) => n.trim()).length;
      toast.success(
        editingConfig
          ? `Non-tech config updated — ${collegeCount} college(s) synced${saved.colleges_removed ? `, ${saved.colleges_removed} removed` : ""}.`
          : `Non-tech config saved — ${collegeCount} college(s) synced to the catalog.`
      );
      if (saved.college_warnings?.length) {
        toast.message(
          `Some colleges could not be removed: ${saved.college_warnings.slice(0, 2).join("; ")}`
        );
      }
      setFormOpen(false);
      setEditingConfig(null);
      setPrefillFromCatalog(null);
      await loadAll();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to save config");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (config: NonEngineeringUniversityConfig) => {
    if (!confirm(`Remove non-tech config for ${config.university_name || "this university"}?`)) return;
    try {
      await deleteNonEngineeringConfig(supabase, config.id);
      toast.success("Config removed");
      await loadAll();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to delete config");
    }
  };

  return (
    <div className={embedded ? "space-y-6" : "min-h-screen bg-gradient-to-br from-slate-50 via-white to-blue-50/40"}>
      <div className={embedded ? "space-y-6" : "max-w-6xl mx-auto px-4 py-6 md:py-10 space-y-6"}>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            {!embedded && (
            <Button variant="ghost" size="sm" className="mb-2 -ml-2 gap-2" onClick={() => navigate(backTo)}>
              <ArrowLeft className="size-4" /> Back to Admin
            </Button>
            )}
            <h1 className="text-2xl md:text-3xl font-black flex items-center gap-2">
              <BookOpen className="size-7 text-primary" />
              Non-Tech Management
            </h1>
          </div>
          <Button className="gap-2 shrink-0" onClick={openAddForm}>
            <Plus className="size-4" /> Add Config
          </Button>
        </div>

        <Card className="border-none shadow-elegant overflow-hidden">
          <div className="p-4 border-b bg-muted/20 flex items-center justify-between">
            <span className="text-sm font-bold">{configs.length} non-tech university config(s)</span>
            {loading ? (
              <span className="text-xs text-muted-foreground inline-flex items-center gap-1">
                <Loader2 className="size-3 animate-spin" /> Loading…
              </span>
            ) : null}
          </div>

          {loading ? (
            <div className="py-16 text-center text-muted-foreground">
              <Loader2 className="size-8 animate-spin mx-auto mb-3 text-primary" />
              Loading configs…
            </div>
          ) : configs.length === 0 ? (
            <div className="py-16 px-6 text-center text-muted-foreground">
              <p className="font-medium">No non-tech configs yet.</p>
              <p className="text-xs mt-2">
                Click <strong>Add Config</strong> or configure an existing university from the catalog below.
              </p>
            </div>
          ) : (
            <div className="divide-y">
              {configs.map((config) => (
                <div key={config.id} className="p-5 space-y-3">
                  <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                    <div>
                      <h2 className="text-lg font-bold">{config.university_name || "University"}</h2>
                      <p className="text-[11px] text-muted-foreground mt-0.5">
                        Updated {config.updated_at ? new Date(config.updated_at).toLocaleString() : "—"}
                      </p>
                    </div>
                    <div className="flex items-center gap-1 self-start">
                      <Button variant="outline" size="sm" className="gap-1" onClick={() => openEditForm(config)}>
                        <Pencil className="size-4" /> Edit
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-destructive hover:text-destructive gap-1"
                        onClick={() => void handleDelete(config)}
                      >
                        <Trash2 className="size-4" /> Remove
                      </Button>
                    </div>
                  </div>

                  <div className="grid md:grid-cols-2 gap-4 text-xs">
                    <div>
                      <p className="font-bold uppercase tracking-wide text-muted-foreground mb-2">
                        Programmes / courses
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {config.courses.map((c) => (
                          <Badge key={c} variant="secondary" className="text-[10px]">
                            {c}
                          </Badge>
                        ))}
                      </div>
                    </div>
                    <div>
                      <p className="font-bold uppercase tracking-wide text-muted-foreground mb-2">
                        Subjects by programme
                      </p>
                      <div className="space-y-1.5">
                        {Object.entries(config.branches_by_course).map(([course, subjects]) => (
                          <div key={course}>
                            <span className="font-semibold">{course}:</span>{" "}
                            <span className="text-muted-foreground">{subjects.join(", ")}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card className="border-none shadow-elegant overflow-hidden">
          <div className="p-4 border-b bg-muted/20">
            <span className="text-sm font-bold">
              Catalog — non-tech universities not yet configured ({unconfiguredCatalog.length})
            </span>
            <p className="text-[11px] text-muted-foreground mt-1">
              These are already in the system (excluding engineering / technical / management). Configure
              them to manage courses and sync colleges for registration.
            </p>
          </div>
          {loading ? null : unconfiguredCatalog.length === 0 ? (
            <div className="py-10 text-center text-xs text-muted-foreground">
              All listed non-tech universities already have a config, or the catalog is empty.
            </div>
          ) : (
            <div className="divide-y">
              {unconfiguredCatalog.map((uni) => (
                <div
                  key={uni.id}
                  className="p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3"
                >
                  <div>
                    <p className="font-bold text-sm">{uni.name}</p>
                    <p className="text-[11px] text-muted-foreground">{uni.colleges.length} college(s) in catalog</p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1 shrink-0"
                    onClick={() => openConfigureFromCatalog(uni)}
                  >
                    <Plus className="size-3.5" /> Configure
                  </Button>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      <NonEngineeringConfigFormDialog
        open={formOpen}
        onOpenChange={(open) => {
          setFormOpen(open);
          if (!open) {
            setEditingConfig(null);
            setPrefillFromCatalog(null);
          }
        }}
        initialConfig={editingConfig}
        catalogPrefill={prefillFromCatalog}
        saving={saving}
        onSubmit={handleSave}
      />
    </div>
  );
}
