-- Bakry ERP: additive multi-tenant / licensing migration (v1)
-- IMPORTANT:
-- 1) Take a full PostgreSQL backup before running this file.
-- 2) This script does NOT assign existing app_records to a tenant.
-- 3) Legacy rows keep tenant_id = NULL until the owner reviews the data and explicitly adopts them.
-- 4) Do not execute this migration against the live database without approval.

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Preserve compatibility with the original flexible sync tables.
CREATE TABLE IF NOT EXISTS app_records (
  record_uuid UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_name TEXT NOT NULL CHECK (store_name IN (
    'customers','guarantors','suppliers','products','units','sales','installments',
    'transactions','supplier_dues','audit_logs','branches','defaults','traffic',
    'notifications','collection_notes'
  )),
  record_data JSONB NOT NULL,
  revision BIGINT NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS sync_operations (
  operation_uuid UUID PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS tenants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended','closed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS tenant_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  duration_code TEXT NOT NULL CHECK (duration_code IN ('month_1','month_2','month_4','year_1','lifetime')),
  month_mode TEXT CHECK (month_mode IN ('calendar','30_days')),
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended','expired','renewed','cancelled')),
  user_limit INTEGER CHECK (user_limit IS NULL OR user_limit >= 1),
  user_limit_unlimited BOOLEAN NOT NULL DEFAULT false,
  created_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK ((duration_code NOT IN ('month_1','month_2','month_4')) OR month_mode IS NOT NULL),
  CHECK ((duration_code = 'lifetime' AND ends_at IS NULL) OR (duration_code <> 'lifetime' AND ends_at IS NOT NULL))
);

CREATE INDEX IF NOT EXISTS tenant_subscriptions_tenant_created_idx
  ON tenant_subscriptions(tenant_id, created_at DESC);

CREATE TABLE IF NOT EXISTS activation_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code_hash CHAR(64) NOT NULL UNIQUE,
  code_hint TEXT NOT NULL,
  duration_code TEXT NOT NULL CHECK (duration_code IN ('month_1','month_2','month_4','year_1','lifetime')),
  month_mode TEXT CHECK (month_mode IN ('calendar','30_days')),
  user_limit INTEGER CHECK (user_limit IS NULL OR user_limit >= 1),
  user_limit_unlimited BOOLEAN NOT NULL DEFAULT false,
  status TEXT NOT NULL DEFAULT 'unused' CHECK (status IN ('unused','activated','cancelled')),
  tenant_id UUID REFERENCES tenants(id) ON DELETE RESTRICT,
  created_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  activated_at TIMESTAMPTZ,
  CHECK ((duration_code NOT IN ('month_1','month_2','month_4')) OR month_mode IS NOT NULL),
  CHECK ((status = 'activated' AND tenant_id IS NOT NULL AND activated_at IS NOT NULL)
      OR (status <> 'activated'))
);

CREATE INDEX IF NOT EXISTS activation_codes_status_created_idx
  ON activation_codes(status, created_at DESC);

CREATE TABLE IF NOT EXISTS tenant_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  username TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin','sales','accounting','viewer')),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, username)
);

CREATE INDEX IF NOT EXISTS tenant_users_tenant_active_idx
  ON tenant_users(tenant_id, is_active);

CREATE TABLE IF NOT EXISTS license_audit_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id) ON DELETE RESTRICT,
  action TEXT NOT NULL,
  actor TEXT NOT NULL,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS license_audit_tenant_created_idx
  ON license_audit_events(tenant_id, created_at DESC);

-- Tenant ownership is nullable during migration so existing data is neither deleted nor
-- silently attributed to a newly-created tenant. Reads/writes in the new API always scope by tenant_id.
ALTER TABLE app_records
  ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id) ON DELETE RESTRICT;
ALTER TABLE sync_operations
  ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id) ON DELETE RESTRICT;
ALTER TABLE tenant_subscriptions
  ADD COLUMN IF NOT EXISTS user_limit_unlimited BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE activation_codes
  ADD COLUMN IF NOT EXISTS user_limit_unlimited BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS app_records_tenant_store_updated_idx
  ON app_records(tenant_id, store_name, updated_at);
CREATE INDEX IF NOT EXISTS sync_operations_tenant_applied_idx
  ON sync_operations(tenant_id, applied_at);

CREATE TABLE IF NOT EXISTS bakry_schema_migrations (
  version TEXT PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
INSERT INTO bakry_schema_migrations(version)
VALUES ('2026_11_multitenant_licensing_v1')
ON CONFLICT (version) DO NOTHING;

COMMIT;
