package com.automark.tax;
import java.math.BigDecimal;
public record RealizedGainRow(String assetCategory, String symbol, String date, String rateDate, BigDecimal usdResult, BigDecimal mkdRate, BigDecimal mkdResult, BigDecimal estimatedTaxMkd, long holdingDays) {}