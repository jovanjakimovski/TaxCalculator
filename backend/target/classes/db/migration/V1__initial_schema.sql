create table vehicles (
  id uuid primary key,
  vin varchar(17) unique,
  primary_plate varchar(32),
  primary_country varchar(2),
  make varchar(120), model varchar(120), model_year integer,
  created_at timestamptz not null default now()
);
create table lookups (
  id uuid primary key,
  input_type varchar(30) not null, input_value varchar(100) not null, country_hint varchar(2),
  vehicle_id uuid references vehicles(id), status varchar(30) not null, created_at timestamptz not null default now()
);
create table source_queries (
  id uuid primary key, lookup_id uuid not null references lookups(id), source_id varchar(100) not null,
  status varchar(30) not null, started_at timestamptz not null, completed_at timestamptz,
  error_message text
);
create table raw_source_data (
  id uuid primary key, source_query_id uuid not null references source_queries(id),
  payload jsonb not null, fetched_at timestamptz not null default now()
);
create table vehicle_facts (
  id uuid primary key, vehicle_id uuid not null references vehicles(id), fact_type varchar(80) not null,
  value jsonb not null, observed_at timestamptz, source_id varchar(100) not null,
  source_query_id uuid not null references source_queries(id), confidence double precision,
  created_at timestamptz not null default now()
);
create table report_flags (
  id uuid primary key, vehicle_id uuid not null references vehicles(id), flag_type varchar(80) not null,
  related_fact_ids uuid[] not null, description text not null, created_at timestamptz not null default now()
);
create index idx_lookups_vehicle_id on lookups(vehicle_id);
create index idx_source_queries_lookup_id on source_queries(lookup_id);
create index idx_vehicle_facts_vehicle_id on vehicle_facts(vehicle_id);
create index idx_report_flags_vehicle_id on report_flags(vehicle_id);

