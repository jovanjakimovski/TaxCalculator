package com.automark.domain;
import jakarta.persistence.*; import java.time.Instant; import java.util.UUID;
@Entity @Table(name="source_queries") public class SourceQuery {
 @Id private UUID id=UUID.randomUUID(); @ManyToOne(fetch=FetchType.LAZY) @JoinColumn(nullable=false) private Lookup lookup; @Column(nullable=false) private String sourceId;
 @Enumerated(EnumType.STRING) @Column(nullable=false) private SourceQueryStatus status; @Column(nullable=false) private Instant startedAt; private Instant completedAt; @Column(columnDefinition="text") private String errorMessage;
 protected SourceQuery(){} public SourceQuery(Lookup l,String source){lookup=l;sourceId=source;startedAt=Instant.now();status=SourceQueryStatus.FAILURE;}
 public UUID getId(){return id;} public String getSourceId(){return sourceId;} public SourceQueryStatus getStatus(){return status;} public Instant getStartedAt(){return startedAt;} public Instant getCompletedAt(){return completedAt;} public String getErrorMessage(){return errorMessage;}
 public void finish(SourceQueryStatus s,String error){status=s;errorMessage=error;completedAt=Instant.now();}
}
