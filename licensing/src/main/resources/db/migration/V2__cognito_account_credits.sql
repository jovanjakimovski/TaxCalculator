CREATE TABLE license_accounts (
  account_subject VARCHAR(512) PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE licenses ALTER COLUMN credential_hash DROP NOT NULL;
ALTER TABLE licenses ADD COLUMN account_subject VARCHAR(512)
  REFERENCES license_accounts(account_subject);
ALTER TABLE licenses ADD COLUMN account_primary BOOLEAN NOT NULL DEFAULT FALSE;
CREATE INDEX idx_licenses_account_subject ON licenses(account_subject);
CREATE UNIQUE INDEX uq_licenses_account_primary
  ON licenses(account_subject) WHERE account_primary = TRUE;

CREATE TABLE legacy_license_links (
  credential_hash CHAR(64) PRIMARY KEY,
  account_subject VARCHAR(512) NOT NULL REFERENCES license_accounts(account_subject),
  linked_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE report_consumptions ADD COLUMN account_subject VARCHAR(512)
  REFERENCES license_accounts(account_subject);
CREATE UNIQUE INDEX uq_report_consumptions_account_request
  ON report_consumptions(account_subject, request_id)
  WHERE account_subject IS NOT NULL;