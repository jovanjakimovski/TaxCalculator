package com.automark.tax;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;

@Entity
@Table(name = "nbrm_exchange_rates")
public class NbrmExchangeRate {
  @Id
  @Column(name = "requested_date")
  private LocalDate requestedDate;

  @Column(name = "effective_date", nullable = false)
  private LocalDate effectiveDate;

  @Column(nullable = false, precision = 20, scale = 10)
  private BigDecimal rate;

  @Column(name = "fetched_at", nullable = false)
  private Instant fetchedAt = Instant.now();

  protected NbrmExchangeRate() {}

  public NbrmExchangeRate(LocalDate requestedDate, LocalDate effectiveDate, BigDecimal rate) {
    this.requestedDate = requestedDate;
    this.effectiveDate = effectiveDate;
    this.rate = rate;
  }

  public LocalDate getRequestedDate() { return requestedDate; }
  public LocalDate getEffectiveDate() { return effectiveDate; }
  public BigDecimal getRate() { return rate; }
  public Instant getFetchedAt() { return fetchedAt; }
}
