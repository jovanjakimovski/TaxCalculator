create table nbrm_exchange_rates (
  requested_date date primary key,
  effective_date date not null,
  rate numeric(20,10) not null,
  fetched_at timestamptz not null default now()
);
create index idx_nbrm_exchange_rates_effective_date on nbrm_exchange_rates(effective_date);
