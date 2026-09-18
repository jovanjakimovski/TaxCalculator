package com.automark.domain;
import jakarta.persistence.*; import java.time.Instant; import java.util.UUID;
@Entity @Table(name="lookups") public class Lookup {
 @Id private UUID id=UUID.randomUUID(); @Enumerated(EnumType.STRING) @Column(nullable=false) private LookupType inputType; @Column(nullable=false) private String inputValue; private String countryHint;
 @ManyToOne(fetch=FetchType.LAZY) private Vehicle vehicle; @Enumerated(EnumType.STRING) @Column(nullable=false) private LookupStatus status=LookupStatus.PENDING; @Column(nullable=false) private Instant createdAt=Instant.now();
 protected Lookup(){} public Lookup(LookupType t,String value,String country){inputType=t;inputValue=value;countryHint=country;}
 public UUID getId(){return id;} public LookupType getInputType(){return inputType;} public String getInputValue(){return inputValue;} public String getCountryHint(){return countryHint;} public Vehicle getVehicle(){return vehicle;} public LookupStatus getStatus(){return status;} public Instant getCreatedAt(){return createdAt;}
 public void setVehicle(Vehicle v){vehicle=v;} public void complete(){status=LookupStatus.COMPLETED;} public void fail(){status=LookupStatus.FAILED;}
}
