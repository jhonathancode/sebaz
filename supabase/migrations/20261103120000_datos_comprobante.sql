-- Datos fijos de la MCP para que el comprobante de pago salga completo:
-- codificación programática por fuente, cuentas contables, CCI y tipo de operación.
alter table mcps add column if not exists datos_cp jsonb not null default '{}'::jsonb;
notify pgrst, 'reload schema';
