package com.automark.domain;
import org.springframework.data.jpa.repository.JpaRepository; import java.util.*;
public interface RawSourceDataRepository extends JpaRepository<RawSourceData,UUID>{ Optional<RawSourceData> findBySourceQueryId(UUID sourceQueryId); }
