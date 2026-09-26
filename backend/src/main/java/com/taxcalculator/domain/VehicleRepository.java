package com.taxcalculator.domain;
import org.springframework.data.jpa.repository.JpaRepository; import java.util.*;
public interface VehicleRepository extends JpaRepository<Vehicle,UUID>{ Optional<Vehicle> findByVin(String vin); Optional<Vehicle> findByPrimaryPlateAndPrimaryCountry(String plate,String country); }
