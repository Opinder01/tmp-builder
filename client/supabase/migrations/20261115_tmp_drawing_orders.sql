-- Migration: Create tmp_drawing_orders table
-- Run this in Supabase SQL Editor

CREATE TABLE IF NOT EXISTS tmp_drawing_orders (
  id                       UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Customer
  customer_email           TEXT        NOT NULL,
  customer_name            TEXT        NOT NULL,
  customer_phone           TEXT,
  company_name             TEXT,

  -- Job details
  site_address             TEXT        NOT NULL,
  work_type                TEXT        NOT NULL,
  work_description         TEXT        NOT NULL,
  num_drawings             INTEGER     NOT NULL DEFAULT 1,
  special_requirements     TEXT,

  -- Payment
  stripe_session_id        TEXT,
  stripe_payment_intent_id TEXT,
  amount_paid              INTEGER,

  -- Status
  payment_status           TEXT        NOT NULL DEFAULT 'pending'
                             CHECK (payment_status IN ('pending','paid','refunded')),
  order_status             TEXT        NOT NULL DEFAULT 'pending'
                             CHECK (order_status IN ('pending','in_progress','completed','delivered')),

  -- Attachments (array of Supabase Storage public URLs)
  attachments              JSONB,

  -- Internal
  drafter_notes            TEXT,
  delivery_sent_at         TIMESTAMPTZ
);

-- Index for quick lookups by session and email
CREATE INDEX IF NOT EXISTS idx_tmp_orders_session  ON tmp_drawing_orders (stripe_session_id);
CREATE INDEX IF NOT EXISTS idx_tmp_orders_email    ON tmp_drawing_orders (customer_email);
CREATE INDEX IF NOT EXISTS idx_tmp_orders_status   ON tmp_drawing_orders (payment_status, order_status);

-- Allow service role full access (already the case by default)
-- If you have RLS enabled, add a policy:
-- ALTER TABLE tmp_drawing_orders ENABLE ROW LEVEL SECURITY;
-- CREATE POLICY "service_role_all" ON tmp_drawing_orders USING (true) WITH CHECK (true);
