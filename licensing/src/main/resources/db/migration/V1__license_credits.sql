CREATE TABLE licenses (
  id UUID PRIMARY KEY,
  credential_hash CHAR(64) NOT NULL UNIQUE,
  credits INTEGER NOT NULL DEFAULT 0 CHECK (credits >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE test_code_redemptions (
  id UUID PRIMARY KEY,
  code_hash CHAR(64) NOT NULL,
  license_id UUID NOT NULL REFERENCES licenses(id),
  credits_granted INTEGER NOT NULL CHECK (credits_granted > 0),
  redeemed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (code_hash, license_id)
);

CREATE TABLE credit_grants (
  id UUID PRIMARY KEY,
  license_id UUID NOT NULL REFERENCES licenses(id),
  source_type VARCHAR(20) NOT NULL CHECK (source_type IN ('TEST_CODE', 'STRIPE')),
  source_id VARCHAR(255) NOT NULL,
  credits_granted INTEGER NOT NULL CHECK (credits_granted > 0),
  credits_remaining INTEGER NOT NULL CHECK (credits_remaining >= 0 AND credits_remaining <= credits_granted),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reversed_at TIMESTAMPTZ,
  UNIQUE (license_id, source_type, source_id)
);

CREATE TABLE report_consumptions (
  id UUID PRIMARY KEY,
  license_id UUID NOT NULL REFERENCES licenses(id),
  request_id VARCHAR(80) NOT NULL,
  credit_grant_id UUID NOT NULL REFERENCES credit_grants(id),
  consumed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (license_id, request_id)
);

CREATE TABLE payment_events (
  id UUID PRIMARY KEY,
  provider_event_id VARCHAR(255) NOT NULL UNIQUE,
  checkout_session_id VARCHAR(255) NOT NULL UNIQUE,
  payment_intent_id VARCHAR(255) NOT NULL UNIQUE,
  license_id UUID NOT NULL REFERENCES licenses(id),
  refunded_at TIMESTAMPTZ,
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE payment_refunds (
  id UUID PRIMARY KEY,
  provider_event_id VARCHAR(255) NOT NULL UNIQUE,
  payment_intent_id VARCHAR(255) NOT NULL,
  license_id UUID NOT NULL REFERENCES licenses(id),
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);