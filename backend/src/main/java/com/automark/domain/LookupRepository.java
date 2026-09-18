package com.automark.domain;
import org.springframework.data.jpa.repository.JpaRepository; import java.util.*;
public interface LookupRepository extends JpaRepository<Lookup,UUID>{}
