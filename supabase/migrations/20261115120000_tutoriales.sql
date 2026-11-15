-- Tutoriales: los administra el superadmin y los ven todas las municipalidades. Nada se borra: se despublican.
create table if not exists tutoriales (
  id          uuid primary key default gen_random_uuid(),
  slug        text not null unique,
  modulo      text not null,
  orden       int  not null default 0,
  titulo      text not null,
  pasos       jsonb not null default '[]'::jsonb,
  consejo     text,
  video_url   text,
  publicado   boolean not null default true,
  creado_en   timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);
alter table tutoriales enable row level security;
drop policy if exists tutoriales_ver on tutoriales;
create policy tutoriales_ver on tutoriales for select using (auth.uid() is not null);
drop policy if exists tutoriales_crear on tutoriales;
create policy tutoriales_crear on tutoriales for insert with check (es_superadmin());
drop policy if exists tutoriales_editar on tutoriales;
create policy tutoriales_editar on tutoriales for update using (es_superadmin()) with check (es_superadmin());
drop trigger if exists tutoriales_sin_borrado on tutoriales;
create trigger tutoriales_sin_borrado before delete on tutoriales for each row execute function prohibir_borrado();

insert into tutoriales (slug, modulo, orden, titulo, pasos, consejo) values
('primeros-1', 'primeros', 1, 'Ingresar al sistema y cambiar mi clave', '["Entre con su correo y la clave que le entregaron (el ojito del campo muestra u oculta lo que escribe).","Abra «Mi cuenta, clave y PIN» en el menú de su nombre.","Escriba una clave nueva de al menos 10 caracteres y guárdela."]'::jsonb, null),
('primeros-2', 'primeros', 2, 'Crear mi PIN de firma', '["Si su municipalidad pide PIN, el sistema se lo pedirá al ingresar.","Elija 4 números que solo usted conozca.","Desde entonces el PIN firma cada requerimiento, aprobación, comprobante y anulación."]'::jsonb, 'Si lo olvida, el administrador puede reiniciarlo.'),
('primeros-3', 'primeros', 3, 'Cómo está organizado el sistema', '["Inicio: lo urgente y lo último que se hizo.","Expedientes: todo gasto, desde el requerimiento hasta el comprobante.","Rendición, Ingresos, Caja chica, Almacén y Contabilidad: cada uno es un módulo que el administrador puede activar.","Reportes: listados y cuadros en PDF y Excel."]'::jsonb, null),
('expedientes-1', 'expedientes', 1, 'Crear un requerimiento nuevo', '["En Expedientes pulse «Nuevo requerimiento».","Elija el tipo: compra, servicio o pago fijo.","Describa lo que se requiere, agregue los ítems con cantidad y precio, y elija la fuente que paga.","Guarde: el sistema le da su número (por ejemplo 008-2026)."]'::jsonb, null),
('expedientes-2', 'expedientes', 2, 'Seguir un expediente: cotizaciones, orden, conformidad y comprobante', '["Abra el expediente: arriba verá los pasos en orden.","Registre las cotizaciones y elija la ganadora.","Genere la orden de compra o de servicio.","Cuando llegue el bien o servicio, genere la conformidad.","Por último, emita el comprobante de pago con su número de cheque."]'::jsonb, 'Los pasos hechos se ven marcados; el siguiente aparece con borde azul.'),
('expedientes-3', 'expedientes', 3, 'Pagar los pagos fijos del mes en un clic', '["En Expedientes pulse «Pagos fijos del mes» (solo aparece si hay meses por registrar).","Deje marcados los que quiere generar (dietas, personal, asesores).","Si quiere, escriba el primer número de cheque: los demás siguen en orden.","Confirme con su PIN. Se crea cada requerimiento con su monto y planilla."]'::jsonb, null),
('expedientes-4', 'expedientes', 4, 'Adjuntar documentos (contrato, informe, DNI, recibos)', '["Abra el expediente y vaya a «Documentos».","Pulse el documento que falta y suba la foto o el PDF.","En pagos fijos, lo permanente (DNI, credencial, contrato anual) se sube una vez en Configuración y vale todos los meses."]'::jsonb, null),
('expedientes-5', 'expedientes', 5, 'Subir el contrato de un servicio externo (por ejemplo, pintado del local)', '["Abra el expediente del servicio.","En «Documentos» verá «Contrato» e «Informe de trabajo» como pendientes.","Súbalos desde ahí: quedan en ese expediente."]'::jsonb, null),
('expedientes-6', 'expedientes', 6, 'Aprobar requerimientos (alcalde)', '["Abra «Por aprobar» en el menú.","Revise el requerimiento o comprobante.","Apruebe con su PIN o devuélvalo con el motivo."]'::jsonb, 'Si la municipalidad desactiva esta pestaña, todo se aprueba solo al registrarse.'),
('expedientes-7', 'expedientes', 7, 'Anular un expediente', '["En la lista pulse «Anular» en la fila del expediente.","Escriba el motivo (mínimo 10 letras) y confirme con su PIN.","Nada se borra: queda como anulado con su motivo, quién y cuándo."]'::jsonb, null),
('expedientes-8', 'expedientes', 8, 'Imprimir o descargar los documentos', '["Abra el expediente y elija el documento a la derecha.","Use «Descargar PDF» o «Imprimir».","Para todo el expediente, elija «Expediente completo»."]'::jsonb, null),
('rendicion-1', 'rendicion', 1, 'Generar la rendición del mes', '["Abra Rendición y elija el mes y la fuente.","Marque los comprobantes que se rinden: a la derecha ve cuánto lleva marcado frente a lo transferido.","Cuando el cuadre esté en orden, pulse «Generar rendición»."]'::jsonb, null),
('rendicion-2', 'rendicion', 2, 'Descargar la rendición con todos sus anexos en un solo PDF', '["Abra la rendición generada.","Pulse «Paquete completo con anexos» y revise lo que se muestra.","Pulse «Descargar paquete completo (PDF)»: trae el informe, los documentos de cada expediente y sus fotos y PDFs adjuntos."]'::jsonb, 'Si hay muchos expedientes puede tardar un poco: espere a que termine.'),
('rendicion-3', 'rendicion', 3, 'Marcar como entregada o anular', '["Cuando entregue el informe impreso, pulse «Marcar como entregada».","Para corregir, use «Anular rendición» con su motivo: los comprobantes quedan libres otra vez."]'::jsonb, null),
('ingresos-1', 'ingresos', 1, 'Emitir un recibo de ingreso', '["Abra Ingresos y pulse para registrar un recibo.","Escriba el DNI o RUC: el nombre se completa solo.","Elija el rubro y el concepto, ponga el monto y guarde."]'::jsonb, null),
('ingresos-2', 'ingresos', 2, 'Ver, imprimir o anular un recibo', '["Pulse «Ver recibo»: se abre una ventana emergente.","Elija «Descargar PDF» o «Imprimir».","Para anular, use «Anular» con su motivo."]'::jsonb, null),
('ingresos-3', 'ingresos', 3, 'Ver el cuadro del año', '["En Ingresos elija la vista anual.","Verá cada mes con los recibos emitidos, el rango de números y el total.","Descargue el Excel si lo necesita."]'::jsonb, null),
('caja_chica-1', 'caja_chica', 1, 'Abrir la caja chica del mes', '["Cree un requerimiento de apertura de caja chica en Expedientes.","Genere su comprobante.","Abra Caja chica: el expediente aparece enlazado a la caja del mes."]'::jsonb, null),
('caja_chica-2', 'caja_chica', 2, 'Registrar los gastos de la caja', '["Abra la caja del mes.","Agregue cada gasto con fecha, sustento (boleta, factura o declaración jurada), razón social, concepto y monto.","El sistema avisa si el gasto pasa el saldo del fondo."]'::jsonb, null),
('caja_chica-3', 'caja_chica', 3, 'Cerrar (liquidar) la caja', '["Revise que los gastos estén completos.","Liquide la caja: queda cerrada y el saldo vuelve a su lugar.","Descargue su hoja del mes en PDF o Excel."]'::jsonb, null),
('almacen-1', 'almacen', 1, 'Ingresar bienes con una NEA', '["Cuando un expediente de compra tiene conformidad, genere la nota de entrada a almacén.","Revise los bienes y cantidades.","Los bienes suben al stock con su costo."]'::jsonb, null),
('almacen-2', 'almacen', 2, 'Entregar bienes con una PECOSA', '["Abra Almacén y cree una PECOSA.","Indique el área que solicita y los bienes con su cantidad.","El stock baja al guardar."]'::jsonb, null),
('almacen-3', 'almacen', 3, 'Ver el kardex de un bien', '["En Almacén busque el bien.","Abra su kardex para ver entradas, salidas y saldo.","Descargue el Excel si lo necesita."]'::jsonb, null),
('contabilidad-1', 'contabilidad', 1, 'Conciliar el estado de cuenta con el banco', '["Abra Estados de cuenta y elija el mes.","Pulse «Importar estado de cuenta (Excel o CSV)» con el archivo del banco: se leen los movimientos y se enlazan solos los cheques, transferencias e ITF que coinciden.","Revise los que quedaron sin enlace y elíjalos a mano.","Guarde: el sistema marca los cheques cobrados."]'::jsonb, 'El archivo debe tener columnas de cargo/retiro y abono/depósito.'),
('contabilidad-2', 'contabilidad', 2, 'Libros y resumen del mes', '["Abra Contabilidad y elija el libro: bancos, caja o diario.","Elija el mes.","Descargue en PDF o Excel."]'::jsonb, null),
('contabilidad-3', 'contabilidad', 3, 'Balance anual', '["Abra Balance anual.","Cargue la apertura del año si es el primero.","Revise el balance constructivo y descárguelo."]'::jsonb, null),
('registro_civil-1', 'registro_civil', 1, 'Registrar y buscar actas y partidas', '["Abra Padrón.","Agregue el acta o partida con sus datos.","Use el buscador para encontrar por nombre o documento."]'::jsonb, null),
('secretaria-1', 'secretaria', 1, 'Emitir un oficio, carta o acuerdo', '["Abra Secretaría y elija el tipo de documento.","Complete destinatario, asunto y contenido.","Guarde: recibe su número correlativo y puede imprimirlo."]'::jsonb, null),
('reportes-1', 'reportes', 1, 'Sacar un reporte en PDF o Excel', '["Abra Reportes y elija el reporte.","Escoja el período.","Descárguelo en PDF o Excel."]'::jsonb, null),
('reportes-2', 'reportes', 2, 'Informe de transferencia de gestión', '["En Reportes, sección «Cambio de gestión», abra el informe.","Revise cuentas, cheques sin cobrar, trámites pendientes, compromisos, almacén y numeración.","Imprímalo o descárguelo en PDF y fírmenlo el saliente, el entrante y el alcalde."]'::jsonb, null),
('configuracion-1', 'configuracion', 1, 'Datos y logo de la municipalidad', '["Abra Configuración → Identidad y logo.","Complete RUC, dirección y cuenta bancaria, y suba el logo.","Salen en el encabezado de todos los formatos."]'::jsonb, null),
('configuracion-2', 'configuracion', 2, 'Configurar pagos fijos (dietas, personal, asesores)', '["Abra Configuración → Pagos fijos.","Agregue el concepto, beneficiario, monto y fuente.","Marque qué documentos lleva y suba los permanentes (DNI, credencial, contrato anual)."]'::jsonb, null),
('configuracion-3', 'configuracion', 3, 'Fuentes de ingresos y plazos', '["Abra Configuración → Dinero y plazos.","Agregue la institución que transfiere, el monto, cada cuánto llega y el día límite para rendir."]'::jsonb, null),
('configuracion-4', 'configuracion', 4, 'Numeración de documentos', '["Abra Configuración → Numeración.","Verá el próximo número de cada documento.","Si empieza a mitad de año, fije el último número ya emitido."]'::jsonb, null),
('configuracion-5', 'configuracion', 5, 'PIN, aprobaciones y cierre de mes', '["Abra Configuración → Seguridad y cierre de mes.","Active o desactive el PIN personal y la pestaña «Por aprobar».","Cierre el mes cuando termine: un mes cerrado ya no acepta cambios; solo el administrador lo reabre con motivo."]'::jsonb, null),
('configuracion-6', 'configuracion', 6, 'Dar acceso de solo lectura al alcalde, regidores o fiscalizador', '["Abra Configuración → Seguridad.","En «Acceso de solo lectura» pulse «Crear enlace» y escriba para quién es.","Copie el enlace (se muestra una sola vez) y envíelo por WhatsApp.","Para quitar el acceso, pulse «Revocar» con su motivo."]'::jsonb, null),
('configuracion-7', 'configuracion', 7, 'Descargar el respaldo de toda la información', '["Abra Configuración → Seguridad.","Pulse «Descargar respaldo (Excel)».","Guárdelo en un lugar seguro, por ejemplo al cerrar cada año o al cambiar de gestión."]'::jsonb, null),
('gestion-1', 'gestion', 1, 'Relevar al tesorero o al alcalde', '["Abra «Responsables y relevos».","Registre al saliente y al entrante con su fecha.","Lo anterior al relevo tiene 30 días de gracia para corregirse y luego se bloquea.","Genere el informe de transferencia de gestión en Reportes."]'::jsonb, null)
on conflict (slug) do nothing;
