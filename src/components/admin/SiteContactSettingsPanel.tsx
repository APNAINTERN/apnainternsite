import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, MessageSquare, Phone } from "lucide-react";
import { toast } from "sonner";
import {
  DEFAULT_SITE_SETTINGS,
  type SiteSettingsRow,
} from "@/lib/siteSettings";

type SiteContactSettingsPanelProps = {
  onSaved?: () => void;
  className?: string;
};

export function SiteContactSettingsPanel({
  onSaved,
  className,
}: SiteContactSettingsPanelProps) {
  const [settings, setSettings] = useState<SiteSettingsRow>(DEFAULT_SITE_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [hasWhatsappColumn, setHasWhatsappColumn] = useState(false);
  const [hasSupportPhoneColumn, setHasSupportPhoneColumn] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from("site_settings")
        .select("*")
        .eq("id", 1)
        .maybeSingle();
      if (cancelled) return;
      if (error) {
        toast.error(error.message);
      } else if (data) {
        setSettings({ ...DEFAULT_SITE_SETTINGS, ...data });
        setHasWhatsappColumn("whatsapp_link_enabled" in data);
        setHasSupportPhoneColumn("support_phone" in data);
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      const payload: SiteSettingsRow = {
        id: 1,
        ...settings,
        updated_at: new Date().toISOString(),
      };
      if (!hasWhatsappColumn) {
        delete payload.whatsapp_link_enabled;
        delete payload.whatsapp_link_url;
      }
      if (!hasSupportPhoneColumn) {
        delete payload.support_phone;
        delete payload.show_support_phone_on_footer;
        delete payload.contact_support_phones;
      }
      const { error } = await supabase.from("site_settings").upsert(payload);
      if (error) throw error;
      toast.success("Contact settings saved");
      onSaved?.();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to save settings");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <Card className={`p-6 border-none shadow-elegant bg-white flex items-center justify-center min-h-[200px] ${className || ""}`}>
        <Loader2 className="size-6 animate-spin text-primary" />
      </Card>
    );
  }

  return (
    <Card className={`p-6 border-none shadow-elegant bg-white space-y-5 ${className || ""}`}>
      <div>
        <h3 className="font-black text-slate-900 flex items-center gap-2">
          <Phone className="size-5 text-primary" />
          Contact & WhatsApp
        </h3>
        <p className="text-xs text-muted-foreground mt-1">
          Manage support phone and WhatsApp channel. Registration form no longer shows these — use notice popup, footer, or contact page.
        </p>
      </div>

      <div className="space-y-3 pt-2 border-t border-slate-100">
        <Label className="text-xs font-black uppercase tracking-tight">Support phone</Label>
        <Input
          value={settings.support_phone || ""}
          onChange={(e) => setSettings({ ...settings, support_phone: e.target.value })}
          placeholder="+91 70509 36593"
          className="bg-slate-50 border-none h-10"
          disabled={!hasSupportPhoneColumn}
        />
        <div className="flex items-center gap-2 p-2 rounded-xl bg-slate-50 border border-slate-100">
          <Checkbox
            id="show-phone-footer"
            checked={!!settings.show_support_phone_on_footer}
            onCheckedChange={(checked) =>
              setSettings({ ...settings, show_support_phone_on_footer: !!checked })
            }
            disabled={!hasSupportPhoneColumn}
          />
          <Label htmlFor="show-phone-footer" className="text-[10px] font-bold uppercase cursor-pointer">
            Show on website footer
          </Label>
        </div>
        <div className="space-y-1.5">
          <Label className="text-[10px] text-slate-500 uppercase font-black tracking-tight">
            Contact page numbers (one per line)
          </Label>
          <Textarea
            value={settings.contact_support_phones || ""}
            onChange={(e) => setSettings({ ...settings, contact_support_phones: e.target.value })}
            placeholder={"9341143791\n7858967071"}
            className="bg-slate-50 border-none min-h-[80px] text-sm"
            disabled={!hasSupportPhoneColumn}
          />
        </div>
        {!hasSupportPhoneColumn && (
          <p className="text-[10px] text-amber-800 bg-amber-50 border border-amber-100 rounded-lg p-2">
            Run <code className="text-[9px]">supabase/add_support_phone_to_settings.sql</code> on your database to enable phone settings.
          </p>
        )}
      </div>

      <div className="space-y-3 pt-3 border-t border-slate-100">
        <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50">
          <div>
            <Label className="text-xs font-black uppercase tracking-tight flex items-center gap-1.5 text-slate-800">
              <MessageSquare className="size-3 text-[#25D366]" />
              WhatsApp channel
            </Label>
            <p className="text-[10px] text-muted-foreground">Show in notice popup on home / register / login</p>
          </div>
          <Checkbox
            checked={!!settings.whatsapp_link_enabled}
            onCheckedChange={(checked) =>
              setSettings({ ...settings, whatsapp_link_enabled: !!checked })
            }
            disabled={!hasWhatsappColumn}
          />
        </div>
        {settings.whatsapp_link_enabled && (
          <div className="space-y-1.5">
            <Label className="text-[10px] text-slate-500 uppercase font-black tracking-tight">
              WhatsApp channel link
            </Label>
            <Input
              value={settings.whatsapp_link_url || ""}
              onChange={(e) => setSettings({ ...settings, whatsapp_link_url: e.target.value })}
              placeholder="https://whatsapp.com/channel/..."
              className="bg-slate-50 border-none h-10 text-xs"
              disabled={!hasWhatsappColumn}
            />
          </div>
        )}
        {!hasWhatsappColumn && (
          <p className="text-[10px] text-amber-800 bg-amber-50 border border-amber-100 rounded-lg p-2">
            Run <code className="text-[9px]">supabase/add_whatsapp_link_to_settings.sql</code> to enable WhatsApp settings.
          </p>
        )}
      </div>

      <Button
        className="w-full h-11 bg-primary hover:bg-primary/90 font-black"
        onClick={() => void handleSave()}
        disabled={saving}
      >
        {saving ? <Loader2 className="size-4 animate-spin mr-2" /> : null}
        Save contact settings
      </Button>
    </Card>
  );
}
