package com.automark.connector;
import com.automark.domain.SourceQueryStatus; import com.fasterxml.jackson.databind.JsonNode;
public record SourceFetchResult(SourceQueryStatus status, JsonNode rawPayload, String errorMessage) {
 public static SourceFetchResult success(JsonNode p){return new SourceFetchResult(SourceQueryStatus.SUCCESS,p,null);} public static SourceFetchResult noData(){return new SourceFetchResult(SourceQueryStatus.NO_DATA,null,null);}
}
