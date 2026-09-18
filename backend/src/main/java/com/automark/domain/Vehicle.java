package com.automark.domain;
import jakarta.persistence.*; import java.time.Instant; import java.util.UUID;
@Entity @Table(name="vehicles") public class Vehicle {
  @Id private UUID id=UUID.randomUUID(); @Column(unique=true,length=17) private String vin;
  private String primaryPlate; private String primaryCountry; private String make; private String model; private Integer modelYear;
  @Column(nullable=false) private Instant createdAt=Instant.now();
  protected Vehicle() {} public Vehicle(String vin,String plate,String country){this.vin=vin;this.primaryPlate=plate;this.primaryCountry=country;}
  public UUID getId(){return id;} public String getVin(){return vin;} public String getPrimaryPlate(){return primaryPlate;} public String getPrimaryCountry(){return primaryCountry;}
  public String getMake(){return make;} public String getModel(){return model;} public Integer getModelYear(){return modelYear;}
  public void enrich(String make,String model,Integer year){this.make=make;this.model=model;this.modelYear=year;}
}
