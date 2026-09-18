package com.automark.tax;

import java.math.BigDecimal;

public record InterestRow(String date, String rateDate, BigDecimal usdAmount, BigDecimal mkdRate, BigDecimal mkdAmount, BigDecimal estimatedTaxMkd) {}
