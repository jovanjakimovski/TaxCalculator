package com.taxcalculator.licensing;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.HashMap;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;

class LicenseServiceTest {
    private static final String CREDENTIAL = "a".repeat(43);

    @Test
    void testCodeGrantsCreditsOncePerLicense() {
        LicenseService service = service(new InMemoryLicenseStore());

        assertEquals(3, service.redeemTestCode(CREDENTIAL, "LOCAL-TEST-CODE").credits());
        assertEquals(3, service.redeemTestCode(CREDENTIAL, "LOCAL-TEST-CODE").credits());
    }

    @Test
    void rejectsTestCodesWhenTestModeIsDisabled() {
        LicenseService service = new LicenseService(
            new InMemoryLicenseStore(), properties(false, "LOCAL-TEST-CODE", 3));

        LicenseException exception = assertThrows(
                LicenseException.class, () -> service.redeemTestCode(CREDENTIAL, "LOCAL-TEST-CODE"));
        assertEquals(HttpStatus.NOT_FOUND, exception.status());
    }

    @Test
    void consumesOneCreditAndMakesRetriesIdempotent() {
        LicenseService service = service(new InMemoryLicenseStore());
        service.redeemTestCode(CREDENTIAL, "LOCAL-TEST-CODE");

        assertEquals(2, service.consumeReport(CREDENTIAL, "report-1").credits());
        assertEquals(2, service.consumeReport(CREDENTIAL, "report-1").credits());
        assertEquals(1, service.consumeReport(CREDENTIAL, "report-2").credits());
    }

    @Test
    void refusesConsumptionWithoutCredits() {
        LicenseService service = new LicenseService(
            new InMemoryLicenseStore(), properties(true, "LOCAL-TEST-CODE", 1));
        service.redeemTestCode(CREDENTIAL, "LOCAL-TEST-CODE");
        service.consumeReport(CREDENTIAL, "report-1");

        LicenseException exception = assertThrows(
                LicenseException.class, () -> service.consumeReport(CREDENTIAL, "report-2"));
        assertEquals(HttpStatus.PAYMENT_REQUIRED, exception.status());
    }

    @Test
    void checkoutIsDisabledUntilTheWebhookSecretIsConfigured() {
        LicenseProperties missingWebhookSecret = new LicenseProperties(
            false, "", 3, "ls_test_key", "123", "456", "", true,
                "https://tax.example.test", "", "", false, false);
        LicenseProperties completeCheckout = new LicenseProperties(
            false, "", 3, "ls_test_key", "123", "456", "whsec_example", true,
                "https://tax.example.test", "", "", false, false);

        assertFalse(missingWebhookSecret.checkoutEnabled());
        assertTrue(completeCheckout.checkoutEnabled());
    }

    @Test
    void anonymousCheckoutCanOnlyBeEnabledInTestMode() {
        LicenseProperties testCheckout = new LicenseProperties(
            true, "LOCAL-TEST-CODE", 3, "ls_test_key", "123", "456", "whsec_example", true,
            "http://localhost:8080", "", "", true, false);
        LicenseProperties productionWithoutAccounts = new LicenseProperties(
            false, "", 3, "ls_live_key", "123", "456", "whsec_example", false,
            "https://tax.example.test", "", "", true, false);

        assertTrue(testCheckout.checkoutAvailable());
        assertFalse(productionWithoutAccounts.checkoutAvailable());
    }

    @Test
    void hostedAccountModeFailsClosedWithoutCognitoConfiguration() {
        LicenseProperties incompleteHostedConfig = new LicenseProperties(
                false, "", 3, "", "", "", "", false,
                "https://tax.example.test", "", "", false, true);

        assertThrows(IllegalStateException.class,
                () -> new LicenseService(new InMemoryLicenseStore(), incompleteHostedConfig));
    }

    @Test
    void rejectsWebhookRequestsWithInvalidSignatures() {
        LicenseProperties configured = new LicenseProperties(
            false, "", 3, "ls_test_key", "123", "456", "whsec_test", true,
            "http://localhost:8080", "", "", false, false);
        LemonSqueezyCheckoutService checkoutService = new LemonSqueezyCheckoutService(
                configured, new InMemoryLicenseStore(), new ObjectMapper(), java.net.http.HttpClient.newHttpClient());

        LicenseException exception = assertThrows(
                LicenseException.class, () -> checkoutService.handleWebhook(
                        "{}".getBytes(java.nio.charset.StandardCharsets.UTF_8), "invalid"));
        assertEquals(HttpStatus.BAD_REQUEST, exception.status());
    }

    @Test
    void refundRevokesOnlyUnusedCreditFromItsPurchaseAndIsIdempotent() {
        InMemoryLicenseStore store = new InMemoryLicenseStore();
        LicenseService service = service(store);
        service.redeemTestCode(CREDENTIAL, "LOCAL-TEST-CODE");
        UUID licenseId = service.getOrCreateLicenseId(CREDENTIAL);
        store.grantPurchasedCredit(licenseId, "evt_paid", "ls-order-paid", "ls-order-paid");

        assertEquals(4, service.entitlement(CREDENTIAL).credits());
        assertEquals(true, store.refundPurchasedCredit("ls-order-paid", "evt_refund"));
        assertEquals(3, service.entitlement(CREDENTIAL).credits());
        assertEquals(true, store.refundPurchasedCredit("ls-order-paid", "evt_refund"));
        assertEquals(3, service.entitlement(CREDENTIAL).credits());
    }

    @Test
    void refundDoesNotRestoreAConsumedCredit() {
        InMemoryLicenseStore store = new InMemoryLicenseStore();
        LicenseService service = service(store);
        UUID licenseId = service.getOrCreateLicenseId(CREDENTIAL);
        store.grantPurchasedCredit(licenseId, "evt_paid", "ls-order-paid", "ls-order-paid");
        service.consumeReport(CREDENTIAL, "report-1");

        assertEquals(true, store.refundPurchasedCredit("ls-order-paid", "evt_refund"));
        assertEquals(0, service.entitlement(CREDENTIAL).credits());
    }

    @Test
    void legacyLicenseTransfersItsBalanceToTheSignedInAccountOnce() {
        InMemoryLicenseStore store = new InMemoryLicenseStore();
        LicenseProperties accountProperties = new LicenseProperties(
            true, "LOCAL-TEST-CODE", 3, "", "", "", "", true, "http://localhost:8080",
                "https://cognito-idp.us-east-1.amazonaws.com/us-east-1_example", "client-example", false, true);
        service(store).redeemTestCode(CREDENTIAL, "LOCAL-TEST-CODE");
        LicenseService service = new LicenseService(store, accountProperties);

        LicenseService.Entitlement linked = service.linkLegacyLicense("issuer|cognito-subject", CREDENTIAL);
        assertEquals(3, linked.credits());
        assertTrue(linked.accountMode());
        assertEquals(3, service.accountEntitlement("issuer|cognito-subject").credits());
        assertEquals(0, service.entitlement(CREDENTIAL).credits());
        assertEquals(3, service.linkLegacyLicense("issuer|cognito-subject", CREDENTIAL).credits());
    }

    @Test
    void accountCreditsAreSharedAcrossAccountOwnedLicenseRows() {
        InMemoryLicenseStore store = new InMemoryLicenseStore();
        UUID firstLicense = store.getOrCreateAccountLicenseId("issuer|account");
        UUID secondLicense = UUID.randomUUID();
        store.attachAccount(secondLicense, "issuer|account");
        store.grantTestCredits(firstLicense, "first-code", 2);
        store.grantTestCredits(secondLicense, "second-code", 3);

        assertEquals(5, store.accountCredits("issuer|account"));
        assertEquals(4, store.consumeAccount("issuer|account", "request-1").credits());
        assertEquals(4, store.consumeAccount("issuer|account", "request-1").credits());
    }

    @Test void accountTestCodeResponseIncludesPreviouslyLinkedCredits() {
        InMemoryLicenseStore store = new InMemoryLicenseStore();
        var properties = new LicenseProperties(true, "LOCAL-TEST-CODE", 3, "", "", "", "", true,
                "http://localhost:8080", "issuer", "client", false, false);
        var service = new LicenseService(store, properties);
        service.redeemTestCode(CREDENTIAL, "LOCAL-TEST-CODE");
        service.linkLegacyLicense("issuer|account", CREDENTIAL);
        assertEquals(6, service.redeemTestCodeForAccount("issuer|account", "LOCAL-TEST-CODE").credits());
        assertEquals(6, service.redeemTestCodeForAccount("issuer|account", "LOCAL-TEST-CODE").credits());
    }

    private static LicenseService service(InMemoryLicenseStore store) {
        return new LicenseService(store, properties(true, "LOCAL-TEST-CODE", 3));
    }

    private static LicenseProperties properties(boolean testMode, String testCode, int credits) {
        return new LicenseProperties(testMode, testCode, credits, "", "", "", "", true,
            "http://localhost:8080", "", "", false, false);
    }

    private static final class InMemoryLicenseStore implements LicenseStore {
        private final Map<String, Integer> balances = new HashMap<>();
        private final Map<String, Integer> accountBalances = new HashMap<>();
        private final Set<String> grants = new HashSet<>();
        private final Set<String> consumedRequests = new HashSet<>();
        private final Map<String, CreditLot> creditLots = new LinkedHashMap<>();
        private final Map<UUID, String> credentialsByLicense = new HashMap<>();
        private final Map<String, UUID> licenseIdsByCredentialHash = new HashMap<>();
        private final Map<String, UUID> accountLicenseIds = new HashMap<>();
        private final Map<UUID, String> accountSubjectsByLicense = new HashMap<>();
        private final Map<String, String> legacyLinks = new HashMap<>();
        private final Map<String, PaymentLot> paymentLots = new HashMap<>();
        private final Set<String> refundEvents = new HashSet<>();

        @Override
        public int grantTestCredits(String credentialHash, String codeHash, int credits) {
            UUID licenseId = UUID.nameUUIDFromBytes(credentialHash.getBytes(java.nio.charset.StandardCharsets.UTF_8));
            credentialsByLicense.put(licenseId, credentialHash);
            licenseIdsByCredentialHash.put(credentialHash, licenseId);
            if (grants.add(codeHash + ":" + credentialHash)) {
                balances.merge(credentialHash, credits, Integer::sum);
                creditLots.put("test:" + credentialHash + ":" + codeHash,
                    new CreditLot(credentialHash, credits, null));
            }
            return balances.getOrDefault(credentialHash, 0);
        }

        @Override
        public int credits(String credentialHash) {
            return balances.getOrDefault(credentialHash, 0);
        }

        @Override
        public int accountCredits(String accountSubject) {
            return accountBalances.getOrDefault(accountSubject, 0);
        }

        @Override
        public Consumption consume(String credentialHash, String requestId) {
            String key = credentialHash + ":" + requestId;
            if (consumedRequests.contains(key)) {
                return new Consumption(true, credits(credentialHash));
            }
            int available = credits(credentialHash);
            if (available == 0) {
                return new Consumption(false, 0);
            }
            CreditLot lot = creditLots.values().stream()
                    .filter(candidate -> candidate.ownerKey.equals(credentialHash) && candidate.remaining > 0)
                    .findFirst().orElseThrow();
            lot.remaining--;
            consumedRequests.add(key);
            balances.put(credentialHash, available - 1);
            return new Consumption(true, available - 1);
        }

        @Override
        public UUID getOrCreateLicenseId(String credentialHash) {
            UUID licenseId = UUID.nameUUIDFromBytes(credentialHash.getBytes(java.nio.charset.StandardCharsets.UTF_8));
            credentialsByLicense.put(licenseId, credentialHash);
            licenseIdsByCredentialHash.put(credentialHash, licenseId);
            return licenseId;
        }

        @Override
        public int grantTestCredits(UUID licenseId, String codeHash, int credits) {
            String subject = accountSubjectsByLicense.get(licenseId);
            if (subject == null) subject = "account-for:" + licenseId;
            accountSubjectsByLicense.put(licenseId, subject);
            String grantKey = "test:" + licenseId + ":" + codeHash;
            if (grants.add(grantKey)) {
                accountBalances.merge(subject, credits, Integer::sum);
                creditLots.put(grantKey, new CreditLot(grantKey, credits, subject));
            }
            return accountCredits(subject);
        }

        @Override
        public UUID getOrCreateAccountLicenseId(String accountSubject) {
            UUID licenseId = accountLicenseIds.computeIfAbsent(accountSubject,
                    subject -> UUID.nameUUIDFromBytes(subject.getBytes(java.nio.charset.StandardCharsets.UTF_8)));
            accountSubjectsByLicense.put(licenseId, accountSubject);
            return licenseId;
        }

        @Override
        public LinkResult linkLegacyLicense(String accountSubject, String credentialHash) {
            String linkedSubject = legacyLinks.get(credentialHash);
            if (linkedSubject != null) {
                return linkedSubject.equals(accountSubject) ? LinkResult.ALREADY_LINKED : LinkResult.ALREADY_CLAIMED;
            }
            UUID licenseId = licenseIdsByCredentialHash.get(credentialHash);
            if (licenseId == null) return LinkResult.NOT_FOUND;
            accountSubjectsByLicense.put(licenseId, accountSubject);
            accountLicenseIds.putIfAbsent(accountSubject, UUID.randomUUID());
            int transferredCredits = balances.getOrDefault(credentialHash, 0);
            balances.remove(credentialHash);
            accountBalances.merge(accountSubject, transferredCredits, Integer::sum);
            creditLots.values().stream()
                    .filter(lot -> lot.ownerKey.equals(credentialHash))
                    .forEach(lot -> lot.accountSubject = accountSubject);
            legacyLinks.put(credentialHash, accountSubject);
            return LinkResult.LINKED;
        }

        void attachAccount(UUID licenseId, String accountSubject) {
            accountSubjectsByLicense.put(licenseId, accountSubject);
        }

        @Override
        public void grantPurchasedCredit(
                UUID licenseId, String providerEventId, String checkoutSessionId, String providerPaymentId) {
            String credentialHash = credentialsByLicense.get(licenseId);
            String accountSubject = accountSubjectsByLicense.get(licenseId);
            String ownerKey = accountSubject == null ? credentialHash : "account:" + licenseId;
            paymentLots.putIfAbsent(providerPaymentId, new PaymentLot(ownerKey, accountSubject, checkoutSessionId));
            if (grants.add("lemonsqueezy:" + providerPaymentId)) {
                if (accountSubject == null) balances.merge(ownerKey, 1, Integer::sum);
                else accountBalances.merge(accountSubject, 1, Integer::sum);
                creditLots.put("lemonsqueezy:" + checkoutSessionId, new CreditLot(ownerKey, 1, accountSubject));
            }
        }

        @Override
        public boolean refundPurchasedCredit(String providerPaymentId, String refundEventId) {
            PaymentLot payment = paymentLots.get(providerPaymentId);
            if (payment == null) return false;
            CreditLot lot = creditLots.get("lemonsqueezy:" + payment.checkoutSessionId);
            if (refundEvents.add(refundEventId) && lot.remaining > 0) {
                lot.remaining = 0;
                if (payment.accountSubject == null) balances.compute(payment.ownerKey, (key, balance) -> balance - 1);
                else accountBalances.compute(payment.accountSubject, (key, balance) -> balance - 1);
            }
            return true;
        }

        @Override
        public Consumption consumeAccount(String accountSubject, String requestId) {
            String key = accountSubject + ":" + requestId;
            if (consumedRequests.contains(key)) return new Consumption(true, accountCredits(accountSubject));
            int available = accountCredits(accountSubject);
            if (available == 0) return new Consumption(false, 0);
            CreditLot lot = creditLots.values().stream()
                    .filter(candidate -> accountSubject.equals(candidate.accountSubject) && candidate.remaining > 0)
                    .findFirst().orElseThrow();
            lot.remaining--;
            consumedRequests.add(key);
            accountBalances.put(accountSubject, available - 1);
            return new Consumption(true, available - 1);
        }

        private static final class CreditLot {
            private final String ownerKey;
            private int remaining;
            private String accountSubject;

            private CreditLot(String ownerKey, int credits, String accountSubject) {
                this.ownerKey = ownerKey;
                this.remaining = credits;
                this.accountSubject = accountSubject;
            }
        }

        private record PaymentLot(String ownerKey, String accountSubject, String checkoutSessionId) {
        }
    }
}
