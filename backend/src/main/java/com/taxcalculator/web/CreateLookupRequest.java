package com.taxcalculator.web;
import com.taxcalculator.domain.LookupType; import jakarta.validation.constraints.*;
public record CreateLookupRequest(@NotNull LookupType inputType,@NotBlank @Size(max=100) String value,@Pattern(regexp="^[A-Za-z]{2}$",message="Use a two-letter country code") String countryHint) {}
