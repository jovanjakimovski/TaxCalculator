package com.taxcalculator.licensing;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.http.HttpMethod;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.oauth2.core.OAuth2TokenValidator;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.jwt.JwtValidators;
import org.springframework.security.oauth2.jwt.NimbusJwtDecoder;
import org.springframework.security.oauth2.core.DelegatingOAuth2TokenValidator;
import org.springframework.security.web.SecurityFilterChain;

@Configuration
@EnableConfigurationProperties(LicenseProperties.class)
public class LicenseSecurityConfiguration {
    @Bean
    SecurityFilterChain licenseSecurityFilterChain(HttpSecurity http, LicenseProperties properties) throws Exception {
        http.csrf(csrf -> csrf.disable());
        http.sessionManagement(session -> session.sessionCreationPolicy(
                org.springframework.security.config.http.SessionCreationPolicy.STATELESS));
        if (properties.accountModeEnabled()) {
            NimbusJwtDecoder decoder = NimbusJwtDecoder.withIssuerLocation(properties.cognitoIssuerUri()).build();
            OAuth2TokenValidator<Jwt> issuerValidator = JwtValidators.createDefaultWithIssuer(properties.cognitoIssuerUri());
            OAuth2TokenValidator<Jwt> validators = new DelegatingOAuth2TokenValidator<>(
                    issuerValidator, new CognitoAccessTokenValidator(properties.cognitoAppClientId()));
            decoder.setJwtValidator(validators);

            http.authorizeHttpRequests(authorize -> authorize
                            .requestMatchers(HttpMethod.GET, "/api/license/health", "/api/license/config").permitAll()
                            .requestMatchers(HttpMethod.POST, "/api/license/lemonsqueezy/webhook").permitAll()
                            .anyRequest().authenticated())
                    .oauth2ResourceServer(resourceServer -> resourceServer.jwt(jwt -> jwt.decoder(decoder)));
        } else {
            http.authorizeHttpRequests(authorize -> authorize.anyRequest().permitAll());
        }
        return http.build();
    }
}
