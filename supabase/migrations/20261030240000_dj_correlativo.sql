-- La declaración jurada de caja chica lleva correlativo automático por año (001-2026, 002-2026…)
create or replace function asignar_numero_dj() returns trigger language plpgsql security definer set search_path = public as $$
declare v_anio int;
begin
  if new.sustento_tipo <> 'DJ' then return new; end if;
  -- Al editar una DJ que ya tenía número, se conserva
  if tg_op = 'UPDATE' and old.sustento_tipo = 'DJ' and old.sustento_numero is not null then
    new.sustento_numero := old.sustento_numero;
    return new;
  end if;
  if new.sustento_numero is null or new.sustento_numero = '' then
    v_anio := extract(year from new.fecha)::int;
    new.sustento_numero := lpad(siguiente_numero(new.mcp_id, 'declaraciones_juradas', v_anio)::text, 3, '0') || '-' || v_anio;
  end if;
  return new;
end $$;

drop trigger if exists caja_gastos_dj on caja_chica_gastos;
create trigger caja_gastos_dj before insert or update on caja_chica_gastos
  for each row execute function asignar_numero_dj();

-- Las DJ ya registradas sin número lo reciben, en el orden en que se crearon
alter table caja_chica_gastos disable trigger user;
do $$
declare r record; v_anio int;
begin
  for r in select id, mcp_id, fecha from caja_chica_gastos where sustento_tipo = 'DJ' and sustento_numero is null order by creado_en loop
    v_anio := extract(year from r.fecha)::int;
    update caja_chica_gastos set sustento_numero = lpad(siguiente_numero(r.mcp_id, 'declaraciones_juradas', v_anio)::text, 3, '0') || '-' || v_anio where id = r.id;
  end loop;
end $$;
alter table caja_chica_gastos enable trigger user;
notify pgrst, 'reload schema';
