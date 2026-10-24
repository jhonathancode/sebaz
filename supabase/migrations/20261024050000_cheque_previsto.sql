-- =====================================================================
-- Cheque previsto del pago fijo
--   Al registrar un pago fijo se anota el N° de cheque; al aprobarlo, su
--   comprobante de pago se genera solo con ese cheque.
-- =====================================================================
alter table expedientes add column if not exists cheque_previsto text;
alter table expedientes drop constraint if exists expedientes_cheque_previsto_check;
alter table expedientes add constraint expedientes_cheque_previsto_check check (cheque_previsto is null or cheque_previsto ~ '^\d{4,12}$');
