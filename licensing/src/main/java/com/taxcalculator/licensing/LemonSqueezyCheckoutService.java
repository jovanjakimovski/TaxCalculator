package com.taxcalculator.licensing;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.security.MessageDigest;
import java.util.HexFormat;
import java.util.UUID;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.beans.factory.annotation.Autowired;

@Service
public class LemonSqueezyCheckoutService {
    private final LicenseProperties properties;
    private final LicenseStore store;
    private final ObjectMapper objectMapper;
    private final HttpClient http;

    @Autowired
    public LemonSqueezyCheckoutService(
            LicenseProperties properties, LicenseStore store, ObjectMapper objectMapper, HttpClient http) {
        this.properties = properties;
        this.store = store;
        this.objectMapper = objectMapper;
        this.http = http;
    }

    public String createCheckout(UUID licenseId) {
        return createCheckout(licenseId, 1);
    }

    public String createCheckout(UUID licenseId, int reports) {
        properties.variantFor(reports);
        if (!properties.checkoutAvailable()) {
            throw new LicenseException(HttpStatus.SERVICE_UNAVAILABLE, "Online checkout is not configured.");
        }
        try {
            HttpRequest request = HttpRequest.newBuilder(URI.create("https://api.lemonsqueezy.com/v1/checkouts"))
                    .timeout(java.time.Duration.ofSeconds(20))
                    .header("Accept", "application/vnd.api+json")
                    .header("Content-Type", "application/vnd.api+json")
                    .header("Authorization", "Bearer " + properties.lemonSqueezyApiKey())
                .POST(HttpRequest.BodyPublishers.ofString(checkoutPayload(licenseId, reports)))
                    .build();
            HttpResponse<String> response = http.send(request, HttpResponse.BodyHandlers.ofString());
            if (response.statusCode() < 200 || response.statusCode() >= 300) {
                throw new LicenseException(HttpStatus.BAD_GATEWAY, "Hosted checkout is temporarily unavailable.");
            }
            String checkoutUrl = objectMapper.readTree(response.body())
                    .path("data").path("attributes").path("url").asText("");
            URI parsedUrl = URI.create(checkoutUrl);
            if (!"https".equalsIgnoreCase(parsedUrl.getScheme()) || parsedUrl.getHost() == null
                    || !parsedUrl.getHost().endsWith(".lemonsqueezy.com") || parsedUrl.getUserInfo() != null) {
                throw new LicenseException(HttpStatus.BAD_GATEWAY, "Hosted checkout returned an invalid URL.");
            }
            return checkoutUrl;
        } catch (LicenseException exception) {
            throw exception;
        } catch (InterruptedException exception) {
            Thread.currentThread().interrupt();
            throw new LicenseException(HttpStatus.BAD_GATEWAY, "Hosted checkout was interrupted.");
        } catch (IOException | IllegalArgumentException exception) {
            throw new LicenseException(HttpStatus.BAD_GATEWAY, "Hosted checkout is temporarily unavailable.");
        }
    }

        String checkoutPayload(UUID licenseId) throws IOException {
            return checkoutPayload(licenseId, 1);
        }

        String checkoutPayload(UUID licenseId, int reports) throws IOException {
        String variant = properties.variantFor(reports);
        ObjectNode payload = objectMapper.createObjectNode();
        ObjectNode data = payload.putObject("data");
        data.put("type", "checkouts");
        ObjectNode attributes = data.putObject("attributes");
        attributes.put("test_mode", properties.paymentTestMode());
        ObjectNode productOptions = attributes.putObject("product_options");
        productOptions.put("redirect_url", properties.appUrl().replaceAll("/+$", "") + "/?payment=success");
        productOptions.putArray("enabled_variants").add(Long.parseLong(variant));
        attributes.putObject("checkout_options").put("embed", false);
        ObjectNode checkoutData = attributes.putObject("checkout_data");
        checkoutData.putObject("custom").put("license_id", licenseId.toString());
        checkoutData.putArray("variant_quantities").addObject()
            .put("variant_id", Long.parseLong(variant))
            .put("quantity", 1);
        ObjectNode relationships = data.putObject("relationships");
        relationships.putObject("store").putObject("data")
            .put("type", "stores").put("id", properties.lemonSqueezyStoreId());
        relationships.putObject("variant").putObject("data")
            .put("type", "variants").put("id", variant);
        return objectMapper.writeValueAsString(payload);
        }

    public void handleWebhook(byte[] payload, String signature) {
        if (properties.lemonSqueezyWebhookSecret() == null || properties.lemonSqueezyWebhookSecret().isBlank()) {
            throw new LicenseException(HttpStatus.SERVICE_UNAVAILABLE, "Payment notifications are not configured.");
        }
        verifySignature(payload, signature);

        JsonNode root;
        try {
            root = objectMapper.readTree(payload);
        } catch (IOException exception) {
            throw new LicenseException(HttpStatus.BAD_REQUEST, "Payment notification is malformed.");
        }
        String eventName = root.path("meta").path("event_name").asText("");
        if (!"order_created".equals(eventName) && !"order_refunded".equals(eventName)) return;

        JsonNode order = root.path("data");
        JsonNode attributes = order.path("attributes");
        int credits = properties.creditsForVariant(attributes.path("first_order_item").path("variant_id").asText());
        if (!"orders".equals(order.path("type").asText())
                || !properties.lemonSqueezyStoreId().equals(attributes.path("store_id").asText())
                || credits == 0
                || attributes.path("test_mode").asBoolean() != properties.paymentTestMode()) {
            return;
        }

        String orderId = order.path("id").asText("");
        if (orderId.isBlank()) {
            throw new LicenseException(HttpStatus.BAD_REQUEST, "Payment notification is missing its order ID.");
        }
        String providerPaymentId = "lemonsqueezy-order:" + orderId;
        if ("order_refunded".equals(eventName)) {
            if (!attributes.path("refunded").asBoolean(false)) return;
            if (!store.refundPurchasedCredit(providerPaymentId, "lemonsqueezy:order_refunded:" + orderId)) {
                throw new LicenseException(HttpStatus.SERVICE_UNAVAILABLE,
                        "The payment record is not available yet; retry the refund notification.");
            }
            return;
        }

        if (!"paid".equals(attributes.path("status").asText())) return;
        String licenseIdValue = root.path("meta").path("custom_data").path("license_id").asText("");
        try {
            UUID licenseId = UUID.fromString(licenseIdValue);
            if (credits == 1) store.grantPurchasedCredit(licenseId,
                    "lemonsqueezy:order_created:" + orderId, providerPaymentId, providerPaymentId);
            else store.grantPurchasedCredits(licenseId,
                    "lemonsqueezy:order_created:" + orderId, providerPaymentId, providerPaymentId, credits);
        } catch (IllegalArgumentException exception) {
            throw new LicenseException(HttpStatus.BAD_REQUEST, "Payment notification is missing valid checkout data.");
        }
    }

    private void verifySignature(byte[] payload, String signature) {
        if (signature == null || !signature.matches("[a-fA-F0-9]{64}")) {
            throw new LicenseException(HttpStatus.BAD_REQUEST, "Payment notification signature is invalid.");
        }
        try {
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(
                    properties.lemonSqueezyWebhookSecret().getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
            byte[] expected = mac.doFinal(payload);
            byte[] received = HexFormat.of().parseHex(signature);
            if (!MessageDigest.isEqual(expected, received)) {
                throw new LicenseException(HttpStatus.BAD_REQUEST, "Payment notification signature is invalid.");
            }
        } catch (GeneralSecurityException exception) {
            throw new IllegalStateException("HMAC-SHA256 is unavailable.", exception);
        }
    }
}
