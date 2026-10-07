package com.taxcalculator.licensing;

import java.util.List;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;

@Repository
public class JdbcLicenseStore implements LicenseStore {
    private final JdbcTemplate jdbc;

    public JdbcLicenseStore(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    @Override
    @Transactional
    public int grantTestCredits(String credentialHash, String codeHash, int credits) {
        jdbc.update("""
                INSERT INTO licenses (id, credential_hash)
                VALUES (?, ?)
                ON CONFLICT (credential_hash) DO NOTHING
                """, UUID.randomUUID(), credentialHash);
        UUID licenseId = licenseId(credentialHash);
        lockLicense(licenseId);
        int inserted = jdbc.update("""
                INSERT INTO test_code_redemptions (id, code_hash, license_id, credits_granted)
                VALUES (?, ?, ?, ?)
                ON CONFLICT (code_hash, license_id) DO NOTHING
                """, UUID.randomUUID(), codeHash, licenseId, credits);
        if (inserted == 1) {
                        jdbc.update("""
                                        INSERT INTO credit_grants
                                            (id, license_id, source_type, source_id, credits_granted, credits_remaining)
                                        VALUES (?, ?, 'TEST_CODE', ?, ?, ?)
                                        """, UUID.randomUUID(), licenseId, codeHash, credits, credits);
            jdbc.update("UPDATE licenses SET credits = credits + ? WHERE id = ?", credits, licenseId);
        }
        return balance(licenseId);
    }

    @Override
    @Transactional
    public int grantTestCredits(UUID licenseId, String codeHash, int credits) {
        lockLicense(licenseId);
        int inserted = jdbc.update("""
                INSERT INTO test_code_redemptions (id, code_hash, license_id, credits_granted)
                VALUES (?, ?, ?, ?)
                ON CONFLICT (code_hash, license_id) DO NOTHING
                """, UUID.randomUUID(), codeHash, licenseId, credits);
        if (inserted == 1) {
            jdbc.update("""
                    INSERT INTO credit_grants
                      (id, license_id, source_type, source_id, credits_granted, credits_remaining)
                    VALUES (?, ?, 'TEST_CODE', ?, ?, ?)
                    """, UUID.randomUUID(), licenseId, codeHash, credits, credits);
            jdbc.update("UPDATE licenses SET credits = credits + ? WHERE id = ?", credits, licenseId);
        }
        return balance(licenseId);
    }

    @Override
    public int credits(String credentialHash) {
        List<Integer> balances = jdbc.query(
                "SELECT credits FROM licenses WHERE credential_hash = ?",
                (result, row) -> result.getInt("credits"), credentialHash);
        return balances.isEmpty() ? 0 : balances.get(0);
    }

    @Override
    public int accountCredits(String accountSubject) {
        List<Integer> balances = jdbc.query("""
                SELECT COALESCE(SUM(credits), 0) AS credits
                FROM licenses WHERE account_subject = ?
                """, (result, row) -> result.getInt("credits"), accountSubject);
        return balances.isEmpty() ? 0 : balances.get(0);
    }

    @Override
    @Transactional
    public UUID getOrCreateLicenseId(String credentialHash) {
        jdbc.update("""
                INSERT INTO licenses (id, credential_hash)
                VALUES (?, ?)
                ON CONFLICT (credential_hash) DO NOTHING
                """, UUID.randomUUID(), credentialHash);
        return licenseId(credentialHash);
    }

        @Override
        @Transactional
        public UUID getOrCreateAccountLicenseId(String accountSubject) {
        ensureAccount(accountSubject);
            lockAccount(accountSubject);
        List<UUID> existing = jdbc.query("""
            SELECT id FROM licenses
                WHERE account_subject = ? AND account_primary = TRUE
            ORDER BY created_at, id LIMIT 1
            """, (result, row) -> result.getObject("id", UUID.class), accountSubject);
        if (!existing.isEmpty()) return existing.get(0);

        UUID licenseId = UUID.randomUUID();
        jdbc.update("""
                INSERT INTO licenses (id, credential_hash, account_subject, account_primary)
                VALUES (?, NULL, ?, TRUE)
            """, licenseId, accountSubject);
        return licenseId;
        }

        @Override
        @Transactional
        public LinkResult linkLegacyLicense(String accountSubject, String credentialHash) {
        ensureAccount(accountSubject);
        lockAccount(accountSubject);

        List<String> linkedSubjects = jdbc.query(
            "SELECT account_subject FROM legacy_license_links WHERE credential_hash = ?",
            (result, row) -> result.getString("account_subject"), credentialHash);
        if (!linkedSubjects.isEmpty()) {
            return accountSubject.equals(linkedSubjects.get(0)) ? LinkResult.ALREADY_LINKED : LinkResult.ALREADY_CLAIMED;
        }

        List<UUID> licenseIds = jdbc.query(
            "SELECT id FROM licenses WHERE credential_hash = ? FOR UPDATE",
            (result, row) -> result.getObject("id", UUID.class), credentialHash);
        if (licenseIds.isEmpty()) return LinkResult.NOT_FOUND;

        UUID licenseId = licenseIds.get(0);
        List<String> currentSubjects = jdbc.query(
            "SELECT account_subject FROM licenses WHERE id = ?",
            (result, row) -> result.getString("account_subject"), licenseId);
        String currentSubject = currentSubjects.get(0);
        if (currentSubject != null && !currentSubject.equals(accountSubject)) {
            return LinkResult.ALREADY_CLAIMED;
        }

        jdbc.update("UPDATE licenses SET account_subject = ?, credential_hash = NULL, account_primary = FALSE WHERE id = ?",
            accountSubject, licenseId);
        jdbc.update("""
            INSERT INTO legacy_license_links (credential_hash, account_subject)
            VALUES (?, ?)
            ON CONFLICT (credential_hash) DO NOTHING
            """, credentialHash, accountSubject);
        return LinkResult.LINKED;
        }

    @Override
    @Transactional
    public void grantPurchasedCredit(
            UUID licenseId, String providerEventId, String checkoutSessionId, String providerPaymentId) {
        grantPurchasedCredits(licenseId, providerEventId, checkoutSessionId, providerPaymentId, 1);
    }

    @Override public void checkReady() { jdbc.queryForObject("SELECT 1", Integer.class); }

    @Override
    @Transactional
    public void grantPurchasedCredits(UUID licenseId, String providerEventId, String checkoutSessionId,
            String providerPaymentId, int credits) {
        if (credits < 1 || credits > 3) throw new IllegalArgumentException("Invalid package size");
        lockLicense(licenseId);
        int inserted = jdbc.update("""
            INSERT INTO payment_events
                  (id, provider_event_id, checkout_session_id, provider_payment_id, license_id)
            VALUES (?, ?, ?, ?, ?)
                ON CONFLICT DO NOTHING
            """, UUID.randomUUID(), providerEventId, checkoutSessionId, providerPaymentId, licenseId);
        if (inserted == 1) {
            jdbc.update("""
                INSERT INTO credit_grants
                  (id, license_id, source_type, source_id, credits_granted, credits_remaining)
                VALUES (?, ?, 'LEMON_SQUEEZY', ?, ?, ?)
                """, UUID.randomUUID(), licenseId, checkoutSessionId, credits, credits);
            jdbc.update("UPDATE licenses SET credits = credits + ? WHERE id = ?", credits, licenseId);
        }
    }

        @Override
        @Transactional
    public boolean refundPurchasedCredit(String providerPaymentId, String refundEventId) {
        List<UUID> licenseIds = jdbc.query(
                "SELECT license_id FROM payment_events WHERE provider_payment_id = ?",
            (result, row) -> result.getObject("license_id", UUID.class), providerPaymentId);
        if (licenseIds.isEmpty()) return false;

        UUID licenseId = licenseIds.get(0);
        lockLicense(licenseId);
        int inserted = jdbc.update("""
                INSERT INTO payment_refunds (id, provider_event_id, provider_payment_id, license_id)
            VALUES (?, ?, ?, ?)
            ON CONFLICT (provider_event_id) DO NOTHING
            """, UUID.randomUUID(), refundEventId, providerPaymentId, licenseId);
        if (inserted == 1) {
            UUID grantId = jdbc.queryForObject("""
                SELECT id FROM credit_grants
                    WHERE license_id = ? AND source_type = 'LEMON_SQUEEZY'
                      AND source_id = (SELECT checkout_session_id FROM payment_events WHERE provider_payment_id = ?)
                FOR UPDATE
                    """, UUID.class, licenseId, providerPaymentId);
            int remaining = jdbc.queryForObject(
                "SELECT credits_remaining FROM credit_grants WHERE id = ?", Integer.class, grantId);
            if (remaining > 0) {
            jdbc.update("""
                UPDATE credit_grants
                SET credits_remaining = 0, reversed_at = NOW()
                WHERE id = ?
                """, grantId);
            jdbc.update("UPDATE licenses SET credits = credits - ? WHERE id = ?", remaining, licenseId);
            }
            jdbc.update("UPDATE payment_events SET refunded_at = NOW() WHERE provider_payment_id = ?", providerPaymentId);
        }
        return true;
        }

    @Override
    @Transactional
    public Consumption consume(String credentialHash, String requestId) {
        List<UUID> licenseIds = jdbc.query(
                "SELECT id FROM licenses WHERE credential_hash = ?",
                (result, row) -> result.getObject("id", UUID.class), credentialHash);
        if (licenseIds.isEmpty()) {
            return new Consumption(false, 0);
        }
        UUID licenseId = licenseIds.get(0);
        lockLicense(licenseId);

        List<UUID> existing = jdbc.query(
            "SELECT id FROM report_consumptions WHERE license_id = ? AND request_id = ?",
            (result, row) -> result.getObject("id", UUID.class), licenseId, requestId);
        if (!existing.isEmpty()) {
            return new Consumption(true, balance(licenseId));
        }

        List<UUID> grantIds = jdbc.query("""
            SELECT id FROM credit_grants
            WHERE license_id = ? AND credits_remaining > 0
            ORDER BY created_at, id
            LIMIT 1
            FOR UPDATE
            """, (result, row) -> result.getObject("id", UUID.class), licenseId);
        if (grantIds.isEmpty()) {
            return new Consumption(false, balance(licenseId));
        }
        UUID grantId = grantIds.get(0);
        jdbc.update("UPDATE credit_grants SET credits_remaining = credits_remaining - 1 WHERE id = ?", grantId);
        jdbc.update("UPDATE licenses SET credits = credits - 1 WHERE id = ? AND credits > 0", licenseId);
        jdbc.update("""
            INSERT INTO report_consumptions (id, license_id, request_id, credit_grant_id)
            VALUES (?, ?, ?, ?)
            """, UUID.randomUUID(), licenseId, requestId, grantId);
        return new Consumption(true, balance(licenseId));
    }

        @Override
        @Transactional
        public Consumption consumeAccount(String accountSubject, String requestId) {
        List<String> accounts = jdbc.query(
            "SELECT account_subject FROM license_accounts WHERE account_subject = ? FOR UPDATE",
            (result, row) -> result.getString("account_subject"), accountSubject);
        if (accounts.isEmpty()) return new Consumption(false, 0);

        List<UUID> existing = jdbc.query(
            "SELECT id FROM report_consumptions WHERE account_subject = ? AND request_id = ?",
            (result, row) -> result.getObject("id", UUID.class), accountSubject, requestId);
        if (!existing.isEmpty()) return new Consumption(true, accountCredits(accountSubject));

        // All paths lock licenses before grants, including refunds. Stable ordering
        // prevents a refund/consume deadlock when an account owns several licenses.
        jdbc.query("SELECT id FROM licenses WHERE account_subject = ? ORDER BY id FOR UPDATE",
                (result, row) -> result.getObject("id", UUID.class), accountSubject);

        List<GrantReference> grants = jdbc.query("""
                SELECT cg.id AS grant_id, cg.license_id AS license_id
                FROM credit_grants cg
                JOIN licenses lic ON lic.id = cg.license_id
                WHERE lic.account_subject = ? AND cg.credits_remaining > 0
                ORDER BY cg.created_at, cg.id
            LIMIT 1
                FOR UPDATE OF cg
            """, (result, row) -> new GrantReference(
            result.getObject("grant_id", UUID.class), result.getObject("license_id", UUID.class)), accountSubject);
        if (grants.isEmpty()) return new Consumption(false, accountCredits(accountSubject));

        GrantReference grant = grants.get(0);
        jdbc.update("UPDATE credit_grants SET credits_remaining = credits_remaining - 1 WHERE id = ?", grant.grantId());
        jdbc.update("UPDATE licenses SET credits = credits - 1 WHERE id = ? AND credits > 0", grant.licenseId());
        jdbc.update("""
            INSERT INTO report_consumptions (id, license_id, account_subject, request_id, credit_grant_id)
            VALUES (?, ?, ?, ?, ?)
            """, UUID.randomUUID(), grant.licenseId(), accountSubject, requestId, grant.grantId());
        return new Consumption(true, accountCredits(accountSubject));
        }

    private UUID licenseId(String credentialHash) {
        return jdbc.queryForObject(
                "SELECT id FROM licenses WHERE credential_hash = ?", UUID.class, credentialHash);
    }

    private void ensureAccount(String accountSubject) {
        jdbc.update("""
                INSERT INTO license_accounts (account_subject)
                VALUES (?) ON CONFLICT (account_subject) DO NOTHING
                """, accountSubject);
    }

    private void lockAccount(String accountSubject) {
        jdbc.queryForObject("SELECT account_subject FROM license_accounts WHERE account_subject = ? FOR UPDATE",
                String.class, accountSubject);
    }

    private void lockLicense(UUID licenseId) {
        jdbc.queryForObject("SELECT id FROM licenses WHERE id = ? FOR UPDATE", UUID.class, licenseId);
    }

    private int balance(UUID licenseId) {
        return jdbc.queryForObject("SELECT credits FROM licenses WHERE id = ?", Integer.class, licenseId);
    }

    private record GrantReference(UUID grantId, UUID licenseId) {
    }
}
