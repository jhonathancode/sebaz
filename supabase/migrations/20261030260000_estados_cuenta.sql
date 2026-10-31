-- Estados de cuenta corriente del banco (Banco de la Nación): la tesorera sube la foto o el PDF que saca del banco
create table if not exists estados_cuenta (
  id              uuid primary key default gen_random_uuid(),
  mcp_id          uuid not null references mcps(id),
  periodo         text not null check (periodo ~ '^\d{4}-\d{2}$'),
  banco           text not null default 'Banco de la Nación',
  cuenta          text,
  archivo_path    text not null,
  archivo_nombre  text not null,
  archivo_tipo    text not null,
  archivo_tamano  int  not null,
  nota            text,
  anulado         boolean not null default false,
  anulado_motivo  text,
  creado_por      uuid default auth.uid() references perfiles(id),
  creado_en       timestamptz not null default now()
);
create index if not exists estados_cuenta_mcp_periodo on estados_cuenta (mcp_id, periodo);

alter table estados_cuenta enable row level security;
drop policy if exists estados_cuenta_ver on estados_cuenta;
create policy estados_cuenta_ver on estados_cuenta for select using (es_miembro(mcp_id));
drop policy if exists estados_cuenta_crear on estados_cuenta;
create policy estados_cuenta_crear on estados_cuenta for insert with check (puede_registrar(mcp_id));
drop policy if exists estados_cuenta_editar on estados_cuenta;
create policy estados_cuenta_editar on estados_cuenta for update using (puede_registrar(mcp_id)) with check (puede_registrar(mcp_id));

drop trigger if exists estados_cuenta_auditoria on estados_cuenta;
create trigger estados_cuenta_auditoria after insert or update on estados_cuenta for each row execute function registrar_auditoria();
drop trigger if exists estados_cuenta_sin_borrado on estados_cuenta;
create trigger estados_cuenta_sin_borrado before delete on estados_cuenta for each row execute function prohibir_borrado();
drop trigger if exists estados_cuenta_anulable on estados_cuenta;
create trigger estados_cuenta_anulable before update on estados_cuenta for each row execute function validar_anulable();

-- Anular exige un motivo
create or replace function validar_estado_cuenta() returns trigger language plpgsql as $$
begin
  if new.anulado and coalesce(length(trim(new.anulado_motivo)), 0) < 10 then
    raise exception 'Para anular escriba un motivo de al menos 10 caracteres.';
  end if;
  return new;
end $$;
drop trigger if exists estados_cuenta_motivo on estados_cuenta;
create trigger estados_cuenta_motivo before update on estados_cuenta for each row execute function validar_estado_cuenta();

notify pgrst, 'reload schema';
