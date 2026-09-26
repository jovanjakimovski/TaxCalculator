package com.taxcalculator.connector;
import com.taxcalculator.domain.*; import com.fasterxml.jackson.databind.*; import org.springframework.beans.factory.annotation.Value; import org.springframework.stereotype.Component; import org.springframework.web.client.RestClient; import java.util.*;
@Component public class RdwNlConnector implements VehicleSourceConnector {
 private final RestClient client; public RdwNlConnector(RestClient.Builder b,@Value("${taxcalculator.rdw.base-url}") String url){client=b.baseUrl(url).build();}
 public String sourceId(){return "RDW_NL";} public Set<LookupType> supportedLookupTypes(){return Set.of(LookupType.PLATE,LookupType.PLATE_AND_COUNTRY);} public Set<String> supportedCountries(){return Set.of("NL");}
 public SourceFetchResult fetch(LookupInput input){ try { JsonNode payload=client.get().uri(uri->uri.queryParam("kenteken",input.value().replaceAll("[^A-Za-z0-9]","").toUpperCase()).build()).retrieve().body(JsonNode.class); return payload==null||payload.isEmpty()?SourceFetchResult.noData():SourceFetchResult.success(payload); } catch(Exception e){return new SourceFetchResult(SourceQueryStatus.FAILURE,null,"RDW request failed: "+e.getClass().getSimpleName());} }
}
