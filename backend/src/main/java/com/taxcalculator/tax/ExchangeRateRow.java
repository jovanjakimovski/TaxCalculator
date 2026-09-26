package com.taxcalculator.tax;

import java.math.BigDecimal;

public record ExchangeRateRow(String requestedDate, String effectiveDate, BigDecimal mkdPerUsd) {}