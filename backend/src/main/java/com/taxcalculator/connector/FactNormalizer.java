package com.taxcalculator.connector;
import com.fasterxml.jackson.databind.JsonNode; import java.util.List;
public interface FactNormalizer { String sourceId(); List<FactCandidate> normalize(JsonNode payload); }
