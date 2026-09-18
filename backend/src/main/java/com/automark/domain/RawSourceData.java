package com.automark.domain;
import com.fasterxml.jackson.databind.JsonNode; import jakarta.persistence.*; import org.hibernate.annotations.JdbcTypeCode; import org.hibernate.type.SqlTypes; import java.time.Instant; import java.util.UUID;
@Entity @Table(name="raw_source_data") public class RawSourceData {
 @Id private UUID id=UUID.randomUUID(); @OneToOne(fetch=FetchType.LAZY) @JoinColumn(nullable=false) private SourceQuery sourceQuery; @JdbcTypeCode(SqlTypes.JSON) @Column(columnDefinition="jsonb",nullable=false) private JsonNode payload; @Column(nullable=false) private Instant fetchedAt=Instant.now();
 protected RawSourceData(){} public RawSourceData(SourceQuery q,JsonNode p){sourceQuery=q;payload=p;} public UUID getId(){return id;} public JsonNode getPayload(){return payload;}
}
