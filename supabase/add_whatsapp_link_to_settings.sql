-- Add WhatsApp Channel columns to site_settings table
ALTER TABLE public.site_settings ADD COLUMN IF NOT EXISTS whatsapp_link_enabled BOOLEAN DEFAULT true;
ALTER TABLE public.site_settings ADD COLUMN IF NOT EXISTS whatsapp_link_url TEXT DEFAULT 'https://whatsapp.com/channel/0029VbC9lvi3bbV8TS7TbB00';

-- Force enable it for the existing settings row so it shows up immediately
UPDATE public.site_settings SET whatsapp_link_enabled = true;
