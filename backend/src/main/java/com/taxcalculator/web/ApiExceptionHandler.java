package com.taxcalculator.web;
import org.springframework.http.*; import org.springframework.web.bind.annotation.*; import java.util.*;
@RestControllerAdvice public class ApiExceptionHandler { @ExceptionHandler(NotFoundException.class) ResponseEntity<Map<String,String>> notFound(NotFoundException e){return ResponseEntity.status(404).body(Map.of("message",e.getMessage()));} @ExceptionHandler({IllegalArgumentException.class}) ResponseEntity<Map<String,String>> badRequest(Exception e){return ResponseEntity.badRequest().body(Map.of("message",e.getMessage()));} }
