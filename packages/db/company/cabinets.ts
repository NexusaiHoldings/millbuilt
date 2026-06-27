/**
 * Cabinet/millwork company schema (millbuilt-table-ddl-consolidation-001).
 *
 * Consolidates every cabinet_* table the app queries into ONE migrate-able DDL
 * constant. migrate.ts runs *_DDL constants from packages/db/company/*.ts at
 * deploy, and the integration TABLE-REF gate recognizes tables created here —
 * neither sees inline `CREATE TABLE` buried in apps/web/lib, which is why the
 * MillBuilt build referenced 13 tables with "no creating DDL".
 *
 * The 11 cabinet_* tables are lifted verbatim from the lib/webhook inline DDL
 * (kept idempotent via IF NOT EXISTS); cabinet_design_validations +
 * manufacturing_partners are authored to match their existing query shapes.
 */
export const CABINETS_DDL = `
CREATE TABLE IF NOT EXISTS cabinet_designs (
  id                      uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                 text    NOT NULL,
  name                    text    NOT NULL DEFAULT 'Untitled Design',
  dimensions              jsonb   NOT NULL DEFAULT '{"width":24,"height":36,"depth":12}'::jsonb,
  wood_species_material_id text,
  door_style_material_id   text,
  hardware_material_id     text,
  mozaik_project_id        text,
  status                  text    NOT NULL DEFAULT 'draft',
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS cabinet_quotes (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  design_id                text NOT NULL,
  user_id                  text NOT NULL,
  design_name              text NOT NULL DEFAULT '',
  wood_species_material_id text,
  door_style_material_id   text,
  hardware_material_id     text,
  dimensions_json          text NOT NULL DEFAULT '{}',
  materials_cost_cents     integer NOT NULL DEFAULT 0,
  labor_cost_cents         integer NOT NULL DEFAULT 0,
  hardware_cost_cents      integer NOT NULL DEFAULT 0,
  freight_cost_cents       integer NOT NULL DEFAULT 0,
  subtotal_cost_cents      integer NOT NULL DEFAULT 0,
  margin_multiplier        numeric(6,4) NOT NULL DEFAULT 1.45,
  total_sell_price_cents   integer NOT NULL DEFAULT 0,
  deposit_amount_cents     integer NOT NULL DEFAULT 0,
  line_items_json          text NOT NULL DEFAULT '[]',
  status                   text NOT NULL DEFAULT 'valid',
  expires_at               timestamptz NOT NULL DEFAULT (now() + interval '30 days'),
  created_at               timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS cabinet_materials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  species TEXT,
  door_style TEXT,
  hardware_line TEXT,
  category TEXT NOT NULL DEFAULT 'wood',
  finish_image_url TEXT,
  description TEXT,
  carb_compliant BOOLEAN NOT NULL DEFAULT FALSE,
  prop65_warning BOOLEAN NOT NULL DEFAULT FALSE,
  configurator_slug TEXT NOT NULL DEFAULT '',
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS cabinet_pricing_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  margin_multiplier NUMERIC(6,4) NOT NULL DEFAULT 1.45,
  min_order_value_cents INTEGER NOT NULL DEFAULT 50000,
  notes TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by TEXT
);

CREATE TABLE IF NOT EXISTS cabinet_orders (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_id                  text NOT NULL,
  design_id                 text NOT NULL,
  user_id                   text NOT NULL,
  design_name               text NOT NULL DEFAULT '',
  total_price_cents         integer NOT NULL DEFAULT 0,
  deposit_paid_cents        integer NOT NULL DEFAULT 0,
  stripe_session_id         text UNIQUE,
  stripe_payment_intent_id  text,
  status                    text NOT NULL DEFAULT 'deposit_paid',
  estimated_lead_time_weeks integer NOT NULL DEFAULT 7,
  notes                     text,
  created_at                timestamptz NOT NULL DEFAULT now(),
  updated_at                timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS cabinet_order_milestones (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id     text NOT NULL,
  milestone    text NOT NULL,
  status       text NOT NULL DEFAULT 'pending',
  description  text,
  completed_at timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (order_id, milestone)
);

CREATE TABLE IF NOT EXISTS cabinet_order_reviews (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id       text NOT NULL,
  admin_user_id  text NOT NULL,
  action         text NOT NULL,
  partner_id     text,
  notes          text,
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS cabinet_cut_lists (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  design_id   text NOT NULL,
  items       jsonb NOT NULL DEFAULT '[]'::jsonb,
  source      text NOT NULL DEFAULT 'parametric',
  raw_output  text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS cabinet_freight_rates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  state_code TEXT NOT NULL,
  state_name TEXT NOT NULL,
  rate_cents INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS cabinet_manufacturing_partners (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  contact_name TEXT,
  contact_email TEXT,
  contact_phone TEXT,
  api_endpoint TEXT,
  delivery_email TEXT,
  supported_states TEXT[] NOT NULL DEFAULT '{}',
  capacity_orders_per_week INTEGER NOT NULL DEFAULT 10,
  carb_certified BOOLEAN NOT NULL DEFAULT FALSE,
  lead_time_days INTEGER NOT NULL DEFAULT 14,
  defect_rate_threshold NUMERIC(5,4) NOT NULL DEFAULT 0.0200,
  epa_tsca_cert_url TEXT,
  state_contractor_license TEXT,
  insurance_cert_url TEXT,
  notes TEXT,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS cabinet_webhook_events (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  stripe_event_id  text UNIQUE NOT NULL,
  event_type       text NOT NULL,
  processed_at     timestamptz,
  processing_error text,
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS cabinet_design_validations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  design_id uuid NOT NULL,
  result jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS manufacturing_partners (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  dispatch_method text NOT NULL DEFAULT 'email',
  api_endpoint text,
  api_key text,
  contact_email text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
`;
