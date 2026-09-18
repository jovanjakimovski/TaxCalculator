package com.automark.tax;

import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;
import java.io.IOException;
import java.math.BigDecimal;

@RestController
@RequestMapping("/api/tax")
@CrossOrigin(origins = "${AUTOMARK_CORS_ORIGIN:http://localhost:5173}")
public class TaxCalculationController {
  private final RealizedGainsService service;
  public TaxCalculationController(RealizedGainsService service) { this.service = service; }
  @PostMapping(value = "/realized-gains", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
  RealizedGainsResponse calculate(@RequestPart("file") MultipartFile file, @RequestParam(defaultValue = "1") int rateOffsetDays, @RequestParam(defaultValue = "10") BigDecimal securitiesTaxRate, @RequestParam(defaultValue = "10") BigDecimal dividendTaxRate, @RequestParam(defaultValue = "10") BigDecimal forexTaxRate, @RequestParam(defaultValue = "10") BigDecimal interestTaxRate, @RequestParam(defaultValue = "false") boolean offsetSecuritiesLosses, @RequestParam(defaultValue = "false") boolean offsetForexLosses, @RequestParam(defaultValue = "false") boolean offsetAcrossSections, @RequestParam(defaultValue = "true") boolean includeSecurities, @RequestParam(defaultValue = "true") boolean includeDividends, @RequestParam(defaultValue = "false") boolean includeForex, @RequestParam(defaultValue = "true") boolean includeInterest) throws IOException {
    if (file.isEmpty()) throw new IllegalArgumentException("Upload an IBKR CSV file.");
    if (rateOffsetDays < 0 || rateOffsetDays > 30) throw new IllegalArgumentException("Rate offset must be between 0 and 30 days.");
    for (BigDecimal taxRate : new BigDecimal[] { securitiesTaxRate, dividendTaxRate, forexTaxRate, interestTaxRate }) if (taxRate.compareTo(BigDecimal.ZERO) < 0 || taxRate.compareTo(BigDecimal.valueOf(100)) > 0) throw new IllegalArgumentException("Tax rates must be between 0 and 100.");
    return service.calculate(file.getInputStream(), file.getOriginalFilename(), rateOffsetDays, securitiesTaxRate, dividendTaxRate, forexTaxRate, interestTaxRate, offsetSecuritiesLosses, offsetForexLosses, offsetAcrossSections, includeSecurities, includeDividends, includeForex, includeInterest);
  }
}