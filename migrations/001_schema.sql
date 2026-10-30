-- JOSTI core schema. Timestamps are timestamptz stored in UTC.

CREATE TABLE schema_migrations (
  version text PRIMARY KEY,
  applied_at timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TABLE organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type text NOT NULL CHECK (type IN ('merchant', 'broker', 'carrier_company', 'independent_carrier')),
  legal_name text NOT NULL,
  legal_name_ar text,
  commercial_registration text,
  tax_id text,
  national_address text,
  iban text,
  phone text,
  status text NOT NULL DEFAULT 'pending_verification' CHECK (status IN (
    'pending_verification', 'verified', 'active', 'needs_update', 'suspended'
  )),
  supported_ports text[] NOT NULL DEFAULT '{}',
  service_regions text[] NOT NULL DEFAULT '{}',
  carrier_kind text CHECK (carrier_kind IS NULL OR carrier_kind IN ('company', 'independent')),
  join_code text UNIQUE,
  rating_avg numeric(4,2) NOT NULL DEFAULT 0,
  rating_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  phone text NOT NULL,
  password_hash text NOT NULL,
  full_name text NOT NULL,
  full_name_ar text,
  preferred_locale text NOT NULL DEFAULT 'ar' CHECK (preferred_locale IN ('ar', 'en')),
  role text NOT NULL CHECK (role IN ('merchant', 'customs_broker', 'carrier', 'driver', 'administrator')),
  status text NOT NULL DEFAULT 'pending_verification' CHECK (status IN (
    'pending_verification', 'verified', 'active', 'needs_update', 'suspended'
  )),
  organization_id uuid REFERENCES organizations(id) ON DELETE RESTRICT,
  admin_permissions text[] NOT NULL DEFAULT '{}',
  suspended_reason text,
  last_login_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT accounts_email_unique UNIQUE (email),
  CONSTRAINT accounts_admin_org CHECK (
    (role = 'administrator' AND organization_id IS NULL)
    OR (role <> 'administrator' AND organization_id IS NOT NULL)
  )
);

CREATE UNIQUE INDEX accounts_email_lower_idx ON accounts (lower(email));

CREATE TABLE merchant_broker_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  broker_org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  is_default boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'removed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (merchant_org_id, broker_org_id)
);

CREATE UNIQUE INDEX merchant_one_default_broker_idx
  ON merchant_broker_links (merchant_org_id)
  WHERE is_default = true AND status = 'active';

CREATE TABLE drivers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES accounts(id) ON DELETE RESTRICT,
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  license_number text,
  license_expiry date,
  residence_permit_number text,
  availability text NOT NULL DEFAULT 'unavailable' CHECK (availability IN ('available', 'waiting', 'on_trip', 'unavailable')),
  status text NOT NULL DEFAULT 'pending_verification' CHECK (status IN (
    'pending_verification', 'verified', 'active', 'needs_update', 'suspended'
  )),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE vehicles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  plate_number text NOT NULL,
  truck_type text NOT NULL,
  supported_container_types text[] NOT NULL,
  registration_expiry date,
  insurance_expiry date,
  inspection_expiry date,
  operating_card_expiry date,
  availability text NOT NULL DEFAULT 'unavailable' CHECK (availability IN ('available', 'waiting', 'on_trip', 'unavailable')),
  status text NOT NULL DEFAULT 'pending_verification' CHECK (status IN (
    'pending_verification', 'verified', 'active', 'needs_update', 'suspended'
  )),
  public_label text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX vehicles_plate_lower_idx ON vehicles (lower(plate_number));

CREATE TABLE driver_vehicle_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id uuid NOT NULL REFERENCES drivers(id) ON DELETE RESTRICT,
  vehicle_id uuid NOT NULL REFERENCES vehicles(id) ON DELETE RESTRICT,
  assigned_by uuid REFERENCES accounts(id) ON DELETE SET NULL,
  is_current boolean NOT NULL DEFAULT true,
  assigned_at timestamptz NOT NULL DEFAULT now(),
  unassigned_at timestamptz
);

CREATE UNIQUE INDEX one_current_assignment_per_driver
  ON driver_vehicle_assignments (driver_id) WHERE is_current = true;
CREATE UNIQUE INDEX one_current_assignment_per_vehicle
  ON driver_vehicle_assignments (vehicle_id) WHERE is_current = true;

CREATE TABLE ports (
  code text PRIMARY KEY,
  name_en text NOT NULL,
  name_ar text NOT NULL,
  latitude double precision NOT NULL,
  longitude double precision NOT NULL,
  active boolean NOT NULL DEFAULT true
);

CREATE TABLE container_types (
  code text PRIMARY KEY,
  name_en text NOT NULL,
  name_ar text NOT NULL
);

CREATE TABLE truck_types (
  code text PRIMARY KEY,
  name_en text NOT NULL,
  name_ar text NOT NULL
);

CREATE TABLE truck_container_compatibility (
  truck_type text NOT NULL REFERENCES truck_types(code),
  container_type text NOT NULL REFERENCES container_types(code),
  PRIMARY KEY (truck_type, container_type)
);

CREATE TABLE documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT,
  organization_id uuid REFERENCES organizations(id) ON DELETE RESTRICT,
  vehicle_id uuid REFERENCES vehicles(id) ON DELETE RESTRICT,
  driver_id uuid REFERENCES drivers(id) ON DELETE RESTRICT,
  request_id uuid,
  trip_id uuid,
  incident_id uuid,
  doc_type text NOT NULL,
  storage_key text NOT NULL UNIQUE,
  original_filename text NOT NULL,
  mime_type text NOT NULL,
  size_bytes integer NOT NULL CHECK (size_bytes > 0 AND size_bytes <= 10485760),
  sha256 text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'needs_update', 'replaced')),
  expires_on date,
  review_notes text,
  reviewed_by uuid REFERENCES accounts(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  replaced_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX accounts_org_idx ON accounts (organization_id);
CREATE INDEX vehicles_org_idx ON vehicles (organization_id, status);
CREATE INDEX drivers_org_idx ON drivers (organization_id, status);
CREATE INDEX documents_owner_idx ON documents (owner_user_id, doc_type);
CREATE INDEX documents_org_idx ON documents (organization_id, doc_type);
CREATE INDEX documents_expiry_idx ON documents (expires_on) WHERE status = 'approved';

CREATE SEQUENCE request_ref_seq START 1;
CREATE SEQUENCE trip_ref_seq START 1;

CREATE TABLE transport_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reference text NOT NULL UNIQUE,
  merchant_org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  merchant_user_id uuid NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT,
  broker_org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  used_default_broker boolean NOT NULL DEFAULT false,
  port_code text NOT NULL REFERENCES ports(code),
  container_number text NOT NULL,
  container_type text NOT NULL,
  truck_type text NOT NULL,
  loading_location text NOT NULL,
  destination text NOT NULL,
  scheduled_loading_at timestamptz NOT NULL,
  expected_delivery_at timestamptz NOT NULL,
  instructions text,
  proposed_price numeric(12,2),
  approved_price numeric(12,2),
  currency text NOT NULL DEFAULT 'SAR',
  status text NOT NULL CHECK (status IN (
    'new_request',
    'customs_clearance',
    'returned_for_correction',
    'ready_for_admin_review',
    'released_to_carriers',
    'candidate_responses',
    'carrier_selected',
    'trip_confirmed',
    'completed',
    'cancelled'
  )),
  external_payment_confirmed boolean NOT NULL DEFAULT false,
  permits_confirmed boolean NOT NULL DEFAULT false,
  broker_ready_at timestamptz,
  broker_ready_by uuid REFERENCES accounts(id) ON DELETE SET NULL,
  released_by uuid REFERENCES accounts(id) ON DELETE SET NULL,
  released_at timestamptz,
  release_notes text,
  returned_reason text,
  cancel_reason text,
  closed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT request_schedule_check CHECK (expected_delivery_at > scheduled_loading_at),
  CONSTRAINT request_price_nonnegative CHECK (
    (proposed_price IS NULL OR proposed_price > 0) AND (approved_price IS NULL OR approved_price > 0)
  )
);

CREATE UNIQUE INDEX transport_requests_open_container_idx
  ON transport_requests (lower(container_number))
  WHERE status NOT IN ('cancelled', 'completed');

CREATE INDEX transport_requests_status_idx ON transport_requests (status, port_code);
CREATE INDEX transport_requests_merchant_idx ON transport_requests (merchant_org_id, created_at DESC);
CREATE INDEX transport_requests_broker_idx ON transport_requests (broker_org_id, status);

CREATE TABLE customs_clearance_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL REFERENCES transport_requests(id) ON DELETE RESTRICT,
  broker_user_id uuid NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT,
  progress_note text,
  document_id uuid REFERENCES documents(id) ON DELETE SET NULL,
  external_payment_confirmed boolean,
  permits_confirmed boolean,
  approved_price numeric(12,2),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE carrier_responses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL REFERENCES transport_requests(id) ON DELETE RESTRICT,
  carrier_org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  carrier_user_id uuid NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT,
  vehicle_id uuid NOT NULL REFERENCES vehicles(id) ON DELETE RESTRICT,
  driver_id uuid NOT NULL REFERENCES drivers(id) ON DELETE RESTRICT,
  status text NOT NULL CHECK (status IN ('candidate', 'withdrawn', 'selected', 'not_selected')),
  accepted_price numeric(12,2) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (request_id, carrier_org_id)
);

CREATE INDEX carrier_responses_request_idx ON carrier_responses (request_id, status);

CREATE TABLE trips (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reference text NOT NULL UNIQUE,
  request_id uuid NOT NULL UNIQUE REFERENCES transport_requests(id) ON DELETE RESTRICT,
  carrier_org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  carrier_user_id uuid NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT,
  driver_id uuid NOT NULL REFERENCES drivers(id) ON DELETE RESTRICT,
  vehicle_id uuid NOT NULL REFERENCES vehicles(id) ON DELETE RESTRICT,
  response_id uuid NOT NULL UNIQUE REFERENCES carrier_responses(id) ON DELETE RESTRICT,
  agreed_price numeric(12,2) NOT NULL,
  currency text NOT NULL DEFAULT 'SAR',
  confirmed_by uuid NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT,
  confirmed_at timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL CHECK (status IN (
    'en_route_to_port',
    'arrived_at_port',
    'loaded',
    'trip_started',
    'in_transit',
    'arrived_at_destination',
    'delivered',
    'closed'
  )),
  closed_by uuid REFERENCES accounts(id) ON DELETE SET NULL,
  closed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX trips_driver_idx ON trips (driver_id, status);
CREATE INDEX trips_status_idx ON trips (status, created_at DESC);

CREATE TABLE status_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type text NOT NULL CHECK (entity_type IN ('request', 'trip')),
  entity_id uuid NOT NULL,
  request_id uuid REFERENCES transport_requests(id) ON DELETE RESTRICT,
  trip_id uuid REFERENCES trips(id) ON DELETE RESTRICT,
  previous_status text,
  new_status text NOT NULL,
  actor_user_id uuid REFERENCES accounts(id) ON DELETE SET NULL,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX status_events_entity_idx ON status_events (entity_type, entity_id, created_at);

CREATE TABLE vehicle_locations (
  vehicle_id uuid PRIMARY KEY REFERENCES vehicles(id) ON DELETE CASCADE,
  driver_id uuid REFERENCES drivers(id) ON DELETE SET NULL,
  trip_id uuid REFERENCES trips(id) ON DELETE SET NULL,
  latitude double precision NOT NULL,
  longitude double precision NOT NULL,
  accuracy_m double precision,
  availability text NOT NULL,
  recorded_at timestamptz NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE location_updates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id uuid NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
  driver_id uuid REFERENCES drivers(id) ON DELETE SET NULL,
  trip_id uuid REFERENCES trips(id) ON DELETE SET NULL,
  latitude double precision NOT NULL,
  longitude double precision NOT NULL,
  accuracy_m double precision,
  recorded_at timestamptz NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  applied boolean NOT NULL DEFAULT true,
  UNIQUE (vehicle_id, recorded_at)
);

CREATE INDEX location_updates_trip_idx ON location_updates (trip_id, recorded_at DESC);

CREATE TABLE loading_evidence (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id uuid NOT NULL UNIQUE REFERENCES trips(id) ON DELETE RESTRICT,
  document_id uuid NOT NULL UNIQUE REFERENCES documents(id) ON DELETE RESTRICT,
  uploader_user_id uuid NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT,
  uploaded_at timestamptz NOT NULL DEFAULT now(),
  notes text
);

CREATE TABLE delivery_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id uuid NOT NULL UNIQUE REFERENCES trips(id) ON DELETE RESTRICT,
  recipient_name text NOT NULL,
  delivered_at timestamptz NOT NULL,
  document_id uuid NOT NULL UNIQUE REFERENCES documents(id) ON DELETE RESTRICT,
  uploader_user_id uuid NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE ratings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id uuid NOT NULL REFERENCES trips(id) ON DELETE RESTRICT,
  rater_user_id uuid NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT,
  rater_role text NOT NULL,
  target_org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  target_role text NOT NULL CHECK (target_role IN ('merchant', 'customs_broker', 'carrier')),
  score integer NOT NULL CHECK (score BETWEEN 1 AND 5),
  comment text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (trip_id, rater_user_id, target_role)
);

CREATE TABLE notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  type text NOT NULL,
  title_en text NOT NULL,
  title_ar text NOT NULL,
  body_en text NOT NULL,
  body_ar text NOT NULL,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  read_at timestamptz,
  push_status text NOT NULL DEFAULT 'pending' CHECK (push_status IN (
    'pending', 'sent', 'failed', 'skipped_no_provider', 'skipped_no_token'
  )),
  push_error text,
  push_provider text,
  dedupe_key text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX notifications_dedupe_idx ON notifications (user_id, dedupe_key) WHERE dedupe_key IS NOT NULL;
CREATE INDEX notifications_user_idx ON notifications (user_id, created_at DESC);

CREATE TABLE push_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  platform text NOT NULL CHECK (platform IN ('ios', 'android', 'web')),
  token text NOT NULL UNIQUE,
  disabled_at timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE platform_settings (
  id boolean PRIMARY KEY DEFAULT true CHECK (id = true),
  fee_amount numeric(12,2) NOT NULL DEFAULT 50 CHECK (fee_amount >= 0),
  fee_currency text NOT NULL DEFAULT 'SAR',
  free_period_active boolean NOT NULL DEFAULT false,
  free_period_starts_on date,
  free_period_ends_on date,
  free_period_eligibility text CHECK (
    free_period_eligibility IS NULL OR free_period_eligibility IN ('all_completed_trips', 'none')
  ),
  closure_authority text NOT NULL DEFAULT 'admin_operations_or_general',
  selection_policy text NOT NULL DEFAULT 'merchant_or_broker',
  broker_rating_targets text[] NOT NULL DEFAULT ARRAY['carrier'],
  stale_location_minutes integer NOT NULL DEFAULT 15,
  updated_by uuid REFERENCES accounts(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE platform_fees (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id uuid NOT NULL UNIQUE REFERENCES trips(id) ON DELETE RESTRICT,
  amount numeric(12,2) NOT NULL CHECK (amount >= 0),
  currency text NOT NULL DEFAULT 'SAR',
  status text NOT NULL CHECK (status IN ('pending', 'settled', 'exempt', 'waived')),
  exemption_reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE settlements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fee_id uuid NOT NULL UNIQUE REFERENCES platform_fees(id) ON DELETE RESTRICT,
  amount numeric(12,2) NOT NULL,
  currency text NOT NULL,
  method text NOT NULL DEFAULT 'external_manual',
  external_reference text NOT NULL,
  notes text,
  recorded_by uuid NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT,
  settled_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE incidents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id uuid NOT NULL REFERENCES trips(id) ON DELETE RESTRICT,
  request_id uuid NOT NULL REFERENCES transport_requests(id) ON DELETE RESTRICT,
  reporter_user_id uuid NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT,
  incident_type text NOT NULL,
  description text NOT NULL,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'under_review', 'resolved', 'dismissed')),
  resolution text,
  resolved_by uuid REFERENCES accounts(id) ON DELETE SET NULL,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX incidents_status_idx ON incidents (status, created_at DESC);

CREATE TABLE audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id uuid REFERENCES accounts(id) ON DELETE SET NULL,
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  ip text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX audit_logs_created_idx ON audit_logs (created_at DESC);
CREATE INDEX audit_logs_entity_idx ON audit_logs (entity_type, entity_id);

CREATE TABLE sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  refresh_token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  user_agent text,
  ip text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX sessions_user_idx ON sessions (user_id);

CREATE TABLE password_reset_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE idempotency_keys (
  key text NOT NULL,
  user_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  request_hash text NOT NULL,
  response_status integer NOT NULL,
  response_body jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, key)
);

ALTER TABLE documents
  ADD CONSTRAINT documents_request_fk FOREIGN KEY (request_id) REFERENCES transport_requests(id) ON DELETE RESTRICT;
ALTER TABLE documents
  ADD CONSTRAINT documents_trip_fk FOREIGN KEY (trip_id) REFERENCES trips(id) ON DELETE RESTRICT;
ALTER TABLE documents
  ADD CONSTRAINT documents_incident_fk FOREIGN KEY (incident_id) REFERENCES incidents(id) ON DELETE RESTRICT;
ALTER TABLE documents
  ADD CONSTRAINT documents_replaced_by_fk FOREIGN KEY (replaced_by) REFERENCES documents(id) ON DELETE SET NULL;

CREATE TRIGGER organizations_updated BEFORE UPDATE ON organizations
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER accounts_updated BEFORE UPDATE ON accounts
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER drivers_updated BEFORE UPDATE ON drivers
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER vehicles_updated BEFORE UPDATE ON vehicles
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER requests_updated BEFORE UPDATE ON transport_requests
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trips_updated BEFORE UPDATE ON trips
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER incidents_updated BEFORE UPDATE ON incidents
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER push_tokens_updated BEFORE UPDATE ON push_tokens
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

INSERT INTO platform_settings (id) VALUES (true);
