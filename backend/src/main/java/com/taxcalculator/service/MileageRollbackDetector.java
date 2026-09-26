package com.taxcalculator.service;
import com.taxcalculator.domain.*; import org.springframework.stereotype.Component; import java.util.*;
@Component public class MileageRollbackDetector {
 public List<ReportFlag> detect(Vehicle vehicle,List<VehicleFact> facts){List<VehicleFact> mileage=facts.stream().filter(f->f.getFactType()==FactType.MILEAGE_READING&&f.getObservedAt()!=null&&f.getValue().has("km")).sorted(Comparator.comparing(VehicleFact::getObservedAt)).toList();List<ReportFlag> flags=new ArrayList<>();for(int i=1;i<mileage.size();i++){long before=mileage.get(i-1).getValue().path("km").asLong();long after=mileage.get(i).getValue().path("km").asLong();if(after<before)flags.add(new ReportFlag(vehicle,FlagType.MILEAGE_ROLLBACK,List.of(mileage.get(i-1).getId(),mileage.get(i).getId()),"Mileage decreased from "+before+" km to "+after+" km between recorded events. This may indicate rollback, missing history, or a source error."));}return flags;}
}
