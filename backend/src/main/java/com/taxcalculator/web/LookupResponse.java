package com.taxcalculator.web;
import com.taxcalculator.domain.LookupStatus; import java.time.Instant; import java.util.UUID;
public record LookupResponse(UUID lookupId,LookupStatus status,UUID vehicleId,Instant createdAt) {}
