-- Número de cheque con el que se abrió la caja chica (se repite en todos sus gastos)
alter table cajas_chicas add column if not exists numero_cheque text;
notify pgrst, 'reload schema';
