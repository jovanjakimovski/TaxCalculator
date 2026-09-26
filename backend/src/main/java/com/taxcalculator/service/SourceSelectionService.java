package com.taxcalculator.service;
import com.taxcalculator.connector.*; import com.taxcalculator.domain.LookupType; import org.springframework.stereotype.Service; import java.util.*;
@Service public class SourceSelectionService {
 private final List<VehicleSourceConnector> connectors; public SourceSelectionService(List<VehicleSourceConnector> connectors){this.connectors=connectors;}
 public List<VehicleSourceConnector> select(LookupInput input){return connectors.stream().filter(c->c.supportedLookupTypes().contains(input.type())).filter(c->c.supportedCountries().contains("*")||input.countryHint()!=null&&c.supportedCountries().contains(input.countryHint().toUpperCase())).toList();}
}
