CREATE TABLE IF NOT EXISTS integrations (
  code text PRIMARY KEY,
  category text NOT NULL CHECK (category IN ('maps', 'messaging', 'email', 'storage', 'operations', 'other')),
  name_en text NOT NULL,
  name_ar text NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  endpoint text,
  public_config jsonb NOT NULL DEFAULT '{}'::jsonb,
  secrets jsonb NOT NULL DEFAULT '{}'::jsonb,
  notes text,
  builtin boolean NOT NULL DEFAULT false,
  updated_by uuid REFERENCES accounts(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO integrations (code, category, name_en, name_ar, enabled, builtin) VALUES
  ('map', 'maps', 'Map tiles', 'خرائط التتبع', true, true),
  ('fcm', 'messaging', 'Android push (FCM)', 'إشعارات أندرويد', true, true),
  ('apns', 'messaging', 'Apple push (APNs)', 'إشعارات آيفون', true, true),
  ('smtp', 'email', 'Email delivery', 'البريد الإلكتروني', true, true),
  ('storage', 'storage', 'Document storage', 'تخزين المستندات', true, true)
ON CONFLICT (code) DO NOTHING;
