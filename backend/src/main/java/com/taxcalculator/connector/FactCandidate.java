package com.taxcalculator.connector;
import com.taxcalculator.domain.FactType; import com.fasterxml.jackson.databind.JsonNode; import java.time.Instant;
public record FactCandidate(FactType type, JsonNode value, Instant observedAt, Double confidence) {}
