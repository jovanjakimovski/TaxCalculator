package com.taxcalculator.licensing;

import org.springframework.http.CacheControl;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import java.util.Map;
import java.util.UUID;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.core.annotation.AuthenticationPrincipal;

@RestController
@RequestMapping("/api/license")
public class LicenseController {
    private final LicenseService service;
    private final LemonSqueezyCheckoutService checkoutService;
    private final LicenseProperties properties;

    public LicenseController(LicenseService service, LemonSqueezyCheckoutService checkoutService, LicenseProperties properties) {
        this.service = service;
        this.checkoutService = checkoutService;
        this.properties = properties;
    }

    @GetMapping("/config")
    public ResponseEntity<Map<String, Object>> config() {
        return noStore(Map.of("accountMode", properties.accountModeEnabled(),
                "testCodeEnabled", properties.testMode() && properties.testCode() != null && !properties.testCode().isBlank(), "checkoutEnabled", properties.checkoutAvailable(),
                "packages", properties.checkoutAvailable() ? properties.packages() : java.util.List.of()));
    }

    @GetMapping("/entitlement")
    public ResponseEntity<LicenseService.Entitlement> entitlement(
            @AuthenticationPrincipal Jwt jwt,
            @RequestHeader(value = HttpHeaders.AUTHORIZATION, required = false) String authorization) {
        return noStore(jwt == null
                ? service.entitlement(bearerCredential(authorization))
                : service.accountEntitlement(accountSubject(jwt)));
    }

    @PostMapping("/test-code")
    public ResponseEntity<LicenseService.Entitlement> redeemTestCode(
            @AuthenticationPrincipal Jwt jwt,
            @RequestHeader(value = HttpHeaders.AUTHORIZATION, required = false) String authorization,
            @RequestBody TestCodeRequest request) {
        return noStore(jwt == null
                ? service.redeemTestCode(bearerCredential(authorization), request.code())
                : service.redeemTestCodeForAccount(accountSubject(jwt), request.code()));
    }

    @PostMapping("/reports/consume")
    public ResponseEntity<LicenseService.Entitlement> consumeReport(
            @AuthenticationPrincipal Jwt jwt,
            @RequestHeader(value = HttpHeaders.AUTHORIZATION, required = false) String authorization,
            @RequestBody ConsumeReportRequest request) {
        return noStore(jwt == null
                ? service.consumeReport(bearerCredential(authorization), request.requestId())
                : service.consumeReportForAccount(accountSubject(jwt), request.requestId()));
    }

    @PostMapping("/checkout")
    public ResponseEntity<CheckoutResponse> checkout(
            @AuthenticationPrincipal Jwt jwt,
            @RequestHeader(value = HttpHeaders.AUTHORIZATION, required = false) String authorization,
            @RequestBody(required = false) CheckoutRequest request) {
        UUID licenseId = jwt == null
                ? service.getOrCreateLicenseId(bearerCredential(authorization))
                : service.getOrCreateAccountLicenseId(accountSubject(jwt));
        int reports = request == null ? 1 : request.reports();
        String url = reports == 1 ? checkoutService.createCheckout(licenseId) : checkoutService.createCheckout(licenseId, reports);
        return noStore(new CheckoutResponse(url));
    }

    @PostMapping("/account/link-legacy-key")
    public ResponseEntity<LicenseService.Entitlement> linkLegacyKey(
            @AuthenticationPrincipal Jwt jwt,
            @RequestBody LinkLegacyKeyRequest request) {
        if (jwt == null) {
            throw new LicenseException(org.springframework.http.HttpStatus.UNAUTHORIZED,
                    "Sign in before linking a license key.");
        }
        return noStore(service.linkLegacyLicense(accountSubject(jwt), request.licenseKey()));
    }

    @PostMapping(value = "/lemonsqueezy/webhook", consumes = "application/json")
    public ResponseEntity<Void> lemonSqueezyWebhook(
            @RequestBody byte[] payload,
            @RequestHeader(value = "X-Signature", required = false) String signature) {
        checkoutService.handleWebhook(payload, signature);
        return ResponseEntity.ok().build();
    }

    @GetMapping("/health")
    public Map<String, String> health() {
        service.checkReady();
        return Map.of("status", "ok");
    }

    private static String bearerCredential(String authorization) {
        if (authorization == null || !authorization.startsWith("Bearer ")) {
            throw new LicenseException(org.springframework.http.HttpStatus.UNAUTHORIZED,
                    "A bearer license credential is required.");
        }
        return authorization.substring("Bearer ".length());
    }

    private static String accountSubject(Jwt jwt) {
        return jwt.getIssuer() + "|" + jwt.getSubject();
    }

    private static <T> ResponseEntity<T> noStore(T body) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(body);
    }

    public record TestCodeRequest(String code) {
    }

    public record ConsumeReportRequest(String requestId) {
    }

    public record CheckoutResponse(String url) {
    }
    public record CheckoutRequest(int reports) {}

    public record LinkLegacyKeyRequest(String licenseKey) {
    }
}
