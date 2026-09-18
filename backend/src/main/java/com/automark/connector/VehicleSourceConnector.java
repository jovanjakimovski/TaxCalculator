package com.automark.connector;
import com.automark.domain.LookupType; import java.util.Set;
public interface VehicleSourceConnector { String sourceId(); Set<LookupType> supportedLookupTypes(); Set<String> supportedCountries(); SourceFetchResult fetch(LookupInput input); }
