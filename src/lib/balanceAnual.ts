import { asientosDelAnio, CUENTA_BANCO, CUENTA_CAJA } from "@/lib/asientosBalance";
import { cargarContabilidad, chequesEnTransito, libro, type DatosContables } from "@/lib/contabilidad";
import { NOMBRE_CUENTA, PLAN } from "@/lib/planCuentas";
import type { contextoMcp } from "@/lib/contexto";
import { MESES } from "@/lib/formato";
import type { SupabaseClient } from "@supabase/supabase-js";

type Celda = string | number | null;
export type FilaBal = { tipo: "fila" | "grupo" | "grupo4" | "total" | "destacado"; celdas: Celda[] };
export type ColBal = { titulo: string; ancho: number; tipo?: "monto" };
export type HojaBal = {
  clave: string;
  pestana: string;
  titulo: string;
  columnas: ColBal[];
  /** Fila de encabezado superior para agrupar columnas (opcional). */
  grupos?: { titulo: string; desde: number; hasta: number }[];
  filas: FilaBal[];
  nota?: string;
  /** Formato oficial de los estados financieros (EF-1 y EF-2), para verlos e imprimirlos como el modelo. */
  ef?: FormatoEF;
};

export type LineaEF = { tipo: "titulo" | "sub" | "fila" | "total" | "gran" | "esp" | "orden"; texto: string; a?: number; b?: number };
export type FormatoEF = { codigo: string; titulo: string; anios: [number, number]; izq: LineaEF[]; der?: LineaEF[]; firmas: string[] };

const r2 = (n: number) => Math.round(n * 100) / 100;
const fechaPe = (f: string) => f.split("-").reverse().join("/");
const MES = (i: number) => MESES[i].toUpperCase();
const mm = (anio: number, i: number) => `${anio}-${String(i + 1).padStart(2, "0")}`;
const M = (titulo: string, ancho = 14): ColBal => ({ titulo, ancho, tipo: "monto" });

type Ctx = Awaited<ReturnType<typeof contextoMcp>>;

/** Todas las hojas del balance anual, armadas solo con lo ya registrado en el sistema. */
export async function hojasBalance(ctx: Ctx, supabase: SupabaseClient, anio: number): Promise<HojaBal[]> {
  const calc = await calcularBalance(ctx, supabase, anio);
  const d = calc.d;

  // ---------------------------------------------------------------- BANCOS (conciliación)
  const filasBanco: FilaBal[] = [];
  for (let i = 0; i < 12; i++) {
    const per = mm(anio, i);
    const lib = libro(d, "bancos", per).final;
    const trans = r2(chequesEnTransito(d, per).reduce((s, c) => s + c.liquido, 0));
    const ext = d.conciliaciones.get(per);
    const esperado = r2(lib + trans);
    const dif = ext ? r2(ext.saldo_extracto - esperado) : null;
    filasBanco.push({
      tipo: "fila",
      celdas: [MES(i), lib, trans, esperado, ext ? ext.saldo_extracto : null, dif, !ext ? "SIN CONCILIAR" : Math.abs(dif ?? 0) < 0.01 ? "CONCILIADO" : "CON DIFERENCIA", (ext?.observacion ?? "").toUpperCase() || null],
    });
  }
  const bancos: HojaBal = {
    clave: "bancos",
    pestana: "BANCOS",
    titulo: `CONCILIACIÓN BANCARIA ${anio}`,
    columnas: [{ titulo: "MES", ancho: 14 }, M("SALDO SEGÚN LIBRO BANCOS", 18), M("CHEQUES GIRADOS NO COBRADOS", 18), M("SALDO ESPERADO EN EL BANCO", 18), M("SALDO SEGÚN EXTRACTO", 18), M("DIFERENCIA", 14), { titulo: "ESTADO", ancho: 18 }, { titulo: "OBSERVACIÓN", ancho: 40 }],
    filas: filasBanco,
    nota: "Saldo esperado = saldo del libro Bancos + cheques girados que el banco aún no cobra. Se compara con el saldo del estado de cuenta anotado en Conciliación bancaria.",
  };

  // ---------------------------------------------------------------- listados agrupados por mes (una sola suma total)
  function porMes<T>(items: T[], fecha: (x: T) => string, fila: (x: T, n: number) => Celda[], monto: (x: T) => number, ncols: number): FilaBal[] {
    const out: FilaBal[] = [];
    let total = 0;
    let n = 0;
    for (let i = 0; i < 12; i++) {
      const del = items.filter((x) => fecha(x).startsWith(mm(anio, i))).sort((a, b) => fecha(a).localeCompare(fecha(b)));
      if (!del.length) continue;
      out.push({ tipo: "grupo", celdas: [MES(i), ...Array(ncols - 1).fill(null)] });
      del.forEach((x) => { n += 1; total += monto(x); out.push({ tipo: "fila", celdas: fila(x, n) }); });
    }
    out.push({ tipo: "total", celdas: ["TOTAL DEL AÑO", ...Array(ncols - 2).fill(null), r2(total)] });
    return out;
  }

  const ingresos: HojaBal = {
    clave: "ingresos",
    pestana: "INGRESOS PROPIOS",
    titulo: `INGRESOS PROPIOS ${anio}`,
    columnas: [{ titulo: "N°", ancho: 6 }, { titulo: "N° RECIBO", ancho: 11 }, { titulo: "FECHA", ancho: 12 }, { titulo: "RUBRO", ancho: 20 }, { titulo: "PAGADOR", ancho: 32 }, { titulo: "CONCEPTO", ancho: 50 }, M("MONTO S/")],
    filas: porMes(d.ingresos, (x) => x.fecha, (x, n) => [n, String(x.numero).padStart(4, "0"), fechaPe(x.fecha), x.rubro.toUpperCase(), x.pagador.toUpperCase(), x.concepto.toUpperCase(), x.monto], (x) => x.monto, 7),
  };

  const comprobantes: HojaBal = {
    clave: "comprobantes",
    pestana: "COMPROBANTES",
    titulo: `COMPROBANTES DE PAGO ${anio}`,
    columnas: [{ titulo: "N°", ancho: 6 }, { titulo: "N° CP", ancho: 12 }, { titulo: "FECHA", ancho: 12 }, { titulo: "BENEFICIARIO", ancho: 30 }, { titulo: "CONCEPTO", ancho: 46 }, { titulo: "CHEQUE", ancho: 14 }, { titulo: "PARTIDA", ancho: 14 }, M("IMPORTE S/")],
    filas: porMes(d.cps, (x) => x.fecha, (x, n) => [n, x.codigo, fechaPe(x.fecha), x.beneficiario.toUpperCase(), x.concepto.toUpperCase(), x.cheque ?? null, x.partida, x.importe], (x) => x.importe, 8),
  };

  const { data: cajas } = await supabase.from("cajas_chicas").select("id, periodo, numero_cheque").eq("mcp_id", ctx.mcp.id).gte("periodo", `${anio}-01`).lte("periodo", `${anio}-12`).neq("estado", "anulada");
  const ids = (cajas ?? []).map((c) => c.id);
  const { data: gcc } = ids.length ? await supabase.from("caja_chica_gastos").select("caja_id, fecha, concepto, sustento_tipo, sustento_numero, razon_social, monto").in("caja_id", ids).eq("anulado", false) : { data: [] as { caja_id: string; fecha: string; concepto: string; sustento_tipo: string; sustento_numero: string | null; razon_social: string; monto: number }[] };
  const cheque = new Map((cajas ?? []).map((c) => [c.id, c.numero_cheque ?? ""]));
  const cajaChica: HojaBal = {
    clave: "caja-chica",
    pestana: "CAJA CHICA",
    titulo: `CAJA CHICA ${anio}`,
    columnas: [{ titulo: "N°", ancho: 6 }, { titulo: "FECHA", ancho: 12 }, { titulo: "CHEQUE", ancho: 14 }, { titulo: "CP", ancho: 8 }, { titulo: "N° CP", ancho: 14 }, { titulo: "RAZÓN SOCIAL", ancho: 34 }, { titulo: "CONCEPTO", ancho: 50 }, M("MONTO S/")],
    filas: porMes(gcc ?? [], (x) => x.fecha, (x, n) => [n, fechaPe(x.fecha), (cheque.get(x.caja_id) ?? "").toUpperCase(), x.sustento_tipo, x.sustento_numero ?? "SN", x.razon_social.toUpperCase(), x.concepto.toUpperCase(), Number(x.monto)], (x) => Number(x.monto), 8),
  };

  // ---------------------------------------------------------------- BALANCE CONSTRUCTIVO
  const previo = await calcularBalance(ctx, supabase, anio - 1);
  const grupos = [{ titulo: "", desde: 0, hasta: 1 }, { titulo: "APERTURA", desde: 2, hasta: 3 }, { titulo: "MOVIM. I TRIM ACUMULADOS", desde: 4, hasta: 5 }, { titulo: "MOVIM. II TRIM ACUMULADOS", desde: 6, hasta: 7 }, { titulo: "MOVIM. III TRIM ACUMULADOS", desde: 8, hasta: 9 }, { titulo: "MOVIM. IV TRIM ACUMULADOS", desde: 10, hasta: 11 }, { titulo: "MOVIM. ACUMULADOS", desde: 12, hasta: 13 }, { titulo: "SALDOS AJUSTADOS", desde: 14, hasta: 15 }, { titulo: "PATRIMONIAL", desde: 16, hasta: 17 }, { titulo: "GESTIÓN", desde: 18, hasta: 19 }];
  const columnasBC: ColBal[] = [{ titulo: "CTA.", ancho: 14 }, { titulo: "NOMBRE DE LA CUENTA", ancho: 46 }, ...["DEBE", "HABER", "DEBE", "HABER", "DEBE", "HABER", "DEBE", "HABER", "DEBE", "HABER", "DEBE", "HABER", "DEUDOR", "ACREEDOR", "ACTIVO", "PASIVO", "GASTOS", "INGRESOS"].map((t) => M(t, 13))];
  const celdasCuenta = (cod: string, nombre: string, a: Acum): Celda[] => {
    const q = a.q.flat();
    const moD = r2(a.q.reduce((s, x) => s + x[0], 0));
    const moH = r2(a.q.reduce((s, x) => s + x[1], 0));
    const neto = r2(a.apD - a.apH + moD - moH);
    const sD = neto > 0 ? neto : 0;
    const sH = neto < 0 ? -neto : 0;
    const dist = distribuir(cod, sD, sH);
    const v = (n: number) => (n ? r2(n) : null);
    return [cod, nombre, v(a.apD), v(a.apH), ...q.map(v), v(moD), v(moH), v(sD), v(sH), v(dist.act), v(dist.pas), v(dist.gas), v(dist.ing)];
  };
  const hayActividad = (a: Acum) => a.apD || a.apH || a.q.some((x) => x[0] || x[1]);
  const filasDetalle: FilaBal[] = [];
  PLAN.forEach(([cod, nombre]) => {
    const a = calc.agregado(cod);
    if (hayActividad(a)) filasDetalle.push({ tipo: cod.length === 4 ? "grupo4" : "fila", celdas: celdasCuenta(cod, nombre, a) });
  });
  const cierre = (cuentas4: [string, string][]): FilaBal[] => {
    const t = { apD: 0, apH: 0, q: Array(8).fill(0) as number[], moD: 0, moH: 0, sD: 0, sH: 0, act: 0, pas: 0, gas: 0, ing: 0 };
    const filas = cuentas4.map(([cod, nombre]) => {
      const c = celdasCuenta(cod, nombre, calc.agregado(cod));
      const n = (i: number) => (typeof c[i] === "number" ? (c[i] as number) : 0);
      t.apD += n(2); t.apH += n(3);
      for (let k = 0; k < 8; k++) t.q[k] += n(4 + k);
      t.moD += n(12); t.moH += n(13); t.sD += n(14); t.sH += n(15); t.act += n(16); t.pas += n(17); t.gas += n(18); t.ing += n(19);
      return { tipo: "fila" as const, celdas: c };
    });
    const dif = r2(t.ing - t.gas);
    const vv = (n: number) => (n ? r2(n) : null);
    const sub: Celda[] = ["", "SUB TOTAL", vv(t.apD), vv(t.apH), ...t.q.map(vv), vv(t.moD), vv(t.moH), vv(t.sD), vv(t.sH), vv(t.act), vv(t.pas), vv(t.gas), vv(t.ing)];
    const res: Celda[] = ["", dif >= 0 ? "RESULTADO DEL EJERCICIO · SUPERÁVIT" : "RESULTADO DEL EJERCICIO · DÉFICIT", ...Array(14).fill(null), dif < 0 ? -dif : null, dif >= 0 ? dif : null, dif >= 0 ? dif : null, dif < 0 ? -dif : null];
    const fin: Celda[] = ["", "TOTAL", ...Array(14).fill(null), vv(t.act + (dif < 0 ? -dif : 0)), vv(t.pas + (dif >= 0 ? dif : 0)), vv(t.gas + (dif >= 0 ? dif : 0)), vv(t.ing + (dif < 0 ? -dif : 0))];
    return [...filas, { tipo: "total", celdas: sub }, { tipo: "destacado", celdas: res }, { tipo: "total", celdas: fin }];
  };
  // El subtotal del detalle suma solo las cuentas de 4 dígitos con movimiento (las demás son subcuentas)
  const cuentas4Activas = PLAN.filter(([c]) => c.length === 4 && hayActividad(calc.agregado(c))) as [string, string][];
  const constructivo: HojaBal = {
    clave: "constructivo",
    pestana: "B. CONSTRUCTIVO",
    titulo: `BALANCE CONSTRUCTIVO · Del 01/01/${anio} al 31/12/${anio} · En soles`,
    columnas: columnasBC,
    grupos,
    filas: [...filasDetalle, ...cierre(cuentas4Activas).slice(cuentas4Activas.length)],
    nota: "Cuentas con sus subcuentas, armadas con los asientos del año. Apertura = saldo al 1 de enero (banco y caja, más lo anotado en la pestaña APERTURA).",
  };
  const fijas: [string, string][] = [["1101", "CAJA Y BANCOS"], ["1201", "CUENTAS POR COBRAR"], ["1202", "CUENTAS POR COBRAR DIVERSAS"], ["1205", "SERVICIOS Y OTROS CONTRATADOS POR ANTICIPADO"], ["1301", "BIENES Y SUMINISTROS DE FUNCIONAMIENTO"], ["1501", "EDIFICIOS Y ESTRUCTURAS"], ["1502", "ACTIVOS NO PRODUCIDOS"], ["1503", "VEHÍCULOS, MAQUINARIAS Y EQUIPO"], ["1505", "ESTUDIOS Y PROYECTOS"], ["1507", "OTROS ACTIVOS"], ["1508", "DEPRECIACIÓN, AMORTIZACIÓN Y AGOTAMIENTO"], ["2103", "CUENTAS POR PAGAR"], ["3201", "HACIENDA NACIONAL ADICIONAL"], ["3401", "RESULTADOS ACUMULADOS"], ["4102", "IMPUESTO A LA PROPIEDAD"], ["4105", "OTROS INGRESOS IMPOSITIVOS"], ["4106", "CONTRIBUCIONES OBLIGATORIAS"], ["4301", "VENTA DE BIENES"], ["4302", "VENTA DE DERECHOS Y TASAS ADMINISTRATIVOS"], ["4303", "VENTA DE SERVICIOS"], ["4401", "DONACIONES CORRIENTES RECIBIDAS EN EFECTIVO Y BIENES"], ["4501", "RENTAS DE LA PROPIEDAD"], ["4505", "INGRESOS DIVERSOS"], ["5101", "PERSONAL Y OBLIGACIONES SOCIALES"], ["5301", "CONSUMO DE BIENES"], ["5302", "CONTRATACIÓN DE SERVICIOS"], ["5503", "SUBVENCIONES A PERSONAS NATURALES"]];
  const bc4: HojaBal = {
    clave: "bc4",
    pestana: "BC. 04 DÍGITOS",
    titulo: `BALANCE CONSTRUCTIVO A 4 DÍGITOS · Del 01/01/${anio} al 31/12/${anio} · En soles`,
    columnas: columnasBC,
    grupos,
    filas: cierre(fijas.map(([c, n]) => [c, NOMBRE_CUENTA.get(c) ?? n] as [string, string])),
    nota: "Resumen del balance constructivo: de aquí salen el EF-1 y el EF-2.",
  };

  // ---------------------------------------------------------------- EF1 y EF2 (dos columnas: año anterior y año)
  const bal = (c: Calc) => {
    const net = (p: string) => r2(c.agregado(p).apD - c.agregado(p).apH + c.agregado(p).q.reduce((s, x) => s + x[0] - x[1], 0));
    const act = (p: string) => net(p);
    const pas = (p: string) => -net(p);
    const ingresos4 = (p: string) => -net(p);
    const gastos5 = (p: string) => net(p);
    const resultado = r2(["4102", "4105", "4106", "4301", "4302", "4303", "4401", "4501", "4505"].reduce((s, p) => s + ingresos4(p), 0) - ["5101", "5301", "5302", "5503"].reduce((s, p) => s + gastos5(p), 0));
    return { act, pas, ingresos4, gastos5, resultado, acum: pas("3401") };
  };
  const A = bal(previo);
  const B = bal(calc);
  const dos = (texto: string, f: (x: ReturnType<typeof bal>) => number, tipo: FilaBal["tipo"] = "fila"): FilaBal => ({ tipo, celdas: [texto, r2(f(A)), r2(f(B))] });
  const colsEF: ColBal[] = [{ titulo: "CONCEPTO", ancho: 60 }, M(`AL 31/12/${anio - 1}`, 18), M(`AL 31/12/${anio}`, 18)];
  const totAC = (x: ReturnType<typeof bal>) => x.act("1101") + x.act("1201") + x.act("1202") + x.act("1301") + x.act("1205");
  const totANC = (x: ReturnType<typeof bal>) => x.act("1501") + x.act("1502") + x.act("1503") + x.act("1508") + x.act("1505") + x.act("1507");
  const totPat = (x: ReturnType<typeof bal>) => x.pas("3201") + x.acum + x.resultado;
  const ef1: HojaBal = {
    clave: "ef1",
    pestana: "EF1",
    titulo: `EF-1 ESTADO DE SITUACIÓN FINANCIERA · del 01/01 al 31/12/${anio} · (en soles, a valores históricos)`,
    columnas: colsEF,
    filas: [
      { tipo: "grupo", celdas: ["ACTIVO CORRIENTE", null, null] },
      dos("Efectivo y Equivalente de Efectivo", (x) => x.act("1101")),
      dos("Cuentas por Cobrar (Neto)", (x) => x.act("1201") + x.act("1202")),
      dos("Existencias (Neto)", (x) => x.act("1301")),
      dos("Gastos Pagados por Anticipado", (x) => x.act("1205")),
      dos("TOTAL ACTIVO CORRIENTE", totAC, "total"),
      { tipo: "grupo", celdas: ["ACTIVO NO CORRIENTE", null, null] },
      dos("Edificios y Estructuras y Act. no Prod. (Neto)", (x) => x.act("1501") + x.act("1502")),
      dos("Vehículos, Maquinarias y Otros (Neto)", (x) => x.act("1503") + x.act("1508")),
      dos("Otras Cuentas del Activo", (x) => x.act("1505") + x.act("1507")),
      dos("TOTAL ACTIVO NO CORRIENTE", totANC, "total"),
      dos("TOTAL ACTIVO", (x) => totAC(x) + totANC(x), "destacado"),
      { tipo: "grupo", celdas: ["PASIVO CORRIENTE", null, null] },
      dos("Cuentas por Pagar", (x) => x.pas("2103")),
      dos("TOTAL PASIVO", (x) => x.pas("2103"), "total"),
      { tipo: "grupo", celdas: ["PATRIMONIO", null, null] },
      dos("Hacienda Nacional Adicional", (x) => x.pas("3201")),
      dos("Resultados Acumulados", (x) => x.acum + x.resultado),
      dos("TOTAL PATRIMONIO", totPat, "total"),
      dos("TOTAL PASIVO Y PATRIMONIO", (x) => x.pas("2103") + totPat(x), "destacado"),
    ],
    nota: Math.abs(totAC(B) + totANC(B) - (B.pas("2103") + totPat(B))) < 0.01 ? "✓ El estado cuadra: activo = pasivo + patrimonio." : "⚠ El estado no cuadra; revise la apertura y los datos contables.",
  };
  const ingNoTrib = (x: ReturnType<typeof bal>) => x.ingresos4("4301") + x.ingresos4("4302") + x.ingresos4("4303") + x.ingresos4("4501");
  const totIng = (x: ReturnType<typeof bal>) => x.ingresos4("4102") + x.ingresos4("4105") + x.ingresos4("4106") + ingNoTrib(x) + x.ingresos4("4401");
  const totGas = (x: ReturnType<typeof bal>) => x.gastos5("5301") + x.gastos5("5302") + x.gastos5("5101");
  const ef2: HojaBal = {
    clave: "ef2",
    pestana: "EF2",
    titulo: `EF-2 ESTADO DE GESTIÓN · del 01/01 al 31/12/${anio} · (en soles, a valores históricos)`,
    columnas: [{ titulo: "CONCEPTO", ancho: 60 }, M(String(anio - 1), 18), M(String(anio), 18)],
    filas: [
      { tipo: "grupo", celdas: ["INGRESOS", null, null] },
      dos("Ingresos Tributarios Netos", (x) => x.ingresos4("4102") + x.ingresos4("4105") + x.ingresos4("4106")),
      dos("Ingresos No Tributarios", ingNoTrib),
      dos("Traspasos y Remesas Recibidas", () => 0),
      dos("Donaciones y Transferencias Recibidas", (x) => x.ingresos4("4401")),
      dos("TOTAL INGRESOS", totIng, "total"),
      { tipo: "grupo", celdas: ["COSTOS Y GASTOS", null, null] },
      dos("Costo de Ventas", () => 0),
      dos("Gastos en Bienes y Servicios", (x) => -(x.gastos5("5301") + x.gastos5("5302"))),
      dos("Gastos de Personal", (x) => -x.gastos5("5101")),
      dos("Gastos por Pens., Prest. y Asistencia Social", () => 0),
      dos("Traspasos y Remesas Otorgadas", () => 0),
      dos("Estimaciones y Provisiones del Ejercicio", () => 0),
      dos("TOTAL COSTOS Y GASTOS", (x) => -totGas(x), "total"),
      dos("RESULTADO DE OPERACIÓN", (x) => totIng(x) - totGas(x), "destacado"),
      { tipo: "grupo", celdas: ["OTROS INGRESOS Y GASTOS", null, null] },
      dos("Ingresos Financieros", () => 0),
      dos("Gastos Financieros", () => 0),
      dos("Otros Ingresos", (x) => x.ingresos4("4505")),
      dos("Otros Gastos", (x) => -x.gastos5("5503")),
      dos("TOTAL OTROS INGRESOS Y GASTOS", (x) => x.ingresos4("4505") - x.gastos5("5503"), "total"),
      dos("RESULTADO DEL EJERCICIO · SUPERÁVIT (DÉFICIT)", (x) => x.resultado, "destacado"),
    ],
  };

  const L = (texto: string, f: (x: ReturnType<typeof bal>) => number, tipo: LineaEF["tipo"] = "fila"): LineaEF => ({ tipo, texto, a: r2(f(A)), b: r2(f(B)) });
  const cero = (texto: string): LineaEF => L(texto, () => 0);
  const tit = (texto: string, tipo: LineaEF["tipo"] = "titulo"): LineaEF => ({ tipo, texto });
  const pasivoCte = (x: ReturnType<typeof bal>) => x.pas("2103");
  ef1.ef = {
    codigo: "EF-1",
    titulo: "ESTADO DE SITUACIÓN FINANCIERA",
    anios: [anio - 1, anio],
    izq: [
      tit("ACTIVO"), tit("ACTIVO CORRIENTE"),
      L("Efectivo y Equivalente de Efectivo", (x) => x.act("1101")), cero("Inversiones Disponibles"),
      L("Cuentas por Cobrar (Neto)", (x) => x.act("1201") + x.act("1202")), cero("Otras Cuentas por Cobrar (Neto)"),
      L("Existencias (Neto)", (x) => x.act("1301")), L("Gastos Pagados por Anticipado", (x) => x.act("1205")),
      L("TOTAL ACTIVO CORRIENTE", totAC, "total"), { tipo: "esp", texto: "" },
      tit("ACTIVO NO CORRIENTE"),
      cero("Cuentas por Cobrar a Largo Plazo"), cero("Otras Ctas. por Cobrar a Largo Plazo"), cero("Inversiones (Neto)"),
      L("Edificios y Estructuras y Act. no Prod. (Neto)", (x) => x.act("1501") + x.act("1502")),
      L("Vehículos, Maquinarias y Otros (Neto)", (x) => x.act("1503") + x.act("1508")),
      L("Otras Cuentas del Activo", (x) => x.act("1505") + x.act("1507")), cero("Otras Cuentas del Activo (Neto)"),
      L("TOTAL ACTIVO NO CORRIENTE", totANC, "total"),
      L("TOTAL ACTIVO", (x) => totAC(x) + totANC(x), "gran"),
      { tipo: "orden", texto: "Cuentas de Orden" },
    ],
    der: [
      tit("PASIVO Y PATRIMONIO"), tit("PASIVO CORRIENTE"),
      cero("Obligaciones Tesoro Público"), cero("Sobregiros Bancarios"), L("Cuentas Por Pagar", pasivoCte),
      cero("Operaciones de Crédito"), cero("Parte Cte. Deudas a Largo Plazo"), cero("Otras Cuentas del Pasivo"),
      L("TOTAL PASIVO CORRIENTE", pasivoCte, "total"), { tipo: "esp", texto: "" },
      tit("PASIVO NO CORRIENTE"),
      cero("Deudas a Largo Plazo"), cero("Beneficios Sociales y Oblig. Prev."), cero("Ingresos Diferidos"), cero("Otras Cuentas del Pasivo"), cero("Provisiones"),
      L("TOTAL PASIVO NO CORRIENTE", () => 0, "total"),
      L("TOTAL PASIVO", pasivoCte, "total"),
      tit("PATRIMONIO"),
      cero("Hacienda Nacional"), L("Hacienda Nacional Adicional", (x) => x.pas("3201")), cero("Reservas"), L("Resultados Acumulados", (x) => x.acum + x.resultado),
      L("TOTAL PATRIMONIO", totPat, "total"),
      L("TOTAL PASIVO Y PATRIMONIO", (x) => pasivoCte(x) + totPat(x), "gran"),
      { tipo: "orden", texto: "Cuentas de Orden" },
    ],
    firmas: ["CONTADOR", "DIRECTOR GENERAL DE ADMINISTRACIÓN", "TITULAR DE LA ENTIDAD"],
  };
  ef2.ef = {
    codigo: "EF-2",
    titulo: "ESTADO DE GESTIÓN",
    anios: [anio - 1, anio],
    izq: [
      tit("INGRESOS"),
      L("Ingresos Tributarios Netos", (x) => x.ingresos4("4102") + x.ingresos4("4105") + x.ingresos4("4106")), L("Ingresos No Tributarios", ingNoTrib),
      cero("Traspasos y Remesas Recibidas"), L("Donaciones y Transferencias Recibidas", (x) => x.ingresos4("4401")),
      { tipo: "esp", texto: "" }, L("TOTAL INGRESOS", totIng, "total"), { tipo: "esp", texto: "" },
      tit("COSTOS Y GASTOS"),
      cero("Costo de Ventas"), L("Gastos en Bienes y Servicios", (x) => -(x.gastos5("5301") + x.gastos5("5302"))), L("Gastos de Personal", (x) => -x.gastos5("5101")),
      cero("Gastos por Pens.Prest.y Asistencia Social"), cero(""), cero("Traspasos y Remesas Otorgadas"), cero("Estimaciones y Provisiones del Ejercicio"),
      { tipo: "esp", texto: "" }, L("TOTAL COSTOS Y GASTOS", (x) => -totGas(x), "total"), { tipo: "esp", texto: "" },
      L("RESULTADO DE OPERACIÓN", (x) => totIng(x) - totGas(x), "total"), { tipo: "esp", texto: "" },
      tit("OTROS INGRESOS Y GASTOS"),
      cero("Ingresos Financieros"), cero("Gastos Financieros"), L("Otros Ingresos", (x) => x.ingresos4("4505")), L("Otros Gastos", (x) => -x.gastos5("5503")),
      { tipo: "esp", texto: "" }, L("TOTAL OTROS INGRESOS Y GASTOS", (x) => x.ingresos4("4505") - x.gastos5("5503"), "total"), { tipo: "esp", texto: "" },
      L("RESULTADO DEL EJERCICIO SUPERAVIT (DEFICIT)", (x) => x.resultado, "gran"),
    ],
    firmas: ["CONTADOR GENERAL", "TITULAR DE LA ENTIDAD"],
  };

  return [bancos, ingresos, comprobantes, cajaChica, constructivo, bc4, ef1, ef2];
}

// ===================================================================== motor de cuentas
export type Acum = { apD: number; apH: number; q: [number, number][] };
export type Calc = { d: DatosContables; agregado: (prefijo: string) => Acum; hojas: Map<string, Acum>; aperturaFalta: boolean };

const vacio = (): Acum => ({ apD: 0, apH: 0, q: [[0, 0], [0, 0], [0, 0], [0, 0]] });

/** Cómo se reparte el saldo de una cuenta en las columnas activo, pasivo, gastos e ingresos. */
function distribuir(cod: string, sD: number, sH: number) {
  const g = cod[0];
  let act = 0, pas = 0, gas = 0, ing = 0;
  if (g === "1") { if (sD) act = sD; else pas = sH; }
  else if (g === "2" || g === "3") { if (sH) pas = sH; else act = sD; }
  else if (g === "5") { if (sD) gas = sD; else ing = sH; }
  else { if (sH) ing = sH; else gas = sD; }
  return { act, pas, gas, ing };
}

/** Apertura (saldo al 1 de enero) + movimientos por trimestre de cada cuenta, listos para sumar por prefijo. */
export async function calcularBalance(ctx: Ctx, supabase: SupabaseClient, anio: number): Promise<Calc> {
  const d = await cargarContabilidad(supabase, ctx.mcp.id, anio, ctx.fuentes);
  const hojas = new Map<string, Acum>();
  const tomar = (c: string) => { let a = hojas.get(c); if (!a) { a = vacio(); hojas.set(c, a); } return a; };
  if (d.saldoBancoInicial) tomar(CUENTA_BANCO).apD += d.saldoBancoInicial;
  if (d.saldoCajaInicial) tomar(CUENTA_CAJA).apD += d.saldoCajaInicial;
  const { data: ap, error } = await supabase.from("saldos_apertura").select("cuenta, debe, haber").eq("mcp_id", ctx.mcp.id).eq("anio", anio);
  (ap ?? []).forEach((x) => { const a = tomar(x.cuenta); a.apD += Number(x.debe); a.apH += Number(x.haber); });
  // Resultados acumulados: se calcula solo para que la apertura cuadre
  let dif = 0;
  hojas.forEach((a) => { dif += a.apD - a.apH; });
  if (Math.abs(dif) > 0.004) { const a = tomar("3401.01"); if (dif > 0) a.apH += r2(dif); else a.apD += r2(-dif); }
  asientosDelAnio(d).forEach((x) => {
    const tri = Math.min(3, Math.floor((Number(x.fecha.slice(5, 7)) - 1) / 3));
    const a = tomar(x.cuenta);
    a.q[tri][0] = r2(a.q[tri][0] + x.debe);
    a.q[tri][1] = r2(a.q[tri][1] + x.haber);
  });
  const agregado = (prefijo: string): Acum => {
    const t = vacio();
    hojas.forEach((a, c) => {
      if (c === prefijo || c.startsWith(prefijo)) {
        t.apD += a.apD; t.apH += a.apH;
        a.q.forEach((x, i) => { t.q[i][0] += x[0]; t.q[i][1] += x[1]; });
      }
    });
    t.apD = r2(t.apD); t.apH = r2(t.apH);
    t.q = t.q.map((x) => [r2(x[0]), r2(x[1])] as [number, number]);
    return t;
  };
  return { d, agregado, hojas, aperturaFalta: !!error };
}
