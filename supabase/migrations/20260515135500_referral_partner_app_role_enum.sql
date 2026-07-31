-- Must run in its own migration transaction (Postgres 55P04) before using the new label.

ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'referral_partner';
