-- El código de cada bien del almacén sigue al último código existente (así nunca choca, aunque los correlativos se hayan reiniciado)
create or replace function emitir_nea(p_mcp uuid, p_fecha date, p_origen text, p_expediente uuid,
                                      p_proveedor text, p_documento_ref text, p_observacion text, p_items jsonb)
returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_item jsonb; v_bien uuid; v_n int := 0; v_desc text; v_und text; v_tipo text;
begin
  if not puede_registrar(p_mcp) then raise exception 'Sin permiso para registrar en el almacén.'; end if;
  if coalesce(jsonb_array_length(p_items), 0) = 0 then raise exception 'Agregue al menos un bien.'; end if;
  if p_expediente is not null then
    select tipo into v_tipo from expedientes where id = p_expediente and mcp_id = p_mcp and estado in ('aprobado', 'rendido');
    if v_tipo is null then raise exception 'El expediente no está aprobado.'; end if;
    if v_tipo <> 'compra' then raise exception 'Solo las compras de bienes entran al almacén.'; end if;
    if not exists (select 1 from conformidades where expediente_id = p_expediente and not anulado) then
      raise exception 'Primero registre la conformidad: los bienes entran al almacén cuando se reciben conformes.';
    end if;
  end if;

  insert into notas_entrada (mcp_id, fecha, origen, expediente_id, proveedor, documento_ref, observacion)
  values (p_mcp, coalesce(p_fecha, current_date), coalesce(p_origen, 'compra'), p_expediente,
          nullif(trim(p_proveedor), ''), nullif(trim(p_documento_ref), ''), nullif(trim(p_observacion), ''))
  returning id into v_id;

  for v_item in select * from jsonb_array_elements(p_items) loop
    v_desc := upper(trim(v_item->>'descripcion'));
    v_und  := upper(coalesce(nullif(trim(v_item->>'unidad'), ''), 'UNIDAD'));
    if v_desc = '' then continue; end if;
    select id into v_bien from almacen_bienes where mcp_id = p_mcp and descripcion = v_desc and unidad = v_und;
    if v_bien is null then
      insert into almacen_bienes (mcp_id, codigo, descripcion, unidad)
      values (p_mcp, coalesce((select max(codigo) from almacen_bienes where mcp_id = p_mcp), 0) + 1, v_desc, v_und)
      returning id into v_bien;
    end if;
    v_n := v_n + 1;
    insert into nota_entrada_items (mcp_id, nea_id, item, bien_id, cantidad, precio_unitario)
    values (p_mcp, v_id, v_n, v_bien, (v_item->>'cantidad')::numeric, coalesce((v_item->>'precio_unitario')::numeric, 0));
  end loop;
  if v_n = 0 then raise exception 'Agregue al menos un bien.'; end if;
  return v_id;
end $$;

grant execute on function emitir_nea(uuid, date, text, uuid, text, text, text, jsonb) to authenticated;
notify pgrst, 'reload schema';
