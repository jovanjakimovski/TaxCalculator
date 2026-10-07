package com.taxcalculator.tax;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
import static org.mockito.ArgumentMatchers.any;
import java.io.IOException;
import java.math.BigDecimal;
import java.net.http.*;
import java.time.LocalDate;
import java.util.List;
import org.junit.jupiter.api.Test;

class ExchangeRateServiceTest {
    private final NbrmExchangeRateRepository repo = mock(NbrmExchangeRateRepository.class);
    private final HttpClient http = mock(HttpClient.class);
    private final ExchangeRateService service = new ExchangeRateService(repo, http);
    private final LocalDate day = LocalDate.of(2024, 1, 8);

    @Test void cachedWeekendWorksWithoutUpstream() throws Exception {
        when(repo.findAllById(any())).thenReturn(List.of(new NbrmExchangeRate(day.minusDays(1), day.minusDays(3), new BigDecimal("56.4"))));
        var result = service.exchangeRates(day, day, 1);
        assertEquals("2024-01-05", result.get(0).effectiveDate());
        assertEquals(new BigDecimal("56.4"), result.get(0).mkdPerUsd());
        verifyNoInteractions(http); verify(repo, never()).upsert(any(), any(), any());
    }
    @Test void fallsBackBefore2025AndNeverUsesAFutureRate() throws Exception {
        String xml = "<rates><rate><Oznaka>USD</Oznaka><Datum>2024-01-05T00:00:00</Datum><Sreden>56.4</Sreden><Nomin>1</Nomin></rate>" +
            "<rate><Oznaka>USD</Oznaka><Datum>2024-01-09T00:00:00</Datum><Sreden>99</Sreden><Nomin>1</Nomin></rate></rates>";
        response(xml, 200);
        assertEquals("2024-01-05", service.exchangeRates(day, day, 1).get(0).effectiveDate());
        verify(repo).upsert(day.minusDays(1), day.minusDays(3), new BigDecimal("56.4000000000"));
    }
    @Test void boundsRangeAndOffsetBeforeNetworkOrDatabaseWork() {
        assertThrows(IllegalArgumentException.class, () -> service.exchangeRates(day, day.plusDays(400), 1));
        assertThrows(IllegalArgumentException.class, () -> service.exchangeRates(day, day, -1));
        assertThrows(IllegalArgumentException.class, () -> service.exchangeRates(day, day.minusDays(1), 1));
        verifyNoInteractions(repo, http);
    }
    @Test void failsOnUnavailableOrMissingRates() throws Exception {
        response("", 503); assertThrows(IOException.class, () -> service.exchangeRates(day, day, 1));
        response("<rates/>", 200); assertThrows(IOException.class, () -> service.exchangeRates(day, day, 1));
    }
    @Test void refusesExternalEntities() throws Exception {
        response("<!DOCTYPE x [<!ENTITY y SYSTEM 'file:///etc/passwd'>]><rates>&y;</rates>", 200);
        assertThrows(IOException.class, () -> service.exchangeRates(day, day, 1));
    }
    @SuppressWarnings("unchecked") private void response(String body, int status) throws Exception {
        HttpResponse<String> response = mock(HttpResponse.class);
        when(response.body()).thenReturn(body); when(response.statusCode()).thenReturn(status);
        when(http.send(any(HttpRequest.class), org.mockito.ArgumentMatchers.<HttpResponse.BodyHandler<String>>any())).thenReturn(response);
    }
}
