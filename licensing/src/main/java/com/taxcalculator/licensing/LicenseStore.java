package com.taxcalculator.licensing;

import java.util.UUID;

public interface LicenseStore {
    default void checkReady() {}
    int grantTestCredits(String credentialHash, String codeHash, int credits);

    int grantTestCredits(UUID licenseId, String codeHash, int credits);

    int credits(String credentialHash);

    int accountCredits(String accountSubject);

    Consumption consume(String credentialHash, String requestId);

    Consumption consumeAccount(String accountSubject, String requestId);

    UUID getOrCreateLicenseId(String credentialHash);

    UUID getOrCreateAccountLicenseId(String accountSubject);

    LinkResult linkLegacyLicense(String accountSubject, String credentialHash);

    void grantPurchasedCredit(UUID licenseId, String providerEventId, String checkoutSessionId, String providerPaymentId);

    default void grantPurchasedCredits(UUID licenseId, String eventId, String sessionId, String paymentId, int credits) {
        if (credits != 1) throw new IllegalArgumentException("Store does not support bundles");
        grantPurchasedCredit(licenseId, eventId, sessionId, paymentId);
    }

    boolean refundPurchasedCredit(String providerPaymentId, String refundEventId);

    record Consumption(boolean consumed, int credits) {
    }

    enum LinkResult {
        LINKED,
        ALREADY_LINKED,
        NOT_FOUND,
        ALREADY_CLAIMED
    }
}
