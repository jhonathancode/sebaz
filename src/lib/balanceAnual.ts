import { cargarContabilidad, chequesEnTransito, libro, libroDiario } from "@/lib/contabilidad";
import type { contextoMcp } from "@/lib/contexto";
import { MESES } from "@/lib/formato";
import type { SupabaseClient } from "@supabase/supabase-js";

type Celda = string | number | null;
export type FilaBal = { tipo: "fila" | "grupo" | "total" | "destacado"; celdas: Celda[] };
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
};

const r2 = (n: number) => Math.round(n * 100) / 100;
const fechaPe = (f: string) => f.split("-").reverse().join("/");
const MES = (i: number) => MESES[i].toUpperCase();
const mm = (anio: number, i: number) => `${anio}-${String(i + 1).padStart(2, "0")}`;
const M = (titulo: string, ancho = 14): ColBal => ({ titulo, ancho, tipo: "monto" });

type Ctx = Awaited<ReturnType<typeof contextoMcp>>;

/** Todas las hojas del balance anual, armadas solo con lo ya registrado en el sistema. */
export async function hojasBalance(ctx: Ctx, supabase: SupabaseClient, anio: number): Promise<HojaBal[]> {
  const d = await cargarContabilidad(supabase, ctx.mcp.id, anio, ctx.fuentes);

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
    columnas: [{ titulo: "N° RECIBO", ancho: 11 }, { titulo: "FECHA", ancho: 12 }, { titulo: "RUBRO", ancho: 20 }, { titulo: "PAGADOR", ancho: 32 }, { titulo: "CONCEPTO", ancho: 50 }, M("MONTO S/")],
    filas: porMes(d.ingresos, (x) => x.fecha, (x) => [String(x.numero).padStart(4, "0"), fechaPe(x.fecha), x.rubro.toUpperCase(), x.pagador.toUpperCase(), x.concepto.toUpperCase(), x.monto], (x) => x.monto, 6),
  };

  const comprobantes: HojaBal = {
    clave: "comprobantes",
    pestana: "COMPROBANTES",
    titulo: `COMPROBANTES DE PAGO ${anio}`,
    columnas: [{ titulo: "N° CP", ancho: 12 }, { titulo: "FECHA", ancho: 12 }, { titulo: "BENEFICIARIO", ancho: 30 }, { titulo: "CONCEPTO", ancho: 46 }, { titulo: "CHEQUE", ancho: 14 }, { titulo: "PARTIDA", ancho: 14 }, M("IMPORTE S/")],
    filas: porMes(d.cps, (x) => x.fecha, (x) => [x.codigo, fechaPe(x.fecha), x.beneficiario.toUpperCase(), x.concepto.toUpperCase(), x.cheque ?? null, x.partida, x.importe], (x) => x.importe, 7),
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

  // ---------------------------------------------------------------- BALANCE CONSTRUCTIVO (4 dígitos)
  type Cta = { cod: string; nombre: string; apD: number; apH: number; moD: number; moH: number };
  const cuentas = new Map<string, Cta>();
  const tomar = (cod: string, nombre: string) => {
    let c = cuentas.get(cod);
    if (!c) { c = { cod, nombre, apD: 0, apH: 0, moD: 0, moH: 0 }; cuentas.set(cod, c); }
    return c;
  };
  const inicial = r2(d.saldoBancoInicial + d.saldoCajaInicial);
  if (inicial !== 0) {
    tomar("1101", "CAJA Y BANCOS").apD += inicial;
    tomar("3401", "RESULTADOS ACUMULADOS").apH += inicial;
  }
  for (let i = 0; i < 12; i++) {
    libroDiario(d, mm(anio, i)).forEach((a) => a.lineas.forEach((l) => {
      const cod = l.cuenta.slice(0, 4);
      const nombre = cod === "1101" ? "CAJA Y BANCOS" : l.cuenta.replace(/^[\d.]+\s+/, "").toUpperCase();
      const c = tomar(cod, nombre);
      c.moD = r2(c.moD + l.debe);
      c.moH = r2(c.moH + l.haber);
    }));
  }
  const lista = [...cuentas.values()].sort((a, b) => a.cod.localeCompare(b.cod));
  const t = { apD: 0, apH: 0, moD: 0, moH: 0, sD: 0, sH: 0, act: 0, pas: 0, gas: 0, ing: 0 };
  const sal = new Map<string, number>();
  const filasBC: FilaBal[] = lista.map((c) => {
    const neto = r2(c.apD - c.apH + c.moD - c.moH);
    sal.set(c.cod, neto);
    const sD = neto > 0 ? neto : 0;
    const sH = neto < 0 ? -neto : 0;
    const g = c.cod[0];
    let act = 0, pas = 0, gas = 0, ing = 0;
    if (g === "1") { if (sD) act = sD; else pas = sH; }
    else if (g === "2" || g === "3") { if (sH) pas = sH; else act = sD; }
    else if (g === "5") { if (sD) gas = sD; else ing = sH; }
    else { if (sH) ing = sH; else gas = sD; }
    t.apD += c.apD; t.apH += c.apH; t.moD += c.moD; t.moH += c.moH; t.sD += sD; t.sH += sH; t.act += act; t.pas += pas; t.gas += gas; t.ing += ing;
    return { tipo: "fila", celdas: [c.cod, c.nombre, c.apD, c.apH, c.moD, c.moH, sD || null, sH || null, act || null, pas || null, gas || null, ing || null] };
  });
  const dif = r2(t.ing - t.gas);
  const sub: Celda[] = ["", "SUB TOTAL", r2(t.apD), r2(t.apH), r2(t.moD), r2(t.moH), r2(t.sD), r2(t.sH), r2(t.act), r2(t.pas), r2(t.gas), r2(t.ing)];
  const res: Celda[] = ["", dif >= 0 ? "RESULTADO DEL EJERCICIO · SUPERÁVIT" : "RESULTADO DEL EJERCICIO · DÉFICIT", null, null, null, null, null, null, dif < 0 ? -dif : null, dif >= 0 ? dif : null, dif >= 0 ? dif : null, dif < 0 ? -dif : null];
  const fin: Celda[] = ["", "TOTAL", null, null, null, null, null, null, r2(t.act + (dif < 0 ? -dif : 0)), r2(t.pas + (dif >= 0 ? dif : 0)), r2(t.gas + (dif >= 0 ? dif : 0)), r2(t.ing + (dif < 0 ? -dif : 0))];
  const constructivo: HojaBal = {
    clave: "constructivo",
    pestana: "B. CONSTRUCTIVO",
    titulo: `BALANCE CONSTRUCTIVO · Del 01/01/${anio} al 31/12/${anio} · En soles`,
    columnas: [{ titulo: "CTA.", ancho: 8 }, { titulo: "NOMBRE DE LA CUENTA", ancho: 44 }, M("DEBE", 14), M("HABER", 14), M("DEBE", 14), M("HABER", 14), M("DEUDOR", 14), M("ACREEDOR", 14), M("ACTIVO", 14), M("PASIVO", 14), M("GASTOS", 14), M("INGRESOS", 14)],
    grupos: [{ titulo: "", desde: 0, hasta: 1 }, { titulo: "APERTURA", desde: 2, hasta: 3 }, { titulo: "MOVIMIENTOS ACUMULADOS", desde: 4, hasta: 5 }, { titulo: "SALDOS AJUSTADOS", desde: 6, hasta: 7 }, { titulo: "PATRIMONIAL", desde: 8, hasta: 9 }, { titulo: "GESTIÓN", desde: 10, hasta: 11 }],
    filas: [...filasBC, { tipo: "total", celdas: sub }, { tipo: "destacado", celdas: res }, { tipo: "total", celdas: fin }],
    nota: "Armado con los asientos del libro diario del año. La apertura es el saldo inicial de bancos y caja.",
  };

  // ---------------------------------------------------------------- EF1 y EF2
  const grupoDe = (g: string) => lista.filter((c) => c.cod[0] === g);
  const saldoDe = (c: Cta) => sal.get(c.cod) ?? 0;
  const sumaG = (g: string, signo: 1 | -1) => r2(grupoDe(g).reduce((s, c) => s + signo * saldoDe(c), 0));
  const activo = sumaG("1", 1);
  const pasivo = sumaG("2", -1);
  const acum = sumaG("3", -1);
  const resultado = r2(-(sumaG("4", 1) + sumaG("5", 1)));
  const lineasCta = (g: string, signo: 1 | -1): FilaBal[] => grupoDe(g).map((c) => ({ tipo: "fila", celdas: [c.cod, c.nombre, r2(signo * saldoDe(c))] }));
  const ef1: HojaBal = {
    clave: "ef1",
    pestana: "EF1 · SITUACIÓN",
    titulo: `ESTADO DE SITUACIÓN FINANCIERA al 31/12/${anio}`,
    columnas: [{ titulo: "CTA.", ancho: 8 }, { titulo: "CONCEPTO", ancho: 60 }, M("S/", 18)],
    filas: [
      { tipo: "grupo", celdas: ["ACTIVO", null, null] }, ...lineasCta("1", 1), { tipo: "total", celdas: ["", "TOTAL ACTIVO", activo] },
      { tipo: "grupo", celdas: ["PASIVO", null, null] }, ...lineasCta("2", -1), { tipo: "total", celdas: ["", "TOTAL PASIVO", pasivo] },
      { tipo: "grupo", celdas: ["PATRIMONIO", null, null] }, ...lineasCta("3", -1), { tipo: "fila", celdas: ["", "RESULTADO DEL EJERCICIO", resultado] },
      { tipo: "total", celdas: ["", "TOTAL PATRIMONIO", r2(acum + resultado)] },
      { tipo: "destacado", celdas: ["", "TOTAL PASIVO Y PATRIMONIO", r2(pasivo + acum + resultado)] },
    ],
    nota: Math.abs(activo - (pasivo + acum + resultado)) < 0.01 ? "✓ El estado cuadra: activo = pasivo + patrimonio." : "⚠ El estado no cuadra; revise los datos contables.",
  };
  const ingTot = sumaG("4", -1);
  const gasTot = sumaG("5", 1);
  const ef2: HojaBal = {
    clave: "ef2",
    pestana: "EF2 · GESTIÓN",
    titulo: `ESTADO DE GESTIÓN del 01/01/${anio} al 31/12/${anio}`,
    columnas: [{ titulo: "CTA.", ancho: 8 }, { titulo: "CONCEPTO", ancho: 60 }, M("S/", 18)],
    filas: [
      { tipo: "grupo", celdas: ["INGRESOS", null, null] }, ...lineasCta("4", -1), { tipo: "total", celdas: ["", "TOTAL INGRESOS", ingTot] },
      { tipo: "grupo", celdas: ["GASTOS", null, null] }, ...lineasCta("5", 1), { tipo: "total", celdas: ["", "TOTAL GASTOS", gasTot] },
      { tipo: "destacado", celdas: ["", resultado >= 0 ? "RESULTADO DEL EJERCICIO · SUPERÁVIT" : "RESULTADO DEL EJERCICIO · DÉFICIT", resultado] },
    ],
  };

  return [bancos, ingresos, comprobantes, cajaChica, constructivo, ef1, ef2];
}
