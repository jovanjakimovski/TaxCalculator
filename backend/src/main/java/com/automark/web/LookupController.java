package com.automark.web;
import com.automark.service.*; import jakarta.validation.Valid; import org.springframework.http.*; import org.springframework.web.bind.annotation.*; import java.util.*;
@RestController @RequestMapping("/api") @CrossOrigin(origins="${AUTOMARK_CORS_ORIGIN:http://localhost:5173}") public class LookupController {
 private final LookupService lookup; private final ReportService reports; public LookupController(LookupService l,ReportService r){lookup=l;reports=r;}
 @PostMapping("/lookups") ResponseEntity<LookupResponse> create(@Valid @RequestBody CreateLookupRequest request){return ResponseEntity.status(HttpStatus.CREATED).body(lookup.execute(request));}
 @GetMapping("/lookups/{id}") LookupResponse lookup(@PathVariable UUID id){return lookup.response(id);}
 @GetMapping("/lookups/{id}/source-queries") List<SourceQueryResponse> queries(@PathVariable UUID id){return reports.sourceQueries(id);}
 @GetMapping("/vehicles/{id}/report") VehicleReportResponse report(@PathVariable UUID id){return reports.report(id);}
 @GetMapping("/source-queries/{id}/raw") Object raw(@PathVariable UUID id){return reports.raw(id);}
}
