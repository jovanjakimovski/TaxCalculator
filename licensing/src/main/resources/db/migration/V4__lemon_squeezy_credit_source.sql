ALTER TABLE credit_grants DROP CONSTRAINT credit_grants_source_type_check;
UPDATE credit_grants SET source_type = 'LEGACY' WHERE source_type = 'STRIPE';
ALTER TABLE credit_grants
  ADD CONSTRAINT credit_grants_source_type_check
  CHECK (source_type IN ('TEST_CODE', 'LEMON_SQUEEZY', 'LEGACY'));