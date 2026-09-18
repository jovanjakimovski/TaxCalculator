package com.automark.tax;

import java.math.BigDecimal;

public record DividendRow(String date, String rateDate, String symbol, String description, BigDecimal grossUsd, BigDecimal withholdingUsd, BigDecimal netUsd, BigDecimal mkdRate, BigDecimal grossMkd, BigDecimal withholdingMkd, BigDecimal netMkd, BigDecimal estimatedTaxMkd) {}