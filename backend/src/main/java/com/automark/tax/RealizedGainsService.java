package com.automark.tax;

import org.springframework.stereotype.Service;
import org.w3c.dom.*;
import org.xml.sax.InputSource;
import javax.xml.parsers.DocumentBuilderFactory;
import java.io.*;
import java.math.*;
import java.net.URI;
import java.net.http.*;
import java.nio.charset.StandardCharsets;
import java.time.*;
import java.time.format.DateTimeFormatter;
import java.time.temporal.ChronoUnit;
import java.util.*;

@Service
public class RealizedGainsService {
  private static final DateTimeFormatter API_DATE = DateTimeFormatter.ofPattern("dd.MM.yyyy");
  private static final BigDecimal LONG_TERM_FACTOR = new BigDecimal("0.90");
  private static final long LONG_TERM_DAYS = 365L;
  private final HttpClient http = HttpClient.newHttpClient();
  private final NbrmExchangeRateRepository exchangeRates;

  public RealizedGainsService(NbrmExchangeRateRepository exchangeRates) {
    this.exchangeRates = exchangeRates;
  }

  public RealizedGainsResponse calculate(InputStream input, String fileName, int offsetDays, BigDecimal taxRate) throws IOException {
    return calculate(input, fileName, offsetDays, taxRate, taxRate, taxRate, taxRate, false, false, false);
  }

  public RealizedGainsResponse calculate(InputStream input, String fileName, int offsetDays, BigDecimal taxRate, boolean offsetSecuritiesLosses, boolean offsetForexLosses) throws IOException {
    return calculate(input, fileName, offsetDays, taxRate, taxRate, taxRate, taxRate, offsetSecuritiesLosses, offsetForexLosses, false);
  }

  public List<ExchangeRateRow> exchangeRates(LocalDate start, LocalDate end, int offsetDays) throws IOException {
    if (start.isAfter(end)) throw new IllegalArgumentException("Rate range start must not be after end.");
    LocalDate requestedStart = start.minusDays(offsetDays);
    LocalDate requestedEnd = end.minusDays(offsetDays);
    Map<LocalDate, Rate> fetched = fetchRates(requestedStart, requestedEnd);
    List<ExchangeRateRow> rates = new ArrayList<>();
    for (LocalDate date = start; !date.isAfter(end); date = date.plusDays(1)) {
      LocalDate requested = date.minusDays(offsetDays);
      Rate rate = fetched.get(requested);
      if (rate == null) {
        rate = fetched.entrySet().stream().filter(entry -> !entry.getKey().isAfter(requested)).max(Map.Entry.comparingByKey()).map(Map.Entry::getValue).orElse(null);
      }
      if (rate == null) rate = rate(requested);
      cacheRate(requested, rate);
      rates.add(new ExchangeRateRow(date.toString(), rate.date.toString(), rate.value));
    }
    return rates;
  }

  private Map<LocalDate, Rate> fetchRates(LocalDate start, LocalDate end) throws IOException {
    Map<LocalDate, Rate> rates = new HashMap<>();
    String url = "https://www.nbrm.mk/KLServiceNOV/GetExchangeRate?StartDate=" + API_DATE.format(start) + "&EndDate=" + API_DATE.format(end);
    try {
      HttpResponse<String> response = http.send(HttpRequest.newBuilder(URI.create(url)).header("Accept", "application/xml").GET().build(), HttpResponse.BodyHandlers.ofString());
      if (response.statusCode() >= 400) throw new IOException("NBRNM returned HTTP " + response.statusCode());
      Document doc = DocumentBuilderFactory.newInstance().newDocumentBuilder().parse(new InputSource(new StringReader(response.body())));
      NodeList entries = doc.getDocumentElement().getChildNodes();
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
      throw new IOException("Could not parse NBRNM response", e);
    }
  }

  public RealizedGainsResponse calculate(InputStream input, String fileName, int offsetDays, BigDecimal taxRate, boolean offsetSecuritiesLosses, boolean offsetForexLosses, boolean offsetAcrossSections) throws IOException {
    return calculate(input, fileName, offsetDays, taxRate, taxRate, taxRate, taxRate, offsetSecuritiesLosses, offsetForexLosses, offsetAcrossSections);
  }

  public RealizedGainsResponse calculate(InputStream input, String fileName, int offsetDays, BigDecimal securitiesTaxRate, BigDecimal dividendTaxRate, BigDecimal forexTaxRate, BigDecimal interestTaxRate, boolean offsetSecuritiesLosses, boolean offsetForexLosses, boolean offsetAcrossSections) throws IOException {
    return calculate(input, fileName, offsetDays, securitiesTaxRate, dividendTaxRate, forexTaxRate, interestTaxRate, offsetSecuritiesLosses, offsetForexLosses, offsetAcrossSections, true, true, true, true);
  }

  public RealizedGainsResponse calculate(InputStream input, String fileName, int offsetDays, BigDecimal securitiesTaxRate, BigDecimal dividendTaxRate, BigDecimal forexTaxRate, BigDecimal interestTaxRate, boolean offsetSecuritiesLosses, boolean offsetForexLosses, boolean offsetAcrossSections, boolean includeSecurities, boolean includeDividends, boolean includeForex, boolean includeInterest) throws IOException {
    List<RealizedGainRow> rows = new ArrayList<>();
    List<RealizedGainRow> forexRows = new ArrayList<>();
    Map<DividendKey, DividendAmounts> dividendAmountsByKey = new TreeMap<>(Comparator.comparing(DividendKey::date).thenComparing(DividendKey::symbol).thenComparing(DividendKey::description));
    List<InterestRow> interest = new ArrayList<>();
    Map<String, Deque<TradeLot>> buyLotsBySymbol = new HashMap<>();
    int stockTradeRows = 0;
    int excludedNonStockRows = 0;
    int excludedLossRows = 0;
    int skippedRows = 0;
    boolean tradesHeader = false;
    try (BufferedReader reader = new BufferedReader(new InputStreamReader(input, StandardCharsets.UTF_8))) {
      String line;
      while ((line = reader.readLine()) != null) {
        List<String> cells = csv(line);
        if (cells.size() < 2) continue;
        if ("Dividends".equals(cells.get(0)) && "Data".equals(cells.get(1))) {
          if (cells.size() >= 6 && "USD".equals(cells.get(2))) {
            LocalDate date = LocalDate.parse(cells.get(3));
            BigDecimal amount = decimal(cells.get(5));
            if (amount != null) {
              String description = cells.get(4);
              DividendKey key = new DividendKey(date, symbol(description), normalizeDividendDescription(description));
              dividendAmountsByKey.merge(key, new DividendAmounts(amount, BigDecimal.ZERO), RealizedGainsService::mergeDividends);
            }
          }
          continue;
        }
        if ("Withholding Tax".equals(cells.get(0)) && "Data".equals(cells.get(1))) {
          if (cells.size() >= 6 && "USD".equals(cells.get(2))) {
            LocalDate date = LocalDate.parse(cells.get(3));
            BigDecimal amount = decimal(cells.get(5));
            if (amount != null) {
              String description = cells.get(4);
              DividendKey key = new DividendKey(date, symbol(description), normalizeDividendDescription(description));
              dividendAmountsByKey.merge(key, new DividendAmounts(BigDecimal.ZERO, amount.abs()), RealizedGainsService::mergeDividends);
            }
          }
          continue;
        }
        if ("Interest".equals(cells.get(0)) && "Data".equals(cells.get(1))) {
          if (cells.size() >= 6 && "USD".equals(cells.get(2))) {
            LocalDate date = LocalDate.parse(cells.get(3));
            BigDecimal amount = decimal(cells.get(5));
            if (amount != null) {
              Rate rate = rate(date.minusDays(offsetDays));
              BigDecimal mkdAmount = amount.multiply(rate.value).setScale(2, RoundingMode.HALF_UP);
              BigDecimal interestTax = mkdAmount.max(BigDecimal.ZERO).multiply(interestTaxRate.movePointLeft(2)).setScale(2, RoundingMode.HALF_UP);
              interest.add(new InterestRow(date.toString(), rate.date.toString(), amount, rate.value, mkdAmount, interestTax));
            }
          }
          continue;
        }
        if (!"Data".equals(cells.get(1))) {
          if ("Trades".equals(cells.get(0)) && "Header".equals(cells.get(1))) tradesHeader = true;
          continue;
        }
        if (!"Trades".equals(cells.get(0)) || !tradesHeader || cells.size() < 15 || !"Order".equals(cells.get(2))) continue;
        String category = cells.get(3);
        boolean security = "Stocks".equals(category) || "Equity and Index Options".equals(category);
        boolean forex = "Forex".equals(category);
        if (!security && !forex) { excludedNonStockRows++; continue; }
        if (security) stockTradeRows++;
        String symbol = cells.get(5);
        BigDecimal quantity = decimal(cells.get(7));
        if (quantity == null) { skippedRows++; continue; }
        LocalDate date = LocalDate.parse(cells.get(6).substring(0, 10));
        BigDecimal result = decimal(cells.get(forex ? 14 : 13));
        if (result == null) { skippedRows++; continue; }
        if (security && quantity.signum() > 0) {
          buyLotsBySymbol.computeIfAbsent(symbol, ignored -> new ArrayDeque<>()).addLast(new TradeLot(date, quantity));
          continue;
        }
        if (security && result.signum() < 0) excludedLossRows++;
        long holdingDays = security ? holdingDaysForSell(buyLotsBySymbol.getOrDefault(symbol, new ArrayDeque<>()), date, quantity.abs()) : 0L;
        Rate rate = rate(date.minusDays(offsetDays));
        BigDecimal mkd = result.multiply(rate.value).setScale(2, RoundingMode.HALF_UP);
        BigDecimal rowTax = taxableGainForHoldingPeriod(result, holdingDays).multiply(rate.value).multiply((security ? securitiesTaxRate : forexTaxRate).movePointLeft(2)).setScale(2, RoundingMode.HALF_UP);
        RealizedGainRow row = new RealizedGainRow(security ? "Securities" : "Forex", symbol, date.toString(), rate.date.toString(), result, rate.value, mkd, rowTax, holdingDays);
        if (forex) forexRows.add(row); else rows.add(row);
      }
    }
    if (!tradesHeader) throw new IllegalArgumentException("This does not look like an IBKR Activity Statement CSV: the Trades section is missing.");
    List<DividendRow> dividends = new ArrayList<>();
    for (Map.Entry<DividendKey, DividendAmounts> entry : dividendAmountsByKey.entrySet()) {
      Rate rate = rate(entry.getKey().date().minusDays(offsetDays));
      BigDecimal grossUsd = entry.getValue().grossUsd();
      BigDecimal withholdingUsd = entry.getValue().withholdingUsd();
      BigDecimal netUsd = grossUsd.subtract(withholdingUsd);
      BigDecimal grossMkd = grossUsd.multiply(rate.value).setScale(2, RoundingMode.HALF_UP);
      BigDecimal withholdingMkd = withholdingUsd.multiply(rate.value).setScale(2, RoundingMode.HALF_UP);
      BigDecimal netMkd = netUsd.multiply(rate.value).setScale(2, RoundingMode.HALF_UP);
      BigDecimal dividendTax = grossMkd.multiply(dividendTaxRate.movePointLeft(2)).setScale(2, RoundingMode.HALF_UP);
      dividends.add(new DividendRow(entry.getKey().date().toString(), rate.date.toString(), entry.getKey().symbol(), entry.getKey().description(), grossUsd, withholdingUsd, netUsd, rate.value, grossMkd, withholdingMkd, netMkd, dividendTax));
    }
    BigDecimal usd = rows.stream().map(RealizedGainRow::usdResult).reduce(BigDecimal.ZERO, BigDecimal::add);
    BigDecimal mkd = rows.stream().map(RealizedGainRow::mkdResult).reduce(BigDecimal.ZERO, BigDecimal::add).setScale(2, RoundingMode.HALF_UP);
    BigDecimal dividendGrossUsd = dividends.stream().map(DividendRow::grossUsd).reduce(BigDecimal.ZERO, BigDecimal::add);
    BigDecimal dividendWithholdingUsd = dividends.stream().map(DividendRow::withholdingUsd).reduce(BigDecimal.ZERO, BigDecimal::add);
    BigDecimal dividendNetUsd = dividends.stream().map(DividendRow::netUsd).reduce(BigDecimal.ZERO, BigDecimal::add);
    BigDecimal dividendGrossMkd = dividends.stream().map(DividendRow::grossMkd).reduce(BigDecimal.ZERO, BigDecimal::add).setScale(2, RoundingMode.HALF_UP);
    BigDecimal dividendWithholdingMkd = dividends.stream().map(DividendRow::withholdingMkd).reduce(BigDecimal.ZERO, BigDecimal::add).setScale(2, RoundingMode.HALF_UP);
    BigDecimal dividendNetMkd = dividends.stream().map(DividendRow::netMkd).reduce(BigDecimal.ZERO, BigDecimal::add).setScale(2, RoundingMode.HALF_UP);
    BigDecimal dividendTaxMkd = dividendGrossMkd.multiply(dividendTaxRate.movePointLeft(2)).setScale(2, RoundingMode.HALF_UP);
    BigDecimal stockTaxBaseMkd = sectionTaxBase(rows, offsetSecuritiesLosses);
    BigDecimal stockTaxMkd = stockTaxBaseMkd.multiply(securitiesTaxRate.movePointLeft(2)).setScale(2, RoundingMode.HALF_UP);
    BigDecimal forexUsd = forexRows.stream().map(RealizedGainRow::usdResult).reduce(BigDecimal.ZERO, BigDecimal::add);
    BigDecimal forexMkd = forexRows.stream().map(RealizedGainRow::mkdResult).reduce(BigDecimal.ZERO, BigDecimal::add).setScale(2, RoundingMode.HALF_UP);
    BigDecimal forexTaxBaseMkd = sectionTaxBase(forexRows, offsetForexLosses);
    BigDecimal forexTaxMkd = forexTaxBaseMkd.multiply(forexTaxRate.movePointLeft(2)).setScale(2, RoundingMode.HALF_UP);
    BigDecimal taxableIncomeMkd = (includeSecurities ? stockTaxBaseMkd : BigDecimal.ZERO).add(includeDividends ? dividendGrossMkd : BigDecimal.ZERO).add(includeForex ? forexTaxBaseMkd : BigDecimal.ZERO).add(includeInterest ? interest.stream().map(InterestRow::mkdAmount).filter(value -> value.signum() > 0).reduce(BigDecimal.ZERO, BigDecimal::add) : BigDecimal.ZERO).setScale(2, RoundingMode.HALF_UP);
    BigDecimal tax = (includeSecurities ? stockTaxMkd : BigDecimal.ZERO).add(includeDividends ? dividendTaxMkd : BigDecimal.ZERO).setScale(2, RoundingMode.HALF_UP);
    BigDecimal interestPaidUsd = interest.stream().map(InterestRow::usdAmount).reduce(BigDecimal.ZERO, BigDecimal::add);
    BigDecimal interestPaidMkd = interest.stream().map(InterestRow::mkdAmount).reduce(BigDecimal.ZERO, BigDecimal::add).setScale(2, RoundingMode.HALF_UP);
    BigDecimal interestIncomeUsd = interest.stream().map(InterestRow::usdAmount).filter(amount -> amount.signum() > 0).reduce(BigDecimal.ZERO, BigDecimal::add);
    BigDecimal interestIncomeMkd = interest.stream().map(InterestRow::mkdAmount).filter(amount -> amount.signum() > 0).reduce(BigDecimal.ZERO, BigDecimal::add).setScale(2, RoundingMode.HALF_UP);
    BigDecimal interestChargesUsd = interest.stream().map(InterestRow::usdAmount).filter(amount -> amount.signum() < 0).reduce(BigDecimal.ZERO, BigDecimal::add);
    BigDecimal interestChargesMkd = interest.stream().map(InterestRow::mkdAmount).filter(amount -> amount.signum() < 0).reduce(BigDecimal.ZERO, BigDecimal::add).setScale(2, RoundingMode.HALF_UP);
    BigDecimal interestTaxMkd = interest.stream().map(InterestRow::estimatedTaxMkd).reduce(BigDecimal.ZERO, BigDecimal::add).setScale(2, RoundingMode.HALF_UP);
    if (includeInterest) tax = tax.add(interestTaxMkd).setScale(2, RoundingMode.HALF_UP);
    if (includeForex) tax = tax.add(forexTaxMkd).setScale(2, RoundingMode.HALF_UP);
    if (offsetAcrossSections) { taxableIncomeMkd = globalOffsetTaxableBase(rows, forexRows, dividends, interest, includeSecurities, includeDividends, includeForex, includeInterest); tax = globalOffsetTax(rows, forexRows, dividends, interest, securitiesTaxRate, dividendTaxRate, forexTaxRate, interestTaxRate, includeSecurities, includeDividends, includeForex, includeInterest); }
    return new RealizedGainsResponse(fileName == null ? "uploaded.csv" : fileName, rows.size(), usd, mkd, tax, taxableIncomeMkd, offsetDays, stockTradeRows, excludedNonStockRows, excludedLossRows, skippedRows, dividendGrossUsd, dividendWithholdingUsd, dividendNetUsd, dividendGrossMkd, dividendWithholdingMkd, dividendNetMkd, dividendTaxMkd, interestPaidUsd, interestPaidMkd, interestIncomeUsd, interestIncomeMkd, interestChargesUsd, interestChargesMkd, interestTaxMkd, stockTaxMkd, forexUsd, forexMkd, forexTaxMkd, rows, forexRows, dividends, interest);
  }

  private static BigDecimal sectionTaxBase(List<RealizedGainRow> rows, boolean offsetLosses) {
    BigDecimal positiveBase = rows.stream().filter(row -> row.usdResult().signum() > 0).map(row -> taxableGainForHoldingPeriod(row.usdResult(), row.holdingDays()).multiply(row.mkdRate())).reduce(BigDecimal.ZERO, BigDecimal::add);
    BigDecimal negativeBase = rows.stream().map(RealizedGainRow::mkdResult).filter(value -> value.signum() < 0).map(BigDecimal::abs).reduce(BigDecimal.ZERO, BigDecimal::add);
    BigDecimal taxableBase = offsetLosses ? positiveBase.subtract(negativeBase).max(BigDecimal.ZERO) : positiveBase;
    return taxableBase.setScale(2, RoundingMode.HALF_UP);
  }

  private static BigDecimal globalOffsetTaxableBase(List<RealizedGainRow> securities, List<RealizedGainRow> forex, List<DividendRow> dividends, List<InterestRow> interest, boolean includeSecurities, boolean includeDividends, boolean includeForex, boolean includeInterest) {
    BigDecimal positive = (includeSecurities ? securities.stream().filter(row -> row.usdResult().signum() > 0).map(row -> taxableGainForHoldingPeriod(row.usdResult(), row.holdingDays()).multiply(row.mkdRate())).reduce(BigDecimal.ZERO, BigDecimal::add) : BigDecimal.ZERO).add(includeDividends ? dividends.stream().map(DividendRow::grossMkd).reduce(BigDecimal.ZERO, BigDecimal::add) : BigDecimal.ZERO).add(includeForex ? forex.stream().map(RealizedGainRow::mkdResult).filter(value -> value.signum() > 0).reduce(BigDecimal.ZERO, BigDecimal::add) : BigDecimal.ZERO).add(includeInterest ? interest.stream().map(InterestRow::mkdAmount).filter(value -> value.signum() > 0).reduce(BigDecimal.ZERO, BigDecimal::add) : BigDecimal.ZERO);
    BigDecimal losses = (includeSecurities ? securities.stream().map(RealizedGainRow::mkdResult).filter(value -> value.signum() < 0).map(BigDecimal::abs).reduce(BigDecimal.ZERO, BigDecimal::add) : BigDecimal.ZERO).add(includeForex ? forex.stream().map(RealizedGainRow::mkdResult).filter(value -> value.signum() < 0).map(BigDecimal::abs).reduce(BigDecimal.ZERO, BigDecimal::add) : BigDecimal.ZERO).add(includeInterest ? interest.stream().map(InterestRow::mkdAmount).filter(value -> value.signum() < 0).map(BigDecimal::abs).reduce(BigDecimal.ZERO, BigDecimal::add) : BigDecimal.ZERO);
    return positive.subtract(losses).max(BigDecimal.ZERO).setScale(2, RoundingMode.HALF_UP);
  }

  private static BigDecimal globalOffsetTax(List<RealizedGainRow> securities, List<RealizedGainRow> forex, List<DividendRow> dividends, List<InterestRow> interest, BigDecimal securitiesRate, BigDecimal dividendRate, BigDecimal forexRate, BigDecimal interestRate, boolean includeSecurities, boolean includeDividends, boolean includeForex, boolean includeInterest) {
    BigDecimal[] positiveBases = {
      includeSecurities ? securities.stream().filter(row -> row.usdResult().signum() > 0).map(row -> taxableGainForHoldingPeriod(row.usdResult(), row.holdingDays()).multiply(row.mkdRate())).reduce(BigDecimal.ZERO, BigDecimal::add) : BigDecimal.ZERO,
      includeDividends ? dividends.stream().map(DividendRow::grossMkd).filter(value -> value.signum() > 0).reduce(BigDecimal.ZERO, BigDecimal::add) : BigDecimal.ZERO,
      includeForex ? forex.stream().map(RealizedGainRow::mkdResult).filter(value -> value.signum() > 0).reduce(BigDecimal.ZERO, BigDecimal::add) : BigDecimal.ZERO,
      includeInterest ? interest.stream().map(InterestRow::mkdAmount).filter(value -> value.signum() > 0).reduce(BigDecimal.ZERO, BigDecimal::add) : BigDecimal.ZERO
    };
    BigDecimal[] rates = { securitiesRate, dividendRate, forexRate, interestRate };
    BigDecimal losses = includeSecurities ? securities.stream().map(RealizedGainRow::mkdResult).filter(value -> value.signum() < 0).map(BigDecimal::abs).reduce(BigDecimal.ZERO, BigDecimal::add) : BigDecimal.ZERO;
    if (includeForex) losses = losses.add(forex.stream().map(RealizedGainRow::mkdResult).filter(value -> value.signum() < 0).map(BigDecimal::abs).reduce(BigDecimal.ZERO, BigDecimal::add));
    if (includeInterest) losses = losses.add(interest.stream().map(InterestRow::mkdAmount).filter(value -> value.signum() < 0).map(BigDecimal::abs).reduce(BigDecimal.ZERO, BigDecimal::add));
    BigDecimal tax = BigDecimal.ZERO;
    for (int index = 0; index < positiveBases.length; index++) {
      BigDecimal offset = losses.min(positiveBases[index]);
      positiveBases[index] = positiveBases[index].subtract(offset);
      losses = losses.subtract(offset);
      tax = tax.add(positiveBases[index].multiply(rates[index].movePointLeft(2)));
    }
    return tax.setScale(2, RoundingMode.HALF_UP);
  }

  private static DividendAmounts mergeDividends(DividendAmounts current, DividendAmounts added) {
    return new DividendAmounts(current.grossUsd().add(added.grossUsd()), current.withholdingUsd().add(added.withholdingUsd()));
  }

  static String normalizeDividendDescription(String description) {
    return description.replaceFirst(" - US Tax$", "").replaceFirst(" \\(Ordinary Dividend\\)$", "");
  }

  private static String symbol(String description) {
    int parenthesis = description.indexOf('(');
    return (parenthesis > 0 ? description.substring(0, parenthesis) : description).trim();
  }

  static BigDecimal taxableGainForHoldingPeriod(BigDecimal gain, long holdingDays) {
    if (gain == null || gain.compareTo(BigDecimal.ZERO) <= 0) return BigDecimal.ZERO;
    if (holdingDays >= LONG_TERM_DAYS) return gain.multiply(LONG_TERM_FACTOR).setScale(2, RoundingMode.HALF_UP);
    return gain.setScale(2, RoundingMode.HALF_UP);
  }

  private static long holdingDaysForSell(Deque<TradeLot> lots, LocalDate saleDate, BigDecimal soldQuantity) {
    if (lots == null || lots.isEmpty() || soldQuantity == null || soldQuantity.compareTo(BigDecimal.ZERO) <= 0) return 0L;
    BigDecimal remaining = soldQuantity;
    long holdingDays = 0L;
    for (TradeLot lot : lots) {
      if (remaining.compareTo(BigDecimal.ZERO) <= 0) break;
      if (lot.quantity.compareTo(BigDecimal.ZERO) <= 0) continue;
      BigDecimal matched = remaining.min(lot.quantity);
      if (matched.compareTo(BigDecimal.ZERO) > 0) {
        holdingDays = Math.max(holdingDays, ChronoUnit.DAYS.between(lot.date, saleDate));
        remaining = remaining.subtract(matched);
      }
    }
    return holdingDays;
  }

  private Rate rate(LocalDate requested) throws IOException {
    if (exchangeRates != null) {
      Optional<NbrmExchangeRate> cached = exchangeRates.findByRequestedDate(requested);
      if (cached.isPresent()) return toRate(cached.get());
    }
    String day = API_DATE.format(requested);
    String url = "https://www.nbrm.mk/KLServiceNOV/GetExchangeRate?StartDate=" + day + "&EndDate=" + day;
    try {
      HttpResponse<String> response = http.send(HttpRequest.newBuilder(URI.create(url)).header("Accept", "application/xml").GET().build(), HttpResponse.BodyHandlers.ofString());
      if (response.statusCode() >= 400) throw new IOException("NBRNM returned HTTP " + response.statusCode());
      Document doc = DocumentBuilderFactory.newInstance().newDocumentBuilder().parse(new InputSource(new StringReader(response.body())));
      NodeList entries = doc.getDocumentElement().getChildNodes();
      for (int i = 0; i < entries.getLength(); i++) {
        if (entries.item(i).getNodeType() != Node.ELEMENT_NODE) continue;
        Element entry = (Element) entries.item(i);
        if (!"USD".equals(text(entry, "Oznaka"))) continue;
        BigDecimal middle = new BigDecimal(text(entry, "Sreden"));
        BigDecimal nominal = new BigDecimal(text(entry, "Nomin"));
        LocalDate actual = LocalDate.parse(text(entry, "Datum").substring(0, 10));
        Rate rate = new Rate(actual, middle.divide(nominal, 10, RoundingMode.HALF_UP));
        cacheRate(requested, rate);
        if (!actual.equals(requested)) cacheRate(actual, rate);
        return rate;
      }
    } catch (InterruptedException e) { Thread.currentThread().interrupt(); throw new IOException("NBRNM request interrupted", e); }
    catch (Exception e) { throw new IOException("Could not parse NBRNM response", e); }
    if (requested.isAfter(LocalDate.of(2025, 1, 1))) {
      Rate fallback = rate(requested.minusDays(1));
      cacheRate(requested, fallback);
      return fallback;
    }
    throw new IOException("No USD rate found for " + requested);
  }
  private Rate toRate(NbrmExchangeRate cached) { return new Rate(cached.getEffectiveDate(), cached.getRate()); }
  private void cacheRate(LocalDate requested, Rate rate) {
    if (exchangeRates == null) return;
    exchangeRates.upsert(requested, rate.date, rate.value);
  }
  private static String text(Element parent, String name) { return parent.getElementsByTagName(name).item(0).getTextContent(); }
  private static BigDecimal decimal(String value) { try { return value == null || value.isBlank() ? null : new BigDecimal(value.replace(",", "")); } catch (NumberFormatException e) { return null; } }
  private static List<String> csv(String line) { List<String> cells = new ArrayList<>(); StringBuilder cell = new StringBuilder(); boolean quoted = false; for (int i=0;i<line.length();i++) { char c=line.charAt(i); if(c=='"'){if(quoted&&i+1<line.length()&&line.charAt(i+1)=='"'){cell.append('"');i++;}else quoted=!quoted;}else if(c==','&&!quoted){cells.add(cell.toString());cell.setLength(0);}else cell.append(c);} cells.add(cell.toString()); return cells; }
  private record TradeLot(LocalDate date, BigDecimal quantity) {}
  private record DividendKey(LocalDate date, String symbol, String description) {}
  private record DividendAmounts(BigDecimal grossUsd, BigDecimal withholdingUsd) {}
  private record Rate(LocalDate date, BigDecimal value) {}
}