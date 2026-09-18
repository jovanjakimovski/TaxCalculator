package com.automark.connector;
import com.automark.domain.LookupType;
public record LookupInput(LookupType type,String value,String countryHint) {}
