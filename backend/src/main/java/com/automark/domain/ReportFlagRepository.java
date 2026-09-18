package com.automark.domain;
import org.springframework.data.jpa.repository.JpaRepository; import java.util.*;
public interface ReportFlagRepository extends JpaRepository<ReportFlag,UUID>{ List<ReportFlag> findByVehicleId(UUID vehicleId); void deleteByVehicleId(UUID vehicleId); }
