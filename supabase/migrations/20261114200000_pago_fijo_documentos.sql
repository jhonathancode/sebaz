-- Documentos que debe llevar el expediente de cada pago fijo (se eligen al crear o editar el pago fijo).
alter table pagos_fijos add column if not exists documentos text[] not null default '{}';
