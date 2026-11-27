-- Bakry ERP: مخزن سجلات مرن للمرحلة الأولى من الربط.
-- لا ينشئ جداول عملاء/فواتير افتراضية قبل مطابقة مخطط التطبيق الفعلي.
CREATE EXTENSION IF NOT EXISTS pgcrypto;
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
CREATE INDEX IF NOT EXISTS app_records_store_updated_idx ON app_records(store_name, updated_at);
CREATE INDEX IF NOT EXISTS app_records_data_gin_idx ON app_records USING GIN(record_data);
CREATE TABLE IF NOT EXISTS sync_operations (
  operation_uuid UUID PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
