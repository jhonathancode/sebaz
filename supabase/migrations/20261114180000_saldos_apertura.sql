-- =====================================================================
-- Apertura del balance: saldo al 1 de enero de cada cuenta contable
-- (cuentas por cobrar, entregas a rendir, activos, cuentas por pagar, hacienda).
-- El banco y la caja salen de saldos_iniciales y los resultados acumulados se
-- calculan solos para que la apertura cuadre.
-- =====================================================================
create table if not exists saldos_apertura (
  id          uuid primary key default gen_random_uuid(),
  mcp_id      uuid not null references mcps(id),
  anio        int  not null,
  cuenta      text not null,
  debe        numeric(14,2) not null default 0 check (debe >= 0),
  haber       numeric(14,2) not null default 0 check (haber >= 0),
  creado_por  uuid default auth.uid() references perfiles(id),
  creado_en   timestamptz not null default now(),
  unique (mcp_id, anio, cuenta)
);

alter table saldos_apertura enable row level security;
drop policy if exists saldos_apertura_ver on saldos_apertura;
create policy saldos_apertura_ver on saldos_apertura for select using (es_miembro(mcp_id));
drop policy if exists saldos_apertura_crear on saldos_apertura;
create policy saldos_apertura_crear on saldos_apertura for insert with check (puede_registrar(mcp_id));
drop policy if exists saldos_apertura_editar on saldos_apertura;
create policy saldos_apertura_editar on saldos_apertura for update using (puede_registrar(mcp_id)) with check (puede_registrar(mcp_id));
drop trigger if exists saldos_apertura_auditoria on saldos_apertura;
create trigger saldos_apertura_auditoria after insert or update on saldos_apertura for each row execute function registrar_auditoria();
drop trigger if exists saldos_apertura_sin_borrado on saldos_apertura;
create trigger saldos_apertura_sin_borrado before delete on saldos_apertura for each row execute function prohibir_borrado();
