package com.taxcalculator.licensing;

import org.springframework.http.HttpStatus;

public class LicenseException extends RuntimeException {
    private final HttpStatus status;

    public LicenseException(HttpStatus status, String message) {
        super(message);
        this.status = status;
    }

    public HttpStatus status() {
        return status;
    }
}