-- =====================================================================
-- Pagos fijos de la MCP
--   Lista de lo que se paga cada mes (dietas, asesor contable, personal).
--   Cada requerimiento de pago fijo indica qué pago y de qué mes es: así
--   el sistema sabe qué meses ya se pagaron y no deja pagar dos veces el
--   mismo mes.
-- =====================================================================
create table if not exists pagos_fijos (
  id                uuid primary key default gen_random_uuid(),
  mcp_id            uuid not null references mcps(id),
  concepto          text not null,
  beneficiario      text,
  beneficiario_doc  text,
  monto             numeric(12,2) not null check (monto > 0),
  unidad            text not null default 'MES',
  fuente_id         uuid references fuentes(id),
  clasificador      text default '2.3 Bienes y servicios',
  activo            boolean not null default true,
  creado_por        uuid default auth.uid() references perfiles(id),
  creado_en         timestamptz not null default now(),
  unique (mcp_id, concepto)
);

alter table expedientes add column if not exists pago_fijo_id uuid references pagos_fijos(id);
alter table expedientes add column if not exists mes_pagado text;
alter table expedientes drop constraint if exists expedientes_mes_pagado_check;
alter table expedientes add constraint expedientes_mes_pagado_check check (mes_pagado is null or mes_pagado ~ '^\d{4}-(0[1-9]|1[0-2])$');
create unique index if not exists pago_fijo_mes_unico on expedientes (pago_fijo_id, mes_pagado)
  where pago_fijo_id is not null and estado <> 'anulado';

create or replace function validar_expediente_pago_fijo() returns trigger
language plpgsql as $$
begin
  if new.pago_fijo_id is not null then
    if new.tipo <> 'pago_fijo' then
      raise exception 'Solo un requerimiento de pago fijo puede indicar un pago de la lista.';
    end if;
    if new.mes_pagado is null then
      raise exception 'Indique de qué mes es el pago fijo.';
    end if;
    if not exists (select 1 from pagos_fijos where id = new.pago_fijo_id and mcp_id = new.mcp_id) then
      raise exception 'El pago fijo no pertenece a esta MCP.';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists expedientes_pago_fijo_mes on expedientes;
create trigger expedientes_pago_fijo_mes before insert or update on expedientes
  for each row execute function validar_expediente_pago_fijo();

alter table pagos_fijos enable row level security;
drop policy if exists pagos_fijos_ver on pagos_fijos;
create policy pagos_fijos_ver on pagos_fijos for select using (es_miembro(mcp_id));
drop policy if exists pagos_fijos_crear on pagos_fijos;
create policy pagos_fijos_crear on pagos_fijos for insert with check (puede_registrar(mcp_id));
drop policy if exists pagos_fijos_editar on pagos_fijos;
create policy pagos_fijos_editar on pagos_fijos for update using (puede_registrar(mcp_id)) with check (puede_registrar(mcp_id));

drop trigger if exists pagos_fijos_auditoria on pagos_fijos;
create trigger pagos_fijos_auditoria after insert or update on pagos_fijos for each row execute function registrar_auditoria();
drop trigger if exists pagos_fijos_sin_borrado on pagos_fijos;
create trigger pagos_fijos_sin_borrado before delete on pagos_fijos for each row execute function prohibir_borrado();
