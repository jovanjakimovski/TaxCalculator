package com.taxcalculator.domain;
import jakarta.persistence.*; import java.time.Instant; import java.util.*;
@Entity @Table(name="report_flags") public class ReportFlag {
 @Id private UUID id=UUID.randomUUID(); @ManyToOne(fetch=FetchType.LAZY) @JoinColumn(nullable=false) private Vehicle vehicle; @Enumerated(EnumType.STRING) @Column(nullable=false) private FlagType flagType; @Column(columnDefinition="uuid[]",nullable=false) private UUID[] relatedFactIds; @Column(columnDefinition="text",nullable=false) private String description; @Column(nullable=false) private Instant createdAt=Instant.now();
 protected ReportFlag(){} public ReportFlag(Vehicle v,FlagType t,List<UUID> ids,String text){vehicle=v;flagType=t;relatedFactIds=ids.toArray(UUID[]::new);description=text;}
 public UUID getId(){return id;} public FlagType getFlagType(){return flagType;} public UUID[] getRelatedFactIds(){return relatedFactIds;} public String getDescription(){return description;}
}
