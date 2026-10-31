-- DNI, RUC u otro documento de quien recibe el pago en un gasto de caja chica
alter table caja_chica_gastos add column if not exists razon_doc text;
notify pgrst, 'reload schema';
