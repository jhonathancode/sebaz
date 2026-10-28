-- =====================================================================
-- Pagos fijos con expediente completo: todos llevan requerimiento, orden de
-- servicio, memorando de conformidad y comprobante de pago (sin cotizaciones),
-- salvo los que se marquen como simples (dietas del alcalde y regidores:
-- solo requerimiento y comprobante).
-- =====================================================================
alter table pagos_fijos add column if not exists expediente_completo boolean not null default true;
update pagos_fijos set expediente_completo = false where concepto ilike '%dieta%' and expediente_completo;

-- El expediente recuerda con qué flujo nació (los ya hechos no cambian).
alter table expedientes add column if not exists flujo_completo boolean not null default false;

create or replace function fijar_flujo_pago_fijo() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.tipo = 'pago_fijo' and new.pago_fijo_id is not null then
    new.flujo_completo := coalesce((select expediente_completo from pagos_fijos where id = new.pago_fijo_id), false);
  end if;
  return new;
end $$;

drop trigger if exists expedientes_fijar_flujo on expedientes;
create trigger expedientes_fijar_flujo before insert on expedientes
  for each row execute function fijar_flujo_pago_fijo();
