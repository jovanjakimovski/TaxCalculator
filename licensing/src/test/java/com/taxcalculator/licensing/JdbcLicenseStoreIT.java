package com.taxcalculator.licensing;

import static org.junit.jupiter.api.Assertions.*;
import java.util.UUID;
import java.util.ArrayList;
import java.util.concurrent.*;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.postgresql.PostgreSQLContainer;

@Testcontainers
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.MOCK, properties = {"license.require-account-auth=false", "license.cognito-issuer-uri=", "license.cognito-app-client-id="})
class JdbcLicenseStoreIT {
    @Container static final PostgreSQLContainer postgres = new PostgreSQLContainer("postgres:16-alpine");
    @DynamicPropertySource static void database(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", postgres::getJdbcUrl);
        registry.add("spring.datasource.username", postgres::getUsername);
        registry.add("spring.datasource.password", postgres::getPassword);
    }
    @Autowired LicenseStore store;

    @Test void bundlesDuplicateDeliveryAndFullRefund() {
        String account = "test|" + UUID.randomUUID(); UUID id = store.getOrCreateAccountLicenseId(account);
        store.grantPurchasedCredits(id, "event-1", "order-1", "payment-1", 3);
        store.grantPurchasedCredits(id, "event-1", "order-1", "payment-1", 3);
        assertEquals(3, store.accountCredits(account));
        assertTrue(store.consumeAccount(account, "report-1").consumed());
        assertTrue(store.refundPurchasedCredit("payment-1", "refund-1"));
        assertTrue(store.refundPurchasedCredit("payment-1", "refund-1"));
        assertEquals(0, store.accountCredits(account));
        assertTrue(store.consumeAccount(account, "report-1").consumed());
        assertFalse(store.consumeAccount(account, "report-2").consumed());
        assertFalse(store.refundPurchasedCredit("unknown-payment", "refund-2"));
    }
    @Test void parallelIdempotentRequestsDebitOnlyOnce() throws Exception {
        String account = "test|" + UUID.randomUUID(); UUID id = store.getOrCreateAccountLicenseId(account);
        store.grantTestCredits(id, "parallel-code", 3);
        try (var executor = Executors.newFixedThreadPool(8)) {
            var futures = new ArrayList<Future<LicenseStore.Consumption>>();
            for (int i = 0; i < 16; i++) futures.add(executor.submit(() -> store.consumeAccount(account, "same-request")));
            for (var future : futures) assertTrue(future.get(15, TimeUnit.SECONDS).consumed());
        }
        assertEquals(2, store.accountCredits(account));
    }
    @Test void concurrentRefundAndConsumeRemainConsistentWithoutDeadlock() throws Exception {
        for (int i = 0; i < 12; i++) {
            String key = UUID.randomUUID().toString(), account = "test|" + key;
            UUID id = store.getOrCreateAccountLicenseId(account);
            store.grantPurchasedCredits(id, "event-" + key, "order-" + key, "payment-" + key, 3);
            var gate = new CountDownLatch(1);
            try (var executor = Executors.newFixedThreadPool(2)) {
                var consume = executor.submit(() -> { gate.await(); return store.consumeAccount(account, "report"); });
                var refund = executor.submit(() -> { gate.await(); return store.refundPurchasedCredit("payment-" + key, "refund-" + key); });
                gate.countDown(); consume.get(15, TimeUnit.SECONDS); assertTrue(refund.get(15, TimeUnit.SECONDS));
            }
            assertEquals(0, store.accountCredits(account));
        }
    }
    @Test void legacyLicenseLinksOnceAndCannotBeTakenByAnotherAccount() {
        String key = UUID.randomUUID().toString(), first = "test|" + UUID.randomUUID(), second = "test|" + UUID.randomUUID();
        store.grantTestCredits(key, "legacy-code", 2);
        assertEquals(LicenseStore.LinkResult.LINKED, store.linkLegacyLicense(first, key));
        assertEquals(2, store.accountCredits(first));
        assertEquals(LicenseStore.LinkResult.ALREADY_LINKED, store.linkLegacyLicense(first, key));
        assertEquals(LicenseStore.LinkResult.ALREADY_CLAIMED, store.linkLegacyLicense(second, key));
        assertEquals(0, store.credits(key));
    }
}
