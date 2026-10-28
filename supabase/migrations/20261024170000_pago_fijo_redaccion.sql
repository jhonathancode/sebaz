-- =====================================================================
-- Un pago fijo recuerda su redacción: la primera vez que se registra (con
-- la sugerencia o editada), esa redacción se guarda y los meses siguientes
-- se usa sola, cambiando únicamente el mes y el año.
-- =====================================================================
alter table pagos_fijos add column if not exists descripcion_modelo text;
alter table pagos_fijos add column if not exists mes_modelo text;

create or replace function guardar_redaccion_pago_fijo() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.pago_fijo_id is not null and new.mes_pagado is not null and new.estado <> 'anulado'
     and (tg_op = 'INSERT' or new.descripcion is distinct from old.descripcion) then
    update pagos_fijos
       set descripcion_modelo = new.descripcion, mes_modelo = new.mes_pagado
     where id = new.pago_fijo_id and mcp_id = new.mcp_id;
  end if;
  return new;
end $$;

drop trigger if exists expedientes_guardar_redaccion on expedientes;
create trigger expedientes_guardar_redaccion after insert or update of descripcion on expedientes
  for each row execute function guardar_redaccion_pago_fijo();
