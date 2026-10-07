package com.taxcalculator.tax;

import java.io.IOException;
import java.io.StringReader;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.time.Duration;
import java.time.temporal.ChronoUnit;
import org.springframework.beans.factory.annotation.Autowired;
import javax.xml.XMLConstants;
import javax.xml.parsers.DocumentBuilderFactory;
import org.springframework.stereotype.Service;
import org.w3c.dom.Element;
import org.w3c.dom.Node;
import org.w3c.dom.NodeList;
import org.xml.sax.InputSource;

@Service
public class ExchangeRateService {
    private static final DateTimeFormatter API_DATE = DateTimeFormatter.ofPattern("dd.MM.yyyy");
    private final HttpClient http;
    private final NbrmExchangeRateRepository exchangeRates;

    @Autowired
    public ExchangeRateService(NbrmExchangeRateRepository exchangeRates) {
        this(exchangeRates, HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(10)).build());
    }

    ExchangeRateService(NbrmExchangeRateRepository exchangeRates, HttpClient http) {
        this.exchangeRates = exchangeRates;
        this.http = http;
    }

    public void checkReady() { exchangeRates.count(); }

    public List<ExchangeRateRow> exchangeRates(LocalDate start, LocalDate end, int offsetDays) throws IOException {
        if (start.isAfter(end)) throw new IllegalArgumentException("Rate range start must not be after end.");
        if (offsetDays < 0 || offsetDays > 30) throw new IllegalArgumentException("Invalid rate offset.");
        if (ChronoUnit.DAYS.between(start, end) > 366 || start.isBefore(LocalDate.of(2000, 1, 1)) || end.isAfter(LocalDate.now(java.time.ZoneOffset.UTC)))
            throw new IllegalArgumentException("Request a period between 2000 and today, up to one year.");
        LocalDate requestedStart = start.minusDays(offsetDays);
        LocalDate requestedEnd = end.minusDays(offsetDays);
        Map<LocalDate, Rate> cached = new HashMap<>();
        exchangeRates.findAllById(requestedStart.datesUntil(requestedEnd.plusDays(1)).toList())
                .forEach(rate -> cached.put(rate.getRequestedDate(), toRate(rate)));
        // A fully cached statement remains usable during a central-bank outage.
        Map<LocalDate, Rate> fetched = cached.size() == ChronoUnit.DAYS.between(start, end) + 1
                ? Map.of() : fetchRates(requestedStart.minusDays(14), requestedEnd);
        List<ExchangeRateRow> rates = new ArrayList<>();
        for (LocalDate date = start; !date.isAfter(end); date = date.plusDays(1)) {
            LocalDate requested = date.minusDays(offsetDays);
            Rate rate = cached.get(requested);
            if (rate == null) {
                rate = fetched.entrySet().stream()
                        .filter(entry -> !entry.getKey().isAfter(requested) && !entry.getKey().isBefore(requested.minusDays(14)))
                        .max(Map.Entry.comparingByKey())
                        .map(Map.Entry::getValue)
                        .orElse(null);
            }
            if (rate == null || rate.date.isAfter(requested) || rate.date.isBefore(requested.minusDays(14)) || rate.value.signum() <= 0)
                throw new IOException("No valid USD rate is available for " + requested);
            if (!cached.containsKey(requested)) cacheRate(requested, rate);
            rates.add(new ExchangeRateRow(date.toString(), rate.date.toString(), rate.value));
        }
        return rates;
    }

    private Map<LocalDate, Rate> fetchRates(LocalDate start, LocalDate end) throws IOException {
        Map<LocalDate, Rate> rates = new HashMap<>();
        String url = "https://www.nbrm.mk/KLServiceNOV/GetExchangeRate?StartDate="
                + API_DATE.format(start) + "&EndDate=" + API_DATE.format(end);
        try {
            HttpResponse<String> response = http.send(HttpRequest.newBuilder(URI.create(url))
                    .timeout(Duration.ofSeconds(25)).header("Accept", "application/xml").GET().build(), HttpResponse.BodyHandlers.ofString());
            if (response.statusCode() < 200 || response.statusCode() >= 300) throw new IOException("NBRNM returned HTTP " + response.statusCode());
            NodeList entries = parseXml(response.body()).getDocumentElement().getChildNodes();
            for (int i = 0; i < entries.getLength(); i++) {
                if (entries.item(i).getNodeType() != Node.ELEMENT_NODE) continue;
                Element entry = (Element) entries.item(i);
                if (!"USD".equals(text(entry, "Oznaka"))) continue;
                LocalDate date = LocalDate.parse(text(entry, "Datum").substring(0, 10));
                BigDecimal middle = new BigDecimal(text(entry, "Sreden"));
                BigDecimal nominal = new BigDecimal(text(entry, "Nomin"));
                rates.put(date, new Rate(date, middle.divide(nominal, 10, RoundingMode.HALF_UP)));
            }
            return rates;
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new IOException("NBRNM request interrupted", e);
        } catch (Exception e) {
            if (e instanceof IOException ioException) throw ioException;
            throw new IOException("Could not parse NBRNM response", e);
        }
    }

    private static org.w3c.dom.Document parseXml(String body) throws Exception {
        DocumentBuilderFactory factory = DocumentBuilderFactory.newInstance();
        factory.setFeature(XMLConstants.FEATURE_SECURE_PROCESSING, true);
        factory.setFeature("http://apache.org/xml/features/disallow-doctype-decl", true);
        factory.setFeature("http://xml.org/sax/features/external-general-entities", false);
        factory.setFeature("http://xml.org/sax/features/external-parameter-entities", false);
        factory.setXIncludeAware(false);
        factory.setExpandEntityReferences(false);
        factory.setAttribute(XMLConstants.ACCESS_EXTERNAL_DTD, "");
        factory.setAttribute(XMLConstants.ACCESS_EXTERNAL_SCHEMA, "");
        return factory.newDocumentBuilder().parse(new InputSource(new StringReader(body)));
    }

    private Rate toRate(NbrmExchangeRate cached) {
        return new Rate(cached.getEffectiveDate(), cached.getRate());
    }

    private void cacheRate(LocalDate requested, Rate rate) {
        exchangeRates.upsert(requested, rate.date, rate.value);
    }

    private static String text(Element parent, String name) {
        Node node = parent.getElementsByTagName(name).item(0);
        if (node == null) throw new IllegalArgumentException("Missing NBRNM field " + name);
        return node.getTextContent();
    }

    private record Rate(LocalDate date, BigDecimal value) {
    }
}
