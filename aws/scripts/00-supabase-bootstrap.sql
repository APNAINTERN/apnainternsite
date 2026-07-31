-- Supabase-compatible bootstrap for a plain AWS RDS PostgreSQL instance.
-- Recreates the base that Supabase/GoTrue normally provides so that the
-- Lovable-generated supabase/migrations/*.sql can be applied on top and the
-- auth.users / auth.identities CSV exports can be loaded.
--
-- Safe to run multiple times (idempotent).

-- ── Extensions ──────────────────────────────────────────────────────────────
CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp"  WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pgcrypto     WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp"; -- also expose in public/search_path
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ── Roles (referenced by GRANTs and RLS policies in the migrations) ──────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    CREATE ROLE anon NOLOGIN NOINHERIT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    CREATE ROLE authenticated NOLOGIN NOINHERIT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    CREATE ROLE service_role NOLOGIN NOINHERIT BYPASSRLS;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticator') THEN
    CREATE ROLE authenticator NOINHERIT LOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'supabase_auth_admin') THEN
    CREATE ROLE supabase_auth_admin NOLOGIN NOINHERIT CREATEROLE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'supabase_storage_admin') THEN
    CREATE ROLE supabase_storage_admin NOLOGIN NOINHERIT CREATEROLE;
  END IF;
  -- Some Lovable/Supabase migrations GRANT ... TO postgres explicitly.
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'postgres') THEN
    CREATE ROLE postgres NOLOGIN NOINHERIT;
  END IF;
END
$$;

-- Let authenticator switch into the API roles (PostgREST model).
GRANT anon, authenticated, service_role TO authenticator;
-- Make the RDS master user a member of these so it can create/own objects
-- and still satisfy ownership/grant statements.
GRANT anon, authenticated, service_role, postgres, supabase_auth_admin, supabase_storage_admin TO CURRENT_USER;

-- ── Schemas ─────────────────────────────────────────────────────────────────
CREATE SCHEMA IF NOT EXISTS auth    AUTHORIZATION CURRENT_USER;
CREATE SCHEMA IF NOT EXISTS storage AUTHORIZATION CURRENT_USER;

GRANT USAGE ON SCHEMA public  TO anon, authenticated, service_role;
GRANT USAGE ON SCHEMA auth    TO anon, authenticated, service_role;
GRANT USAGE ON SCHEMA storage TO anon, authenticated, service_role;

-- ── auth.users (GoTrue schema — superset that matches the CSV export) ────────
CREATE TABLE IF NOT EXISTS auth.users (
  instance_id                 uuid,
  id                          uuid NOT NULL PRIMARY KEY,
  aud                         varchar(255),
  role                        varchar(255),
  email                       varchar(255),
  encrypted_password          varchar(255),
  email_confirmed_at          timestamptz,
  invited_at                  timestamptz,
  confirmation_token          varchar(255),
  confirmation_sent_at        timestamptz,
  recovery_token              varchar(255),
  recovery_sent_at            timestamptz,
  email_change_token_new      varchar(255),
  email_change                varchar(255),
  email_change_sent_at        timestamptz,
  last_sign_in_at             timestamptz,
  raw_app_meta_data           jsonb,
  raw_user_meta_data          jsonb,
  is_super_admin              boolean,
  created_at                  timestamptz,
  updated_at                  timestamptz,
  phone                       text,
  phone_confirmed_at          timestamptz,
  phone_change                text DEFAULT '',
  phone_change_token          varchar(255) DEFAULT '',
  phone_change_sent_at        timestamptz,
  email_change_token_current  varchar(255) DEFAULT '',
  email_change_confirm_status smallint DEFAULT 0,
  banned_until                timestamptz,
  reauthentication_token      varchar(255) DEFAULT '',
  reauthentication_sent_at    timestamptz,
  is_sso_user                 boolean NOT NULL DEFAULT false,
  deleted_at                  timestamptz,
  is_anonymous                boolean NOT NULL DEFAULT false
);
CREATE UNIQUE INDEX IF NOT EXISTS users_email_partial_key
  ON auth.users (email) WHERE is_sso_user = false;

-- ── auth.identities ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS auth.identities (
  provider_id     text NOT NULL,
  user_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  identity_data   jsonb NOT NULL,
  provider        text NOT NULL,
  last_sign_in_at timestamptz,
  created_at      timestamptz,
  updated_at      timestamptz,
  email           text GENERATED ALWAYS AS (lower((identity_data ->> 'email'))) STORED,
  id              uuid NOT NULL DEFAULT extensions.uuid_generate_v4() PRIMARY KEY,
  CONSTRAINT identities_provider_id_provider_unique UNIQUE (provider_id, provider)
);

-- ── auth helper functions used by RLS policies / RPCs ────────────────────────
CREATE OR REPLACE FUNCTION auth.uid()
RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;

CREATE OR REPLACE FUNCTION auth.role()
RETURNS text LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('request.jwt.claim.role', true), '')::text
$$;

CREATE OR REPLACE FUNCTION auth.email()
RETURNS text LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('request.jwt.claim.email', true), '')::text
$$;

CREATE OR REPLACE FUNCTION auth.jwt()
RETURNS jsonb LANGUAGE sql STABLE AS $$
  SELECT coalesce(
    nullif(current_setting('request.jwt.claim', true), ''),
    nullif(current_setting('request.jwt.claims', true), '')
  )::jsonb
$$;

GRANT ALL ON ALL TABLES    IN SCHEMA auth TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA auth TO service_role;
