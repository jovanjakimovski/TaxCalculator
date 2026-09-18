package com.automark.domain;
import org.springframework.data.jpa.repository.JpaRepository; import java.util.*;
public interface SourceQueryRepository extends JpaRepository<SourceQuery,UUID>{ List<SourceQuery> findByLookupIdOrderByStartedAt(UUID lookupId); }
