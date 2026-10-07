package com.taxcalculator.licensing;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.nio.charset.StandardCharsets;
import java.util.UUID;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.http.HttpStatus;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.times;

class LemonSqueezyCheckoutServiceTest {
    private static final String SECRET = "lemon-webhook-secret";
    private static final String LICENSE_ID = "8ddf52a5-4d6b-4cac-b55e-26c809f72abd";
    private final LicenseStore store = mock(LicenseStore.class);
        private final HttpClient http = mock(HttpClient.class);
        private final LemonSqueezyCheckoutService service = new LemonSqueezyCheckoutService(
                        properties(), store, new ObjectMapper(), http);

        @Test
        void checkoutCreatesAHostedLemonSqueezyUrlUsingServerCredentials() throws Exception {
                @SuppressWarnings("unchecked")
                HttpResponse<String> response = mock(HttpResponse.class);
                when(response.statusCode()).thenReturn(201);
                when(response.body()).thenReturn("{\"data\":{\"attributes\":{\"url\":\"https://tax.lemonsqueezy.com/checkout/session\"}}}");
                when(http.send(any(HttpRequest.class),
                  org.mockito.ArgumentMatchers.<HttpResponse.BodyHandler<String>>any())).thenReturn(response);
                LemonSqueezyCheckoutService checkoutService = service;

                String url = checkoutService.createCheckout(UUID.fromString(LICENSE_ID));

                assertEquals("https://tax.lemonsqueezy.com/checkout/session", url);
                ArgumentCaptor<HttpRequest> request = ArgumentCaptor.forClass(HttpRequest.class);
                verify(http).send(request.capture(), any());
                assertEquals("POST", request.getValue().method());
                assertEquals("Bearer api-key", request.getValue().headers().firstValue("Authorization").orElseThrow());
                assertEquals("application/vnd.api+json", request.getValue().headers().firstValue("Content-Type").orElseThrow());
        }

              @Test
              void checkoutCustomDataContainsOnlyTheLicenseRowId() throws Exception {
                String payload = service.checkoutPayload(UUID.fromString(LICENSE_ID));
                var checkout = new ObjectMapper().readTree(payload);

                assertEquals(LICENSE_ID, checkout.path("data").path("attributes").path("checkout_data")
                    .path("custom").path("license_id").asText());
                assertEquals(1, checkout.path("data").path("attributes").path("checkout_data")
                    .path("variant_quantities").get(0).path("quantity").asInt());
                String serialized = checkout.toString().toLowerCase();
                assertFalse(serialized.contains("email"));
                assertFalse(serialized.contains("tax"));
                assertFalse(serialized.contains("csv"));
              }

    @Test
    void grantsOneCreditFromASignedPaidOrderWithoutCustomerOrTaxData() throws Exception {
        byte[] payload = orderPayload("order_created", "paid", false, true);

        service.handleWebhook(payload, signature(payload));

        verify(store).grantPurchasedCredit(
                UUID.fromString(LICENSE_ID),
                "lemonsqueezy:order_created:7001",
                "lemonsqueezy-order:7001",
                "lemonsqueezy-order:7001");
    }

    @Test
    void rejectsInvalidSignaturesBeforeReadingOrderData() {
        byte[] payload = orderPayload("order_created", "paid", false, true);

        LicenseException exception = assertThrows(
                LicenseException.class, () -> service.handleWebhook(payload, "0".repeat(64)));

        assertEquals(HttpStatus.BAD_REQUEST, exception.status());
        verify(store, never()).grantPurchasedCredit(
                org.mockito.ArgumentMatchers.any(), org.mockito.ArgumentMatchers.anyString(),
                org.mockito.ArgumentMatchers.anyString(), org.mockito.ArgumentMatchers.anyString());
    }

    @Test
    void ignoresOrdersForOtherVariantsAndUnpaidOrders() throws Exception {
        byte[] otherVariant = orderPayload("order_created", "paid", false, false);
        byte[] unpaid = orderPayload("order_created", "pending", false, true);

        service.handleWebhook(otherVariant, signature(otherVariant));
        service.handleWebhook(unpaid, signature(unpaid));

        verify(store, never()).grantPurchasedCredit(
                org.mockito.ArgumentMatchers.any(), org.mockito.ArgumentMatchers.anyString(),
                org.mockito.ArgumentMatchers.anyString(), org.mockito.ArgumentMatchers.anyString());
    }

    @Test
    void fullRefundRevokesThePurchasedCreditAndPartialRefundDoesNothing() throws Exception {
        when(store.refundPurchasedCredit(
                "lemonsqueezy-order:7001", "lemonsqueezy:order_refunded:7001")).thenReturn(true);
        byte[] fullRefund = orderPayload("order_refunded", "refunded", true, true);
        byte[] partialRefund = orderPayload("order_refunded", "partial_refund", false, true);

        service.handleWebhook(fullRefund, signature(fullRefund));
        service.handleWebhook(partialRefund, signature(partialRefund));

        verify(store, times(1)).refundPurchasedCredit(
                "lemonsqueezy-order:7001", "lemonsqueezy:order_refunded:7001");
    }

    private static LicenseProperties properties() {
        return new LicenseProperties(true, "LOCAL-TEST-CODE", 3,
                                "api-key", "123", "456", SECRET, true,
                                "http://localhost:8080", "", "", true, false);
    }

    @Test void signedBundleUsesServerVariantMappingNotBrowserCreditCount() throws Exception {
        LicenseProperties bundles = new LicenseProperties(true, "LOCAL-TEST-CODE", 3,
                "api-key", "123", "456", SECRET, true, "http://localhost:8080", "", "", true, false, "457", "458");
        var bundleService = new LemonSqueezyCheckoutService(bundles, store, new ObjectMapper(), http);
        byte[] payload = new String(orderPayload("order_created", "paid", false, true), StandardCharsets.UTF_8)
                .replace("\"456\"", "\"458\"").replace("\"license_id\":", "\"credits\": 999, \"license_id\":").getBytes(StandardCharsets.UTF_8);
        bundleService.handleWebhook(payload, signature(payload));
        verify(store).grantPurchasedCredits(UUID.fromString(LICENSE_ID), "lemonsqueezy:order_created:7001",
                "lemonsqueezy-order:7001", "lemonsqueezy-order:7001", 3);
        var checkout = new ObjectMapper().readTree(bundleService.checkoutPayload(UUID.fromString(LICENSE_ID), 2));
        assertEquals("457", checkout.path("data").path("relationships").path("variant").path("data").path("id").asText());
        assertEquals(1, checkout.path("data").path("attributes").path("checkout_data").path("variant_quantities").get(0).path("quantity").asInt());
        assertThrows(LicenseException.class, () -> bundleService.createCheckout(UUID.fromString(LICENSE_ID), 999));
    }

    @Test void rejectsUnexpectedCheckoutDestination() throws Exception {
        @SuppressWarnings("unchecked") HttpResponse<String> response = mock(HttpResponse.class);
        when(response.statusCode()).thenReturn(201);
        when(response.body()).thenReturn("{\"data\":{\"attributes\":{\"url\":\"https://evil.example/checkout\"}}}");
        when(http.send(any(HttpRequest.class), org.mockito.ArgumentMatchers.<HttpResponse.BodyHandler<String>>any())).thenReturn(response);
        assertThrows(LicenseException.class, () -> service.createCheckout(UUID.fromString(LICENSE_ID)));
    }

    private static byte[] orderPayload(String event, String status, boolean refunded, boolean expectedVariant) {
        String variantId = expectedVariant ? "456" : "999";
        String json = """
                {
                  "meta": {
                    "event_name": "%s",
                    "custom_data": { "license_id": "%s" }
                  },
                  "data": {
                    "type": "orders",
                    "id": "7001",
                    "attributes": {
                      "store_id": "123",
                      "status": "%s",
                      "refunded": %s,
                      "test_mode": true,
                      "first_order_item": { "variant_id": "%s" }
                    }
                  }
                }
                """.formatted(event, LICENSE_ID, status, refunded, variantId);
        return json.getBytes(StandardCharsets.UTF_8);
    }

    private static String signature(byte[] payload) throws Exception {
        Mac mac = Mac.getInstance("HmacSHA256");
        mac.init(new SecretKeySpec(SECRET.getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
        return java.util.HexFormat.of().formatHex(mac.doFinal(payload));
    }
}
