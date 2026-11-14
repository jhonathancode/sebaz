-- Qué comprobante entrega el proveedor según el tipo de gasto (se configura en Configuración).
--   · mcps.sustentos_gasto: por tipo de gasto (compra, servicio, pago_fijo) la lista de documentos permitidos.
--   · pagos_fijos.sustentos: documentos permitidos de un pago fijo concreto (ej. dieta del alcalde = planilla simple).
alter table mcps add column if not exists sustentos_gasto jsonb not null default '{}';
alter table pagos_fijos add column if not exists sustentos text[] not null default '{}';
