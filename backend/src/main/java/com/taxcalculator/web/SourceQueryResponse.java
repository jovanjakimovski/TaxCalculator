package com.taxcalculator.web;
import com.taxcalculator.domain.SourceQueryStatus; import java.time.Instant; import java.util.UUID;
public record SourceQueryResponse(UUID id,String sourceId,SourceQueryStatus status,Instant startedAt,Instant completedAt,String errorMessage,UUID rawPayloadId) {}
