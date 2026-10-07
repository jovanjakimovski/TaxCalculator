ALTER TABLE payment_events RENAME COLUMN payment_intent_id TO provider_payment_id;
ALTER TABLE payment_refunds RENAME COLUMN payment_intent_id TO provider_payment_id;