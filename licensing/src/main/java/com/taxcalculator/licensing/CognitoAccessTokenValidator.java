package com.taxcalculator.licensing;

import org.springframework.security.oauth2.core.OAuth2Error;
import org.springframework.security.oauth2.core.OAuth2TokenValidator;
import org.springframework.security.oauth2.core.OAuth2TokenValidatorResult;
import org.springframework.security.oauth2.jwt.Jwt;

public class CognitoAccessTokenValidator implements OAuth2TokenValidator<Jwt> {
    private static final OAuth2Error INVALID_TOKEN = new OAuth2Error("invalid_token");
    private final String appClientId;

    public CognitoAccessTokenValidator(String appClientId) {
        this.appClientId = appClientId;
    }

    @Override
    public OAuth2TokenValidatorResult validate(Jwt jwt) {
        boolean validClient = appClientId.equals(jwt.getClaimAsString("client_id"));
        boolean validTokenType = "access".equals(jwt.getClaimAsString("token_use"));
        boolean hasSubject = jwt.getSubject() != null && !jwt.getSubject().isBlank();
        return validClient && validTokenType && hasSubject
                ? OAuth2TokenValidatorResult.success()
                : OAuth2TokenValidatorResult.failure(INVALID_TOKEN);
    }
}