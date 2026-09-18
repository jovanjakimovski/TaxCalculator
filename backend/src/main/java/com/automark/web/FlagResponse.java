package com.automark.web;
import com.automark.domain.FlagType; import java.util.*;
public record FlagResponse(UUID id,FlagType type,List<UUID> relatedFactIds,String description) {}
