package com.automark.web;
import com.automark.domain.SourceQueryStatus; import java.time.Instant; import java.util.UUID;
public record SourceQueryResponse(UUID id,String sourceId,SourceQueryStatus status,Instant startedAt,Instant completedAt,String errorMessage,UUID rawPayloadId) {}
