export type Tutorial = { titulo: string; pasos: string[]; consejo?: string };
export type ModuloTutorial = { clave: string; texto: string; icono: string; modulo?: string; tutoriales: Tutorial[] };

/** Guías paso a paso, ordenadas por módulo. El módulo opcional indica qué módulo debe tener habilitado la MCP para verla. */
export const TUTORIALES: ModuloTutorial[] = [
  {
    clave: "primeros", texto: "Primeros pasos", icono: "🚀",
    tutoriales: [
      { titulo: "Ingresar al sistema y cambiar mi clave", pasos: ["Entre con su correo y la clave que le entregaron (el ojito del campo muestra u oculta lo que escribe).", "Abra «Mi cuenta, clave y PIN» en el menú de su nombre.", "Escriba una clave nueva de al menos 10 caracteres y guárdela."] },
      { titulo: "Crear mi PIN de firma", pasos: ["Si su municipalidad pide PIN, el sistema se lo pedirá al ingresar.", "Elija 4 números que solo usted conozca.", "Desde entonces el PIN firma cada requerimiento, aprobación, comprobante y anulación."], consejo: "Si lo olvida, el administrador puede reiniciarlo." },
      { titulo: "Cómo está organizado el sistema", pasos: ["Inicio: lo urgente y lo último que se hizo.", "Expedientes: todo gasto, desde el requerimiento hasta el comprobante.", "Rendición, Ingresos, Caja chica, Almacén y Contabilidad: cada uno es un módulo que el administrador puede activar.", "Reportes: listados y cuadros en PDF y Excel."] },
    ],
  },
  {
    clave: "expedientes", texto: "Expedientes (gastos)", icono: "📁",
    tutoriales: [
      { titulo: "Crear un requerimiento nuevo", pasos: ["En Expedientes pulse «Nuevo requerimiento».", "Elija el tipo: compra, servicio o pago fijo.", "Describa lo que se requiere, agregue los ítems con cantidad y precio, y elija la fuente que paga.", "Guarde: el sistema le da su número (por ejemplo 008-2026)."] },
      { titulo: "Seguir un expediente: cotizaciones, orden, conformidad y comprobante", pasos: ["Abra el expediente: arriba verá los pasos en orden.", "Registre las cotizaciones y elija la ganadora.", "Genere la orden de compra o de servicio.", "Cuando llegue el bien o servicio, genere la conformidad.", "Por último, emita el comprobante de pago con su número de cheque."], consejo: "Los pasos hechos se ven marcados; el siguiente aparece con borde azul." },
      { titulo: "Pagar los pagos fijos del mes en un clic", pasos: ["En Expedientes pulse «Pagos fijos del mes» (solo aparece si hay meses por registrar).", "Deje marcados los que quiere generar (dietas, personal, asesores).", "Si quiere, escriba el primer número de cheque: los demás siguen en orden.", "Confirme con su PIN. Se crea cada requerimiento con su monto y planilla."] },
      { titulo: "Adjuntar documentos (contrato, informe, DNI, recibos)", pasos: ["Abra el expediente y vaya a «Documentos».", "Pulse el documento que falta y suba la foto o el PDF.", "En pagos fijos, lo permanente (DNI, credencial, contrato anual) se sube una vez en Configuración y vale todos los meses."] },
      { titulo: "Subir el contrato de un servicio externo (por ejemplo, pintado del local)", pasos: ["Abra el expediente del servicio.", "En «Documentos» verá «Contrato» e «Informe de trabajo» como pendientes.", "Súbalos desde ahí: quedan en ese expediente."] },
      { titulo: "Aprobar requerimientos (alcalde)", pasos: ["Abra «Por aprobar» en el menú.", "Revise el requerimiento o comprobante.", "Apruebe con su PIN o devuélvalo con el motivo."], consejo: "Si la municipalidad desactiva esta pestaña, todo se aprueba solo al registrarse." },
      { titulo: "Anular un expediente", pasos: ["En la lista pulse «Anular» en la fila del expediente.", "Escriba el motivo (mínimo 10 letras) y confirme con su PIN.", "Nada se borra: queda como anulado con su motivo, quién y cuándo."] },
      { titulo: "Imprimir o descargar los documentos", pasos: ["Abra el expediente y elija el documento a la derecha.", "Use «Descargar PDF» o «Imprimir».", "Para todo el expediente, elija «Expediente completo»."] },
    ],
  },
  {
    clave: "rendicion", texto: "Rendición", icono: "📑", modulo: "rendicion",
    tutoriales: [
      { titulo: "Generar la rendición del mes", pasos: ["Abra Rendición y elija el mes y la fuente.", "Marque los comprobantes que se rinden: a la derecha ve cuánto lleva marcado frente a lo transferido.", "Cuando el cuadre esté en orden, pulse «Generar rendición»."] },
      { titulo: "Descargar la rendición con todos sus anexos en un solo PDF", pasos: ["Abra la rendición generada.", "Pulse «Paquete completo con anexos» y revise lo que se muestra.", "Pulse «Descargar paquete completo (PDF)»: trae el informe, los documentos de cada expediente y sus fotos y PDFs adjuntos."], consejo: "Si hay muchos expedientes puede tardar un poco: espere a que termine." },
      { titulo: "Marcar como entregada o anular", pasos: ["Cuando entregue el informe impreso, pulse «Marcar como entregada».", "Para corregir, use «Anular rendición» con su motivo: los comprobantes quedan libres otra vez."] },
    ],
  },
  {
    clave: "ingresos", texto: "Ingresos propios", icono: "💵", modulo: "ingresos",
    tutoriales: [
      { titulo: "Emitir un recibo de ingreso", pasos: ["Abra Ingresos y pulse para registrar un recibo.", "Escriba el DNI o RUC: el nombre se completa solo.", "Elija el rubro y el concepto, ponga el monto y guarde."] },
      { titulo: "Ver, imprimir o anular un recibo", pasos: ["Pulse «Ver recibo»: se abre una ventana emergente.", "Elija «Descargar PDF» o «Imprimir».", "Para anular, use «Anular» con su motivo."] },
      { titulo: "Ver el cuadro del año", pasos: ["En Ingresos elija la vista anual.", "Verá cada mes con los recibos emitidos, el rango de números y el total.", "Descargue el Excel si lo necesita."] },
    ],
  },
  {
    clave: "caja_chica", texto: "Caja chica", icono: "🧾", modulo: "caja_chica",
    tutoriales: [
      { titulo: "Abrir la caja chica del mes", pasos: ["Cree un requerimiento de apertura de caja chica en Expedientes.", "Genere su comprobante.", "Abra Caja chica: el expediente aparece enlazado a la caja del mes."] },
      { titulo: "Registrar los gastos de la caja", pasos: ["Abra la caja del mes.", "Agregue cada gasto con fecha, sustento (boleta, factura o declaración jurada), razón social, concepto y monto.", "El sistema avisa si el gasto pasa el saldo del fondo."] },
      { titulo: "Cerrar (liquidar) la caja", pasos: ["Revise que los gastos estén completos.", "Liquide la caja: queda cerrada y el saldo vuelve a su lugar.", "Descargue su hoja del mes en PDF o Excel."] },
    ],
  },
  {
    clave: "almacen", texto: "Almacén", icono: "📦", modulo: "almacen",
    tutoriales: [
      { titulo: "Ingresar bienes con una NEA", pasos: ["Cuando un expediente de compra tiene conformidad, genere la nota de entrada a almacén.", "Revise los bienes y cantidades.", "Los bienes suben al stock con su costo."] },
      { titulo: "Entregar bienes con una PECOSA", pasos: ["Abra Almacén y cree una PECOSA.", "Indique el área que solicita y los bienes con su cantidad.", "El stock baja al guardar."] },
      { titulo: "Ver el kardex de un bien", pasos: ["En Almacén busque el bien.", "Abra su kardex para ver entradas, salidas y saldo.", "Descargue el Excel si lo necesita."] },
    ],
  },
  {
    clave: "contabilidad", texto: "Contabilidad", icono: "📊", modulo: "contabilidad",
    tutoriales: [
      { titulo: "Conciliar el estado de cuenta con el banco", pasos: ["Abra Estados de cuenta y elija el mes.", "Pulse «Importar estado de cuenta (Excel o CSV)» con el archivo del banco: se leen los movimientos y se enlazan solos los cheques, transferencias e ITF que coinciden.", "Revise los que quedaron sin enlace y elíjalos a mano.", "Guarde: el sistema marca los cheques cobrados."], consejo: "El archivo debe tener columnas de cargo/retiro y abono/depósito." },
      { titulo: "Libros y resumen del mes", pasos: ["Abra Contabilidad y elija el libro: bancos, caja o diario.", "Elija el mes.", "Descargue en PDF o Excel."] },
      { titulo: "Balance anual", pasos: ["Abra Balance anual.", "Cargue la apertura del año si es el primero.", "Revise el balance constructivo y descárguelo."] },
    ],
  },
  {
    clave: "registro_civil", texto: "Registro Civil", icono: "🪪", modulo: "registro_civil",
    tutoriales: [{ titulo: "Registrar y buscar actas y partidas", pasos: ["Abra Padrón.", "Agregue el acta o partida con sus datos.", "Use el buscador para encontrar por nombre o documento."] }],
  },
  {
    clave: "secretaria", texto: "Secretaría", icono: "✉️", modulo: "secretaria",
    tutoriales: [{ titulo: "Emitir un oficio, carta o acuerdo", pasos: ["Abra Secretaría y elija el tipo de documento.", "Complete destinatario, asunto y contenido.", "Guarde: recibe su número correlativo y puede imprimirlo."] }],
  },
  {
    clave: "reportes", texto: "Reportes", icono: "📈",
    tutoriales: [
      { titulo: "Sacar un reporte en PDF o Excel", pasos: ["Abra Reportes y elija el reporte.", "Escoja el período.", "Descárguelo en PDF o Excel."] },
      { titulo: "Informe de transferencia de gestión", pasos: ["En Reportes, sección «Cambio de gestión», abra el informe.", "Revise cuentas, cheques sin cobrar, trámites pendientes, compromisos, almacén y numeración.", "Imprímalo o descárguelo en PDF y fírmenlo el saliente, el entrante y el alcalde."] },
    ],
  },
  {
    clave: "configuracion", texto: "Configuración", icono: "⚙️",
    tutoriales: [
      { titulo: "Datos y logo de la municipalidad", pasos: ["Abra Configuración → Identidad y logo.", "Complete RUC, dirección y cuenta bancaria, y suba el logo.", "Salen en el encabezado de todos los formatos."] },
      { titulo: "Configurar pagos fijos (dietas, personal, asesores)", pasos: ["Abra Configuración → Pagos fijos.", "Agregue el concepto, beneficiario, monto y fuente.", "Marque qué documentos lleva y suba los permanentes (DNI, credencial, contrato anual)."] },
      { titulo: "Fuentes de ingresos y plazos", pasos: ["Abra Configuración → Dinero y plazos.", "Agregue la institución que transfiere, el monto, cada cuánto llega y el día límite para rendir."] },
      { titulo: "Numeración de documentos", pasos: ["Abra Configuración → Numeración.", "Verá el próximo número de cada documento.", "Si empieza a mitad de año, fije el último número ya emitido."] },
      { titulo: "PIN, aprobaciones y cierre de mes", pasos: ["Abra Configuración → Seguridad y cierre de mes.", "Active o desactive el PIN personal y la pestaña «Por aprobar».", "Cierre el mes cuando termine: un mes cerrado ya no acepta cambios; solo el administrador lo reabre con motivo."] },
      { titulo: "Dar acceso de solo lectura al alcalde, regidores o fiscalizador", pasos: ["Abra Configuración → Seguridad.", "En «Acceso de solo lectura» pulse «Crear enlace» y escriba para quién es.", "Copie el enlace (se muestra una sola vez) y envíelo por WhatsApp.", "Para quitar el acceso, pulse «Revocar» con su motivo."] },
      { titulo: "Descargar el respaldo de toda la información", pasos: ["Abra Configuración → Seguridad.", "Pulse «Descargar respaldo (Excel)».", "Guárdelo en un lugar seguro, por ejemplo al cerrar cada año o al cambiar de gestión."] },
    ],
  },
  {
    clave: "gestion", texto: "Cambio de gestión y responsables", icono: "🔁",
    tutoriales: [{ titulo: "Relevar al tesorero o al alcalde", pasos: ["Abra «Responsables y relevos».", "Registre al saliente y al entrante con su fecha.", "Lo anterior al relevo tiene 30 días de gracia para corregirse y luego se bloquea.", "Genere el informe de transferencia de gestión en Reportes."] }],
  },
];
