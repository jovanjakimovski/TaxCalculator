package com.taxcalculator.web;
import com.taxcalculator.domain.FactType; import com.fasterxml.jackson.databind.JsonNode; import java.time.Instant; import java.util.UUID;
public record FactResponse(UUID id,FactType type,JsonNode value,Instant observedAt,String sourceId,UUID sourceQueryId) {}
