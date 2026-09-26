package com.taxcalculator.web;
import com.taxcalculator.domain.FlagType; import java.util.*;
public record FlagResponse(UUID id,FlagType type,List<UUID> relatedFactIds,String description) {}
