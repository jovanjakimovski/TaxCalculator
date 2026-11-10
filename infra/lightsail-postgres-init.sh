#!/bin/sh
set -eu

# This runs only when the PostgreSQL volume is initialized for the first time.
psql --set=ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" \
  --set=tax_password="$TAX_DB_PASSWORD" \
  --set=license_password="$LICENSE_DB_PASSWORD" <<'SQL'
CREATE ROLE taxcalculator LOGIN PASSWORD :'tax_password';
CREATE DATABASE taxcalculator OWNER taxcalculator;
CREATE ROLE license LOGIN PASSWORD :'license_password';
CREATE DATABASE license OWNER license;
SQL
