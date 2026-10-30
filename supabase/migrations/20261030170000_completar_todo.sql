-- =====================================================================
-- «Completar todo»: el requerimiento de compra o servicio puede traer su proveedor,
-- si ya se recibió conforme y el sustento (factura, boleta...). Al aprobarlo el
-- alcalde, la orden, la conformidad y el comprobante de pago se generan solos.
-- =====================================================================
alter table expedientes add column if not exists completar_todo boolean not null default false;
alter table expedientes add column if not exists con_conformidad boolean not null default false;
alter table expedientes add column if not exists sustento_tipo text;
alter table expedientes add column if not exists sustento_numero text;
