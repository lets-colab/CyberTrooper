-- CYBERTROOPER — Supabase Schema
-- Project: nykukkccynnykbmxznhl (lets-colab's Project)
-- Applied: 2026-06-18

-- Reference sequence (auto-generated CT-YYYY-NNNNN IDs)
CREATE SEQUENCE IF NOT EXISTS trooper_ref_seq START 1;

-- Main signups table
CREATE TABLE IF NOT EXISTS public.trooper_signups (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reference_id     text UNIQUE NOT NULL DEFAULT (
    'CT-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('trooper_ref_seq')::text, 5, '0')
  ),
  full_name        text NOT NULL,
  phone            text NOT NULL,
  email            text,
  threads_handle   text NOT NULL,
  area             text NOT NULL DEFAULT 'Other',
  follower_count   text,
  sample_post      text,
  payment_method   text NOT NULL DEFAULT 'Bank transfer',
  application_status text NOT NULL DEFAULT 'pending',
  eligibility_answers jsonb,
  sync_status      text NOT NULL DEFAULT 'new',
  notion_page_id   text,
  notion_page_url  text,
  sync_error       text,
  source           text NOT NULL DEFAULT 'website',
  created_at       timestamptz NOT NULL DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.trooper_signups ENABLE ROW LEVEL SECURITY;

-- Public can INSERT (anon signup)
CREATE POLICY "public_insert" ON public.trooper_signups
  FOR INSERT TO anon WITH CHECK (true);

-- Authenticated admin can SELECT
CREATE POLICY "admin_select" ON public.trooper_signups
  FOR SELECT TO authenticated USING (true);

-- Authenticated admin can UPDATE
CREATE POLICY "admin_update" ON public.trooper_signups
  FOR UPDATE TO authenticated USING (true);

-- Index for admin queries
CREATE INDEX IF NOT EXISTS idx_signups_created ON public.trooper_signups(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_signups_status  ON public.trooper_signups(application_status);
