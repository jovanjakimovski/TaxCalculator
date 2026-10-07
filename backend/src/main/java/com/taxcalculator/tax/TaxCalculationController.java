package com.taxcalculator.tax;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import java.io.IOException;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/tax")
public class TaxCalculationController {
  private final ExchangeRateService service;

  public TaxCalculationController(ExchangeRateService service) {
    this.service = service;
  }

  @GetMapping("/health")
  Map<String, String> health() {
    service.checkReady();
    return Map.of("status", "ok");
  }

  @GetMapping("/exchange-rates")
  List<ExchangeRateRow> exchangeRates(
      @RequestParam LocalDate startDate,
      @RequestParam LocalDate endDate,
      @RequestParam(defaultValue = "1") int rateOffsetDays) throws IOException {
    if (rateOffsetDays < 0 || rateOffsetDays > 30) {
      throw new IllegalArgumentException("Rate offset must be between 0 and 30 days.");
    }
    return service.exchangeRates(startDate, endDate, rateOffsetDays);
  }
}
