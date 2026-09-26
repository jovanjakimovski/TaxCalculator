package com.taxcalculator.connector;
import com.taxcalculator.domain.LookupType;
public record LookupInput(LookupType type,String value,String countryHint) {}
