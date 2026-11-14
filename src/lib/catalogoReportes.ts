import { TIPOS_RC } from "@/lib/registroCivil";
import { TIPOS_SEC } from "@/lib/secretaria";

export type Opcion = { v: string; t: string };
export type Reporte = {
  clave: string;
  grupo: string;
  titulo: string;
  detalle: string;
  /** Lista que arma la tabla (la misma del Excel: /exportar/<lista>). */
  lista: string;
  /** Valores fijos que se le pasan a la lista (por ejemplo, ver=bancos). */
  fijo?: Record<string, string>;
  /** mes: un mes o un rango de fechas · anio: un año · rango: fechas opcionales · ninguno: sin período */
  periodo: "mes" | "anio" | "rango" | "ninguno";
  /** Módulo que debe tener habilitada la MCP. */
  modulo?: "caja_chica" | "ingresos" | "almacen" | "contabilidad" | "registro_civil" | "secretaria";
  estados?: Opcion[];
  tipos?: Opcion[];
  nombreTipo?: string;
};

const ESTADOS_GASTO: Opcion[] = [{ v: "borrador", t: "Por aprobar" }, { v: "aprobado", t: "Aprobados" }, { v: "rendido", t: "Rendidos" }, { v: "anulado", t: "Anulados" }];

export const REPORTES: Reporte[] = [
  { clave: "gastos-mes", grupo: "Gastos", titulo: "Expedientes del mes", detalle: "Todos los expedientes de gasto con su tipo, área, fuente, estado y monto.", lista: "expedientes", periodo: "mes", estados: ESTADOS_GASTO, tipos: [{ v: "compra", t: "Compra" }, { v: "servicio", t: "Servicio" }, { v: "pago_fijo", t: "Pago fijo" }], nombreTipo: "Tipo de gasto" },
  { clave: "comprobantes-mes", grupo: "Gastos", titulo: "Comprobantes de pago", detalle: "Comprobantes de pago emitidos: beneficiario, concepto, cheque, función e importe.", lista: "comprobantes", periodo: "mes", estados: [{ v: "emitido", t: "Emitidos" }, { v: "anulado", t: "Anulados" }] },

  { clave: "ingresos-mes", grupo: "Ingresos propios", titulo: "Ingresos propios del mes", detalle: "Recibos de ingreso del mes con pagador, concepto y monto.", lista: "ingresos", periodo: "mes", modulo: "ingresos" },
  { clave: "ingresos-anio", grupo: "Ingresos propios", titulo: "Ingresos propios del año", detalle: "Cuadro mensual del año: recibos emitidos, rango de números y total recaudado.", lista: "ingresos-anio", periodo: "anio", modulo: "ingresos" },

  { clave: "caja-chica-mes", grupo: "Caja chica", titulo: "Caja chica del mes", detalle: "Gastos de la caja chica del mes: sustento, razón social, concepto y monto.", lista: "caja-chica", periodo: "mes", modulo: "caja_chica" },
  { clave: "caja-chica-anio", grupo: "Caja chica", titulo: "Caja chica del año", detalle: "Cuadro por mes: fondo, gastado, saldo y estado de cada caja.", lista: "caja-chica-anio", periodo: "anio", modulo: "caja_chica" },

  { clave: "balance-anual", grupo: "Contabilidad", titulo: "Balance anual", detalle: "Ingresos, gastos, resultado del año y situación al cierre (bancos, caja, retenciones y patrimonio).", lista: "contabilidad", fijo: { ver: "balance" }, periodo: "anio", modulo: "contabilidad" },
  { clave: "libro-bancos", grupo: "Contabilidad", titulo: "Libro Bancos", detalle: "Movimientos del banco del mes con saldo anterior, ingresos, egresos y saldo.", lista: "contabilidad", fijo: { ver: "bancos" }, periodo: "mes", modulo: "contabilidad" },
  { clave: "libro-caja", grupo: "Contabilidad", titulo: "Libro Caja", detalle: "Movimientos de caja del mes con saldo anterior, ingresos, egresos y saldo.", lista: "contabilidad", fijo: { ver: "caja" }, periodo: "mes", modulo: "contabilidad" },
  { clave: "libro-diario", grupo: "Contabilidad", titulo: "Libro diario simplificado", detalle: "Asientos del mes con sus cuentas, debe y haber.", lista: "contabilidad", fijo: { ver: "diario" }, periodo: "mes", modulo: "contabilidad" },
  { clave: "ejecucion", grupo: "Contabilidad", titulo: "Ejecución de ingresos y gastos", detalle: "Cuadro anual por mes: ingresos, gastos por partida y por función.", lista: "contabilidad", fijo: { ver: "ejecucion" }, periodo: "anio", modulo: "contabilidad" },
  { clave: "acum-ingresos", grupo: "Contabilidad", titulo: "Ingresos propios acumulados", detalle: "Todos los recibos del año, uno tras otro, con su acumulado.", lista: "contabilidad", fijo: { ver: "acumulado", cuadro: "ingresos" }, periodo: "anio", modulo: "contabilidad" },
  { clave: "acum-comprobantes", grupo: "Contabilidad", titulo: "Comprobantes de pago acumulados", detalle: "Todos los comprobantes del año con su acumulado.", lista: "contabilidad", fijo: { ver: "acumulado", cuadro: "comprobantes" }, periodo: "anio", modulo: "contabilidad" },
  { clave: "acum-caja", grupo: "Contabilidad", titulo: "Caja chica acumulada", detalle: "Todos los gastos de caja chica del año con su acumulado.", lista: "contabilidad", fijo: { ver: "acumulado", cuadro: "caja" }, periodo: "anio", modulo: "contabilidad" },

  { clave: "almacen-stock", grupo: "Almacén", titulo: "Stock del almacén", detalle: "Bienes con lo que entró, salió, stock actual, costo promedio y valor.", lista: "almacen", fijo: { ver: "stock" }, periodo: "ninguno", modulo: "almacen" },
  { clave: "almacen-entradas", grupo: "Almacén", titulo: "Entradas al almacén (NEA)", detalle: "Notas de entrada del período con proveedor y valor.", lista: "almacen", fijo: { ver: "entradas" }, periodo: "mes", modulo: "almacen" },
  { clave: "almacen-salidas", grupo: "Almacén", titulo: "Salidas del almacén (PECOSA)", detalle: "PECOSAs del período: área, quien recibió, finalidad y valor.", lista: "almacen", fijo: { ver: "salidas" }, periodo: "mes", modulo: "almacen" },

  { clave: "padron-civil", grupo: "Registro Civil", titulo: "Padrón de Registro Civil", detalle: "Listado de personas con DNI, tipo de acta, acta, libro, folio, expediente y ubicación.", lista: "padron", periodo: "rango", modulo: "registro_civil", tipos: TIPOS_RC.map((t) => ({ v: t.codigo, t: t.nombre })), nombreTipo: "Tipo de acta" },

  { clave: "documentos-sec", grupo: "Secretaría", titulo: "Registro de documentos emitidos", detalle: "Libro de oficios, cartas, memorandos y acuerdos emitidos, con su número y destinatario.", lista: "documentos", periodo: "mes", modulo: "secretaria", estados: [{ v: "emitido", t: "Emitidos" }, { v: "anulado", t: "Anulados" }], tipos: TIPOS_SEC.map((t) => ({ v: t.clave, t: t.plural })), nombreTipo: "Tipo de documento" },
];

export const reportePorClave = (clave: string) => REPORTES.find((r) => r.clave === clave);
