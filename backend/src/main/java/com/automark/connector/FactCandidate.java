package com.automark.connector;
import com.automark.domain.FactType; import com.fasterxml.jackson.databind.JsonNode; import java.time.Instant;
public record FactCandidate(FactType type, JsonNode value, Instant observedAt, Double confidence) {}
