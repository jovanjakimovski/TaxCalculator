package com.taxcalculator.licensing;

import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;

import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.http.MediaType;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import java.net.http.HttpClient;

@WebMvcTest(LicenseController.class)
@Import(LicenseSecurityConfiguration.class)
class LicenseControllerTest {
    private static final String CREDENTIAL = "a".repeat(43);

    @Autowired
    private MockMvc mvc;

    @MockitoBean
    private LicenseService licenseService;

    @MockitoBean
        private LemonSqueezyCheckoutService checkoutService;

        @MockitoBean
        private HttpClient httpClient;

    @Test
    void entitlementRequiresBearerCredentialAndIsNotCacheable() throws Exception {
        when(licenseService.entitlement(CREDENTIAL))
                .thenReturn(new LicenseService.Entitlement(2, true, false, false));

        mvc.perform(get("/api/license/entitlement").header("Authorization", "Bearer " + CREDENTIAL))
                .andExpect(status().isOk())
                .andExpect(header().string("Cache-Control", "no-store"))
                .andExpect(jsonPath("$.credits").value(2));
        mvc.perform(get("/api/license/entitlement"))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void reportConsumptionAcceptsOnlyAnIdempotencyId() throws Exception {
        when(licenseService.consumeReport(CREDENTIAL, "report-1"))
                .thenReturn(new LicenseService.Entitlement(1, true, false, false));

        mvc.perform(post("/api/license/reports/consume")
                        .header("Authorization", "Bearer " + CREDENTIAL)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"requestId\":\"report-1\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.credits").value(1));

        verify(licenseService).consumeReport(CREDENTIAL, "report-1");
    }

    @Test
    void checkoutUsesOnlyTheLicenseIdAndReturnsProviderUrl() throws Exception {
        UUID licenseId = UUID.fromString("8ddf52a5-4d6b-4cac-b55e-26c809f72abd");
        when(licenseService.getOrCreateLicenseId(CREDENTIAL)).thenReturn(licenseId);
        when(checkoutService.createCheckout(licenseId)).thenReturn("https://tax.lemonsqueezy.com/checkout/session");

        mvc.perform(post("/api/license/checkout").header("Authorization", "Bearer " + CREDENTIAL))
                .andExpect(status().isOk())
                .andExpect(header().string("Cache-Control", "no-store"))
                .andExpect(jsonPath("$.url").value("https://tax.lemonsqueezy.com/checkout/session"));
    }

    @Test
    void signedInAccountGetsAccountScopedEntitlement() throws Exception {
        when(licenseService.accountEntitlement("https://issuer.example|cognito-subject"))
                .thenReturn(new LicenseService.Entitlement(4, false, true, true));

        mvc.perform(get("/api/license/entitlement").with(jwt().jwt(token -> token
                        .issuer("https://issuer.example")
                        .subject("cognito-subject")
                        .claim("token_use", "access")
                        .claim("client_id", "app-client"))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.credits").value(4))
                .andExpect(jsonPath("$.accountMode").value(true));
    }

    @Test
    void legacyLicenseLinkRequiresAnAuthenticatedAccount() throws Exception {
        mvc.perform(post("/api/license/account/link-legacy-key")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"licenseKey\":\"" + CREDENTIAL + "\"}"))
                .andExpect(status().isUnauthorized());

        when(licenseService.linkLegacyLicense("https://issuer.example|cognito-subject", CREDENTIAL))
                .thenReturn(new LicenseService.Entitlement(3, false, false, true));
        mvc.perform(post("/api/license/account/link-legacy-key")
                        .with(jwt().jwt(token -> token
                                .issuer("https://issuer.example")
                                .subject("cognito-subject")))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"licenseKey\":\"" + CREDENTIAL + "\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.credits").value(3));
    }
}