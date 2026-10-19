#!/usr/bin/env bash
# Prueba la migración y las reglas en un Postgres local.
# Uso: PGHOST=... PGPORT=... PGUSER=postgres bash supabase/tests/correr.sh
set -euo pipefail
cd "$(dirname "$0")/.."
psql -v ON_ERROR_STOP=1 -q -c 'drop database if exists prueba_mcp' -c 'create database prueba_mcp'
psql -v ON_ERROR_STOP=1 -q -d prueba_mcp -f tests/stub_supabase.sql
psql -v ON_ERROR_STOP=1 -q -d prueba_mcp -f migrations/20261019000000_esquema_inicial.sql
psql -v ON_ERROR_STOP=1 -q -At -d prueba_mcp -f tests/pruebas_reglas.sql 2>&1 | grep -E 'OK|PASARON|ERROR'
