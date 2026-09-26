package com.taxcalculator.connector;
import com.taxcalculator.domain.FactType; import com.fasterxml.jackson.databind.*; import com.fasterxml.jackson.databind.node.ObjectNode; import org.springframework.stereotype.Component; import java.time.*; import java.util.*;
@Component public class MockFactNormalizer implements FactNormalizer {
 public String sourceId(){return "MOCK";} public List<FactCandidate> normalize(JsonNode payload){List<FactCandidate> result=new ArrayList<>();for(JsonNode event:payload.path("events")){try{FactType type=FactType.valueOf(event.path("type").asText()); ObjectNode value=event.deepCopy();value.remove(List.of("type","date")); Instant at=LocalDate.parse(event.path("date").asText()).atStartOfDay(ZoneOffset.UTC).toInstant();result.add(new FactCandidate(type,value,at,.65));}catch(Exception ignored){}}return result;}
}
