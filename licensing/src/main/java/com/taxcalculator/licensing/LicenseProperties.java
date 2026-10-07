package com.taxcalculator.licensing;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "license")
public record LicenseProperties(
		boolean testMode,
		String testCode,
		int testCredits,
		String lemonSqueezyApiKey,
		String lemonSqueezyStoreId,
		String lemonSqueezyVariantId,
		String lemonSqueezyWebhookSecret,
		boolean paymentTestMode,
		String appUrl,
		String cognitoIssuerUri,
		String cognitoAppClientId,
		boolean allowAnonymousCheckout,
		boolean requireAccountAuth,
        String lemonSqueezyVariantTwoId,
        String lemonSqueezyVariantThreeId) {

    @org.springframework.boot.context.properties.bind.ConstructorBinding
    public LicenseProperties {
        var variants = java.util.stream.Stream.of(lemonSqueezyVariantId, lemonSqueezyVariantTwoId, lemonSqueezyVariantThreeId)
                .filter(v -> v != null && !v.isBlank()).toList();
        if (variants.stream().distinct().count() != variants.size())
            throw new IllegalArgumentException("Each report package must use a distinct payment variant.");
    }

    public LicenseProperties(boolean testMode, String testCode, int testCredits, String apiKey,
            String storeId, String variantId, String webhookSecret, boolean paymentTestMode,
            String appUrl, String issuer, String clientId, boolean anonymous, boolean required) {
        this(testMode, testCode, testCredits, apiKey, storeId, variantId, webhookSecret,
                paymentTestMode, appUrl, issuer, clientId, anonymous, required, "", "");
    }

    public String variantFor(int reports) {
        String value = switch (reports) {
            case 1 -> lemonSqueezyVariantId;
            case 2 -> lemonSqueezyVariantTwoId;
            case 3 -> lemonSqueezyVariantThreeId;
            default -> null;
        };
        if (value == null || !value.matches("[1-9][0-9]*"))
            throw new LicenseException(org.springframework.http.HttpStatus.BAD_REQUEST, "This report package is not available.");
        return value;
    }

    public int creditsForVariant(String variant) {
        if (variant.equals(lemonSqueezyVariantId)) return 1;
        if (variant.equals(lemonSqueezyVariantTwoId)) return 2;
        if (variant.equals(lemonSqueezyVariantThreeId)) return 3;
        return 0;
    }

    public java.util.List<Integer> packages() {
        return java.util.stream.IntStream.rangeClosed(1, 3).filter(count -> {
            try { variantFor(count); return true; } catch (LicenseException ex) { return false; }
        }).boxed().toList();
    }

	public boolean accountModeEnabled() {
		return cognitoIssuerUri != null && !cognitoIssuerUri.isBlank()
				&& cognitoAppClientId != null && !cognitoAppClientId.isBlank();
	}

	public boolean checkoutEnabled() {
		return lemonSqueezyApiKey != null && !lemonSqueezyApiKey.isBlank()
				&& lemonSqueezyStoreId != null && !lemonSqueezyStoreId.isBlank()
				&& lemonSqueezyVariantId != null && !lemonSqueezyVariantId.isBlank()
				&& lemonSqueezyWebhookSecret != null && !lemonSqueezyWebhookSecret.isBlank()
				&& appUrl != null && !appUrl.isBlank();
	}

	public boolean checkoutAvailable() {
		return checkoutEnabled() && (accountModeEnabled() || (testMode && paymentTestMode && allowAnonymousCheckout));
	}
}
