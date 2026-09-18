package com.automark.domain;
import org.springframework.data.jpa.repository.JpaRepository; import java.util.*;
public interface VehicleFactRepository extends JpaRepository<VehicleFact,UUID>{ List<VehicleFact> findByVehicleId(UUID vehicleId); }
