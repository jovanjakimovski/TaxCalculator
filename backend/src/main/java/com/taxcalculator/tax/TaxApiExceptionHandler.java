package com.taxcalculator.tax;

import java.util.Map;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

@RestControllerAdvice
public class TaxApiExceptionHandler {
  @ExceptionHandler(org.springframework.dao.DataAccessException.class)
  ResponseEntity<Map<String, String>> databaseUnavailable(org.springframework.dao.DataAccessException error) {
    return ResponseEntity.status(503).body(Map.of("message", "Exchange-rate storage is temporarily unavailable. Please retry."));
  }
  @ExceptionHandler(java.io.IOException.class)
  ResponseEntity<Map<String, String>> unavailable(java.io.IOException error) {
    return ResponseEntity.status(503).body(Map.of("message", "Exchange rates are temporarily unavailable. No credit has been used. Please retry."));
  }
  @ExceptionHandler(IllegalArgumentException.class)
  ResponseEntity<Map<String, String>> badRequest(IllegalArgumentException error) {
    return ResponseEntity.badRequest().body(Map.of("message", error.getMessage()));
  }
}
