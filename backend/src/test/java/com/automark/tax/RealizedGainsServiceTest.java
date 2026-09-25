package com.automark.tax;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

import java.io.ByteArrayInputStream;
import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import org.junit.jupiter.api.Test;

class RealizedGainsServiceTest {

    @Test
    void appliesLongTermTaxReductionToPositiveGain() {
        assertEquals(new BigDecimal("90.00"),
            RealizedGainsService.taxableGainForHoldingPeriod(new BigDecimal("100.00"), 365L));
    }

    @Test
    void keepsShortTermGainFullyTaxable() {
        assertEquals(new BigDecimal("100.00"),
            RealizedGainsService.taxableGainForHoldingPeriod(new BigDecimal("100.00"), 364L));
    }

    @Test
    void matchesWithholdingDescriptionToDividendDescription() {
        assertEquals(
            RealizedGainsService.normalizeDividendDescription("SYN (Ordinary Dividend)"),
            RealizedGainsService.normalizeDividendDescription("SYN (Ordinary Dividend) - US Tax"));
    }

    @Test
    void rejectsFilesWithoutTradesSection() {
        RealizedGainsService service = new RealizedGainsService(null);

        assertThrows(IllegalArgumentException.class, () -> service.calculate(
            new ByteArrayInputStream("Statement,Data,Title,Not an IBKR statement\n".getBytes(StandardCharsets.UTF_8)),
            "invalid.csv", 1, new BigDecimal("10")));
    }
}
