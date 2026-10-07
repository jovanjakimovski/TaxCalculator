package com.taxcalculator.licensing;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.HexFormat;
import java.util.UUID;
import java.util.regex.Pattern;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;

@Service
public class LicenseService {
    private static final Pattern REQUEST_ID = Pattern.compile("[A-Za-z0-9._:-]{1,80}");
    private final LicenseStore store;
    private final LicenseProperties properties;

    public LicenseService(LicenseStore store, LicenseProperties properties) {
        this.store = store;
        this.properties = properties;
        if (properties.requireAccountAuth() && !properties.accountModeEnabled()) {
            throw new IllegalStateException("Cognito issuer and app client ID are required for this deployment.");
        }
    }

    public void checkReady() { store.checkReady(); }

    public Entitlement entitlement(String credential) {
        String credentialHash = hashCredential(credential);
        return entitlement(store.credits(credentialHash), false);
    }

    public Entitlement accountEntitlement(String accountSubject) {
        requireAccountMode();
        requireAccountSubject(accountSubject);
        return entitlement(store.accountCredits(accountSubject), true);
    }

    public Entitlement redeemTestCode(String credential, String code) {
        if (!testCodeEnabled()) {
            throw new LicenseException(HttpStatus.NOT_FOUND, "Test-code access is disabled.");
        }
        if (code == null || code.isBlank() || !matchesConfiguredCode(code.trim())) {
            throw new LicenseException(HttpStatus.FORBIDDEN, "The access code is not valid.");
        }
        int credits = store.grantTestCredits(
                hashCredential(credential), sha256(properties.testCode().trim()), properties.testCredits());
        return entitlement(credits, false);
        }

        public Entitlement redeemTestCodeForAccount(String accountSubject, String code) {
        requireAccountMode();
        requireAccountSubject(accountSubject);
        validateTestCode(code);
        UUID licenseId = store.getOrCreateAccountLicenseId(accountSubject);
        int credits = store.grantTestCredits(licenseId, sha256(properties.testCode().trim()), properties.testCredits());
        return accountEntitlement(accountSubject);
    }

    public Entitlement consumeReport(String credential, String requestId) {
        if (requestId == null || !REQUEST_ID.matcher(requestId).matches()) {
            throw new IllegalArgumentException("A valid request ID is required.");
        }
        LicenseStore.Consumption consumption = store.consume(hashCredential(credential), requestId);
        if (!consumption.consumed()) {
            throw new LicenseException(HttpStatus.PAYMENT_REQUIRED, "No report credits are available.");
        }
        return entitlement(consumption.credits(), false);
    }

    public Entitlement consumeReportForAccount(String accountSubject, String requestId) {
        requireAccountMode();
        requireAccountSubject(accountSubject);
        validateRequestId(requestId);
        LicenseStore.Consumption consumption = store.consumeAccount(accountSubject, requestId);
        if (!consumption.consumed()) {
            throw new LicenseException(HttpStatus.PAYMENT_REQUIRED, "No report credits are available.");
        }
        return entitlement(consumption.credits(), true);
    }

    public UUID getOrCreateLicenseId(String credential) {
        return store.getOrCreateLicenseId(hashCredential(credential));
    }

    public UUID getOrCreateAccountLicenseId(String accountSubject) {
        requireAccountMode();
        requireAccountSubject(accountSubject);
        return store.getOrCreateAccountLicenseId(accountSubject);
    }

    public Entitlement linkLegacyLicense(String accountSubject, String credential) {
        requireAccountMode();
        requireAccountSubject(accountSubject);
        LicenseStore.LinkResult result = store.linkLegacyLicense(accountSubject, hashCredential(credential));
        if (result == LicenseStore.LinkResult.NOT_FOUND) {
            throw new LicenseException(HttpStatus.NOT_FOUND, "The legacy license key was not found.");
        }
        if (result == LicenseStore.LinkResult.ALREADY_CLAIMED) {
            throw new LicenseException(HttpStatus.CONFLICT, "That license key is already linked to an account.");
        }
        return accountEntitlement(accountSubject);
    }

    private Entitlement entitlement(int credits, boolean accountMode) {
        return new Entitlement(credits, testCodeEnabled(), properties.checkoutAvailable(), accountMode);
    }

    private boolean testCodeEnabled() {
        return properties.testMode() && properties.testCode() != null
                && !properties.testCode().isBlank() && properties.testCredits() > 0;
    }

    private boolean matchesConfiguredCode(String submittedCode) {
        return MessageDigest.isEqual(
                HexFormat.of().parseHex(sha256(submittedCode)),
                HexFormat.of().parseHex(sha256(properties.testCode().trim())));
    }

    private void validateTestCode(String code) {
        if (!testCodeEnabled()) {
            throw new LicenseException(HttpStatus.NOT_FOUND, "Test-code access is disabled.");
        }
        if (code == null || code.isBlank() || !matchesConfiguredCode(code.trim())) {
            throw new LicenseException(HttpStatus.FORBIDDEN, "The access code is not valid.");
        }
    }

    private static void validateRequestId(String requestId) {
        if (requestId == null || !REQUEST_ID.matcher(requestId).matches()) {
            throw new IllegalArgumentException("A valid request ID is required.");
        }
    }

    private void requireAccountMode() {
        if (!properties.accountModeEnabled()) {
            throw new LicenseException(HttpStatus.NOT_FOUND, "Account access is not configured.");
        }
    }

    private static void requireAccountSubject(String accountSubject) {
        if (accountSubject == null || accountSubject.isBlank() || accountSubject.length() > 512) {
            throw new LicenseException(HttpStatus.UNAUTHORIZED, "A valid signed-in account is required.");
        }
    }

    private static String hashCredential(String credential) {
        if (credential == null || credential.length() < 32 || credential.length() > 256) {
            throw new LicenseException(HttpStatus.UNAUTHORIZED, "A valid license credential is required.");
        }
        return sha256(credential);
    }

    private static String sha256(String value) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256")
                    .digest(value.getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException("SHA-256 is unavailable.", e);
        }
    }

    public record Entitlement(int credits, boolean testCodeEnabled, boolean checkoutEnabled, boolean accountMode) {
    }
}
