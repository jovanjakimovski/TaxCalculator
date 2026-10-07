package com.taxcalculator.licensing;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

@RestControllerAdvice
public class LicenseExceptionHandler {
    @ExceptionHandler(org.springframework.dao.DataAccessException.class)
    ResponseEntity<ApiError> unavailable(org.springframework.dao.DataAccessException exception) {
        return ResponseEntity.status(503).body(new ApiError("Account storage is temporarily unavailable. Retry your original request; a completed debit will not be charged twice."));
    }
    @ExceptionHandler(LicenseException.class)
    ResponseEntity<ApiError> handleLicenseException(LicenseException exception) {
        return ResponseEntity.status(exception.status()).body(new ApiError(exception.getMessage()));
    }

    @ExceptionHandler(IllegalArgumentException.class)
    ResponseEntity<ApiError> handleInvalidRequest(IllegalArgumentException exception) {
        return ResponseEntity.badRequest().body(new ApiError(exception.getMessage()));
    }

    public record ApiError(String error) {
    }
}
