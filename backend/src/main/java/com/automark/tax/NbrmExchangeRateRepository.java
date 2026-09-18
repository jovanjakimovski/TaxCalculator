package com.automark.tax;

import java.time.LocalDate;
import java.util.Optional;
import java.math.BigDecimal;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.transaction.annotation.Transactional;

public interface NbrmExchangeRateRepository extends JpaRepository<NbrmExchangeRate, LocalDate> {
  Optional<NbrmExchangeRate> findByRequestedDate(LocalDate requestedDate);

  @Modifying
  @Transactional
  @Query(value = "insert into nbrm_exchange_rates (requested_date, effective_date, rate, fetched_at) values (:requestedDate, :effectiveDate, :rate, now()) on conflict (requested_date) do update set effective_date = excluded.effective_date, rate = excluded.rate, fetched_at = excluded.fetched_at", nativeQuery = true)
  void upsert(LocalDate requestedDate, LocalDate effectiveDate, BigDecimal rate);
}
