package com.automark.web;
import com.automark.domain.LookupStatus; import java.time.Instant; import java.util.UUID;
public record LookupResponse(UUID lookupId,LookupStatus status,UUID vehicleId,Instant createdAt) {}
