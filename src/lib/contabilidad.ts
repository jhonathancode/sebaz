import { codigoCP, MESES, rangoPeriodo } from "./formato";
import type { Fuente } from "./contexto";
import type { supabaseServidor } from "./supabase/server";

type Cliente = Awaited<ReturnType<typeof supabaseServidor>>;

export type CpContable = {
  id: string;
  codigo: string;
  fecha: string;
  beneficiario: string;
  concepto: string;
  importe: number;
  liquido: number;
  deducciones: number;
  cheque: string | null;
  partida: string;
  funcion: string;
  fuente_id: string;
  propio: boolean;
  tipoGasto: string | null;
  origen: string;
};
export type Transferencia = { id: string; fuente_id: string; periodo: string; fecha: string; monto: number; documento: string | null; municipalidad: string };
export type IngresoPropio = { id: string; numero: number; anio: number; fecha: string; rubro: string; concepto: string; pagador: string; monto: number };

export type DatosContables = {
  anio: number;
  saldoBancoInicial: number;
  saldoCajaInicial: number;
  hayDatosIniciales: boolean;
  transferencias: Transferencia[];
  cps: CpContable[];
  ingresos: IngresoPropio[];
  conciliaciones: Map<string, { saldo_extracto: number; observacion: string | null }>;
  cobrados: Map<string, string>;
  faltaActualizacion: boolean;
};

/** Todo lo contable de un año: sale de lo ya registrado más los datos de Contabilidad. */
export async function cargarContabilidad(supabase: Cliente, mcpId: string, anio: number, fuentes: Fuente[]): Promise<DatosContables> {
  const desde = `${anio}-01-01`;
  const hasta = `${anio}-12-31`;
  const propios = fuentes.find((f) => f.tipo === "propios");
  const [si, tr, cp, ing, conc, cob] = await Promise.all([
    supabase.from("saldos_iniciales").select("saldo_banco, saldo_caja").eq("mcp_id", mcpId).eq("anio", anio).maybeSingle(),
    supabase.from("transferencias_recibidas").select("id, fuente_id, periodo, fecha, monto, documento, fuentes(municipalidad)").eq("mcp_id", mcpId).eq("anulado", false).gte("fecha", desde).lte("fecha", hasta).order("fecha"),
    supabase
      .from("comprobantes_pago")
      .select("id, numero, origen, fecha, beneficiario, concepto, importe, deducciones, cheque, partida, funcion, fuente_id, expedientes(tipo)")
      .eq("mcp_id", mcpId)
      .in("estado", ["aprobado", "rendido"])
      .gte("fecha", desde)
      .lte("fecha", hasta)
      .order("fecha")
      .order("numero"),
    supabase.from("ingresos").select("id, numero, anio, fecha, rubro, concepto, pagador_nombre, monto").eq("mcp_id", mcpId).eq("estado", "emitido").gte("fecha", desde).lte("fecha", hasta).order("fecha"),
    supabase.from("conciliaciones").select("periodo, saldo_extracto, observacion").eq("mcp_id", mcpId).like("periodo", `${anio}-%`),
    supabase.from("cheques_cobrados").select("comprobante_id, fecha_cobro").eq("mcp_id", mcpId).eq("anulado", false),
  ]);
  return {
    anio,
    saldoBancoInicial: Number(si.data?.saldo_banco ?? 0),
    saldoCajaInicial: Number(si.data?.saldo_caja ?? 0),
    hayDatosIniciales: !!si.data,
    faltaActualizacion: !!si.error,
    transferencias: (tr.data ?? []).map((t) => ({
      id: t.id,
      fuente_id: t.fuente_id,
      periodo: t.periodo,
      fecha: t.fecha,
      monto: Number(t.monto),
      documento: t.documento,
      municipalidad: (t.fuentes as unknown as { municipalidad: string } | null)?.municipalidad ?? "",
    })),
    cps: (cp.data ?? []).map((c) => ({
      id: c.id,
      codigo: codigoCP(c.numero, c.origen),
      fecha: c.fecha,
      beneficiario: c.beneficiario,
      concepto: c.concepto,
      importe: Number(c.importe),
      deducciones: Number(c.deducciones ?? 0),
      liquido: Math.round((Number(c.importe) - Number(c.deducciones ?? 0)) * 100) / 100,
      cheque: c.cheque,
      partida: c.partida || "Sin partida",
      funcion: c.funcion || "Sin función asignada",
      fuente_id: c.fuente_id,
      propio: c.fuente_id === propios?.id,
      tipoGasto: (c.expedientes as unknown as { tipo: string } | null)?.tipo ?? null,
      origen: c.origen,
    })),
    ingresos: (ing.data ?? []).map((i) => ({
      id: i.id,
      numero: i.numero,
      anio: i.anio,
      fecha: i.fecha,
      rubro: i.rubro,
      concepto: i.concepto,
      pagador: i.pagador_nombre,
      monto: Number(i.monto),
    })),
    conciliaciones: new Map((conc.data ?? []).map((c) => [c.periodo, { saldo_extracto: Number(c.saldo_extracto), observacion: c.observacion }])),
    cobrados: new Map((cob.data ?? []).map((c) => [c.comprobante_id, c.fecha_cobro])),
  };
}

const r2 = (n: number) => Math.round(n * 100) / 100;

export type MovLibro = { fecha: string; documento: string; detalle: string; entra: number; sale: number; saldo: number };

/** Libro Bancos (transferencias y cheques) o Libro Caja (ingresos propios y gastos con propios) de un mes. */
export function libro(d: DatosContables, tipo: "bancos" | "caja", periodo: string) {
  const { desde, hasta } = rangoPeriodo(periodo);
  type M = Omit<MovLibro, "saldo">;
  const movs: M[] =
    tipo === "bancos"
      ? [
          ...d.transferencias.map((t) => ({ fecha: t.fecha, documento: t.documento ? `Op. ${t.documento}` : "Transferencia", detalle: `Transferencia de ${t.municipalidad} (${t.periodo})`, entra: t.monto, sale: 0 })),
          ...d.cps.filter((c) => !c.propio).map((c) => ({ fecha: c.fecha, documento: `${c.codigo}${c.cheque ? ` · Ch. ${c.cheque}` : ""}`, detalle: `${c.beneficiario} · ${c.concepto}`, entra: 0, sale: c.liquido })),
        ]
      : [
          ...d.ingresos.map((i) => ({ fecha: i.fecha, documento: `Recibo ${String(i.numero).padStart(4, "0")}`, detalle: `${i.pagador} · ${i.concepto}`, entra: i.monto, sale: 0 })),
          ...d.cps.filter((c) => c.propio).map((c) => ({ fecha: c.fecha, documento: c.codigo, detalle: `${c.beneficiario} · ${c.concepto}`, entra: 0, sale: c.liquido })),
        ];
  movs.sort((a, b) => a.fecha.localeCompare(b.fecha) || b.entra - a.entra);
  const inicial = tipo === "bancos" ? d.saldoBancoInicial : d.saldoCajaInicial;
  const anterior = r2(inicial + movs.filter((m) => m.fecha < desde).reduce((s, m) => s + m.entra - m.sale, 0));
  let saldo = anterior;
  const filas: MovLibro[] = movs
    .filter((m) => m.fecha >= desde && m.fecha <= hasta)
    .map((m) => {
      saldo = r2(saldo + m.entra - m.sale);
      return { ...m, saldo };
    });
  return {
    anterior,
    filas,
    entradas: r2(filas.reduce((s, m) => s + m.entra, 0)),
    salidas: r2(filas.reduce((s, m) => s + m.sale, 0)),
    final: saldo,
  };
}

/** Cuadro de 12 meses: filas (partida, función, fuente...) por columnas Ene..Dic y total. */
export function matriz<T>(items: T[], clave: (x: T) => string, fecha: (x: T) => string, monto: (x: T) => number) {
  const filas = new Map<string, number[]>();
  items.forEach((x) => {
    const k = clave(x);
    const m = Number(fecha(x).slice(5, 7)) - 1;
    const f = filas.get(k) ?? Array(12).fill(0);
    f[m] = r2(f[m] + monto(x));
    filas.set(k, f);
  });
  const lista = [...filas.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([nombre, meses]) => ({ nombre, meses, total: r2(meses.reduce((s, v) => s + v, 0)) }));
  const totales = Array(12).fill(0).map((_, i) => r2(lista.reduce((s, f) => s + f.meses[i], 0)));
  return { filas: lista, totales, total: r2(totales.reduce((s, v) => s + v, 0)) };
}

export const MESES_CORTOS = MESES.map((m) => m.slice(0, 3).replace(/^./, (c) => c.toUpperCase()));

const RUBRO_INGRESO: Record<string, string> = {
  venta: "Venta de bienes",
  servicio: "Venta de servicios",
  alquiler: "Alquileres",
  tasa: "Tasas",
  otro: "Otros ingresos",
};
export function nombreRubro(r: string) {
  return RUBRO_INGRESO[r] ?? r;
}

/** Cuenta de gasto referencial del Plan Contable Gubernamental según la partida. */
function cuentaGasto(c: CpContable): string {
  const p = c.partida;
  if (p.startsWith("2.1")) return "5101 Gastos en personal y obligaciones sociales";
  if (p.startsWith("2.2")) return "5201 Pensiones y otras prestaciones sociales";
  if (p.startsWith("2.3")) return c.tipoGasto === "compra" ? "5301 Compra de bienes" : "5302 Contratación de servicios";
  if (p.startsWith("2.5")) return "5801 Otros gastos";
  if (p.startsWith("2.6")) return "1503 Vehículos, maquinarias y otros (activo)";
  return "5302 Contratación de servicios";
}
const INGRESO_CUENTA: Record<string, string> = {
  venta: "4301 Venta de bienes",
  servicio: "4302 Venta de servicios",
  alquiler: "4501 Rentas de la propiedad",
  tasa: "4202 Tasas",
  otro: "4509 Otros ingresos",
};

export type Asiento = { fecha: string; glosa: string; lineas: { cuenta: string; debe: number; haber: number }[] };

/** Libro diario simplificado (asientos referenciales) de un mes. */
export function libroDiario(d: DatosContables, periodo: string): Asiento[] {
  const { desde, hasta } = rangoPeriodo(periodo);
  const dentro = (f: string) => f >= desde && f <= hasta;
  const BANCO = "1101.03 Cuentas corrientes en instituciones financieras";
  const CAJA = "1101.01 Caja";
  const asientos: Asiento[] = [
    ...d.transferencias.filter((t) => dentro(t.fecha)).map((t) => ({
      fecha: t.fecha,
      glosa: `Transferencia recibida de ${t.municipalidad}${t.documento ? ` · Op. ${t.documento}` : ""}`,
      lineas: [
        { cuenta: BANCO, debe: t.monto, haber: 0 },
        { cuenta: "4401 Traspasos y remesas recibidas", debe: 0, haber: t.monto },
      ],
    })),
    ...d.ingresos.filter((i) => dentro(i.fecha)).map((i) => ({
      fecha: i.fecha,
      glosa: `Recibo ${String(i.numero).padStart(4, "0")}-${i.anio} · ${i.concepto}`,
      lineas: [
        { cuenta: CAJA, debe: i.monto, haber: 0 },
        { cuenta: INGRESO_CUENTA[i.rubro] ?? "4509 Otros ingresos", debe: 0, haber: i.monto },
      ],
    })),
    ...d.cps.filter((c) => dentro(c.fecha)).map((c) => ({
      fecha: c.fecha,
      glosa: `${c.codigo}${c.cheque ? ` · Ch. ${c.cheque}` : ""} · ${c.beneficiario} · ${c.concepto}`,
      lineas: [
        { cuenta: cuentaGasto(c), debe: c.importe, haber: 0 },
        ...(c.deducciones > 0 ? [{ cuenta: "2102 Retenciones por pagar", debe: 0, haber: c.deducciones }] : []),
        { cuenta: c.propio ? CAJA : BANCO, debe: 0, haber: c.liquido },
      ],
    })),
  ];
  return asientos.sort((a, b) => a.fecha.localeCompare(b.fecha));
}

/** Cheques girados hasta fin de mes que el banco aún no cobra (cheques en tránsito). */
export function chequesEnTransito(d: DatosContables, periodo: string) {
  const { hasta } = rangoPeriodo(periodo);
  return d.cps.filter((c) => !c.propio && c.cheque && c.fecha <= hasta).filter((c) => {
    const cobro = d.cobrados.get(c.id);
    return !cobro || cobro > hasta;
  });
}
