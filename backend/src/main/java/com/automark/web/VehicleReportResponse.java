package com.automark.web;
import com.automark.domain.FactType; import java.util.*;
public record VehicleReportResponse(UUID vehicleId,String vin,String plate,String country,Map<FactType,List<FactResponse>> facts,List<FlagResponse> flags) {}
