import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Cog, Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EngineeringConfigFormDialog } from "@/components/admin/EngineeringConfigFormDialog";
import {
  deleteEngineeringConfig,
  fetchAllEngineeringConfigs,
  saveEngineeringConfig,
  type EngineeringUniversityConfig,
} from "@/lib/engineeringConfig";

export default function EngineeringManagement({
  embedded = false,
  backTo = "/admin",
}: {
  embedded?: boolean;
  backTo?: string;
} = {}) {
  const navigate = useNavigate();
  const [configs, setConfigs] = useState<EngineeringUniversityConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [editingConfig, setEditingConfig] = useState<EngineeringUniversityConfig | null>(null);

  const openAddForm = () => {
    setEditingConfig(null);
    setFormOpen(true);
  };

  const openEditForm = (config: EngineeringUniversityConfig) => {
    setEditingConfig(config);
    setFormOpen(true);
  };

  const loadConfigs = useCallback(async () => {
    setLoading(true);
    try {
      const rows = await fetchAllEngineeringConfigs(supabase);
      setConfigs(rows);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to load engineering configs");
      setConfigs([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadConfigs();
  }, [loadConfigs]);

  const handleSave = async (input: Parameters<typeof saveEngineeringConfig>[1]) => {
    setSaving(true);
    try {
      const saved = await saveEngineeringConfig(supabase, input);
      const collegeCount = input.collegeNames.filter((n) => n.trim()).length;
      const bits = [
        `${collegeCount} college(s)`,
        saved.colleges_removed ? `${saved.colleges_removed} removed` : null,
        saved.colleges_inserted ? `${saved.colleges_inserted} added` : null,
      ].filter(Boolean);
      toast.success(
        editingConfig
          ? `Engineering config updated — ${bits.join(", ")}.`
          : `Engineering config saved — ${bits.join(", ")}.`
      );
      if (saved.college_warnings?.length) {
        toast.message(
          `Some colleges could not be removed: ${saved.college_warnings.slice(0, 2).join("; ")}`
        );
      }
      setFormOpen(false);
      setEditingConfig(null);
      await loadConfigs();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to save config");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (config: EngineeringUniversityConfig) => {
    if (!confirm(`Remove engineering config for ${config.university_name || "this university"}?`)) return;
    try {
      await deleteEngineeringConfig(supabase, config.id);
      toast.success("Config removed");
      await loadConfigs();
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
              <Cog className="size-7 text-primary" />
              Eng. Management
            </h1>
            <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
              Configure engineering universities, colleges, courses, branches, and internship domains. These
              settings drive the engineering registration flow for students.
            </p>
          </div>
          <Button className="gap-2 shrink-0" onClick={openAddForm}>
            <Plus className="size-4" /> Add Config
          </Button>
        </div>

        <Card className="border-none shadow-elegant overflow-hidden">
          <div className="p-4 border-b bg-muted/20 flex items-center justify-between">
            <span className="text-sm font-bold">{configs.length} engineering university config(s)</span>
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
              <p className="font-medium">No engineering configs yet.</p>
              <p className="text-xs mt-2">
                Click <strong>Add Config</strong> to create a university with engineering courses, branches, and
                domains.
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
                      <Button
                        variant="outline"
                        size="sm"
                        className="gap-1"
                        onClick={() => openEditForm(config)}
                      >
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

                  <div className="grid md:grid-cols-3 gap-4 text-xs">
                    <div>
                      <p className="font-bold uppercase tracking-wide text-muted-foreground mb-2">Courses</p>
                      <div className="flex flex-wrap gap-1.5">
                        {config.courses.map((c) => (
                          <Badge key={c} variant="secondary" className="text-[10px]">
                            {c}
                          </Badge>
                        ))}
                      </div>
                    </div>
                    <div>
                      <p className="font-bold uppercase tracking-wide text-muted-foreground mb-2">Branches</p>
                      <div className="space-y-1.5">
                        {Object.entries(config.branches_by_course).map(([course, branches]) => (
                          <div key={course}>
                            <span className="font-semibold">{course}:</span>{" "}
                            <span className="text-muted-foreground">{branches.join(", ")}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div>
                      <p className="font-bold uppercase tracking-wide text-muted-foreground mb-2">Domains</p>
                      <div className="flex flex-wrap gap-1.5">
                        {config.domains.map((d) => (
                          <Badge key={d} variant="outline" className="text-[10px]">
                            {d}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      <EngineeringConfigFormDialog
        open={formOpen}
        onOpenChange={(open) => {
          setFormOpen(open);
          if (!open) setEditingConfig(null);
        }}
        initialConfig={editingConfig}
        saving={saving}
        onSubmit={handleSave}
      />
    </div>
  );
}
