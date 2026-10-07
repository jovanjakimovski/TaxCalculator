package com.taxcalculator.licensing;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.time.Instant;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.springframework.security.oauth2.jwt.Jwt;

class CognitoAccessTokenValidatorTest {
    private final CognitoAccessTokenValidator validator = new CognitoAccessTokenValidator("expected-client");

    @Test
    void acceptsOnlyAccessTokensIssuedToThisAppClient() {
        assertTrue(validator.validate(token("expected-client", "access")).hasErrors() == false);
        assertFalse(validator.validate(token("another-client", "access")).hasErrors() == false);
        assertFalse(validator.validate(token("expected-client", "id")).hasErrors() == false);
    }

    private static Jwt token(String clientId, String tokenUse) {
        Instant now = Instant.now();
        return new Jwt("token", now.minusSeconds(1), now.plusSeconds(300),
                Map.of("alg", "RS256"), Map.of(
                        "sub", "account-subject",
                        "client_id", clientId,
                        "token_use", tokenUse));
    }
}