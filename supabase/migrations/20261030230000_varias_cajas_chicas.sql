-- Varias cajas chicas en el mismo mes y fuente (cada una con su cheque y su N° dentro del mes)
do $$
declare r record;
begin
  for r in
    select conname from pg_constraint
    where conrelid = 'cajas_chicas'::regclass and contype = 'u'
      and conkey = (select array_agg(attnum order by attnum) from pg_attribute
                    where attrelid = 'cajas_chicas'::regclass and attname in ('mcp_id', 'periodo', 'fuente_id'))
  loop
    execute format('alter table cajas_chicas drop constraint %I', r.conname);
  end loop;
end $$;

alter table cajas_chicas add column if not exists numero int;
update cajas_chicas c set numero = x.n
from (select id, row_number() over (partition by mcp_id, periodo, fuente_id order by creado_en) n from cajas_chicas) x
where x.id = c.id and c.numero is null;

create or replace function asignar_numero_caja() returns trigger language plpgsql as $$
begin
  select coalesce(max(numero), 0) + 1 into new.numero from cajas_chicas
    where mcp_id = new.mcp_id and periodo = new.periodo and fuente_id = new.fuente_id;
  return new;
end $$;
drop trigger if exists cajas_chicas_numero on cajas_chicas;
create trigger cajas_chicas_numero before insert on cajas_chicas
  for each row execute function asignar_numero_caja();

create unique index if not exists cajas_chicas_numero_uq on cajas_chicas (mcp_id, periodo, fuente_id, numero);

-- La liquidación indica de qué caja es cuando el mes tiene más de una
create or replace function liquidar_caja_chica(p_caja uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_caja cajas_chicas; v_total numeric; v_cp uuid; v_resp text;
begin
  select * into v_caja from cajas_chicas where id = p_caja for update;
  if not found then raise exception 'Caja chica no encontrada.'; end if;
  if not tiene_rol(v_caja.mcp_id, array['admin','tesorero']::rol_mcp[]) then
    raise exception 'Sin permiso para liquidar la caja chica.';
  end if;
  if v_caja.estado <> 'abierta' then raise exception 'La caja chica ya no está abierta.'; end if;
  select coalesce(sum(monto), 0) into v_total from caja_chica_gastos where caja_id = p_caja and not anulado;
  if v_total = 0 then raise exception 'La caja chica no tiene gastos.'; end if;
  select nombre into v_resp from perfiles where id = v_caja.responsable_id;

  insert into comprobantes_pago (mcp_id, anio, fecha, origen, caja_id, fuente_id, beneficiario,
                                 concepto, importe, partida, funcion, categoria, cheque)
  values (v_caja.mcp_id, left(v_caja.periodo, 4)::int,
          least(current_date, (to_date(v_caja.periodo, 'YYYY-MM') + interval '1 month - 1 day')::date),
          'caja_chica', p_caja, v_caja.fuente_id, coalesce(v_resp, 'Responsable del fondo'),
          'Liquidación de caja chica ' || v_caja.periodo || case when v_caja.numero > 1 then ' (caja ' || v_caja.numero || ')' else '' end, v_total, '2.3 Bienes y servicios',
          'Administrativa del Estado', 'Gastos operativos diversos', v_caja.numero_cheque)
  returning id into v_cp;

  update cajas_chicas set estado = 'liquidada', comprobante_id = v_cp where id = p_caja;
  return v_cp;
end $$;
notify pgrst, 'reload schema';
