import ExcelJS from "exceljs";
import { NextResponse, type NextRequest } from "next/server";
import { contextoMcp } from "@/lib/contexto";
import { codigoCP, nombrePeriodo, num3, periodoActual, rangoPeriodo } from "@/lib/formato";
import { supabaseServidor } from "@/lib/supabase/server";
import { cargarContabilidad, libro as libroContable, libroDiario, matriz, MESES_CORTOS, nombreRubro } from "@/lib/contabilidad";

export const runtime = "nodejs";

type Columna = { titulo: string; ancho: number; tipo?: "monto" | "cantidad" | "fecha" | "texto" };
type Hoja = { titulo: string; columnas: Columna[]; filas: (string | number | null)[][]; totales?: (string | number | null)[] };

const ESTADO: Record<string, string> = { borrador: "Borrador", aprobado: "Aprobado", rendido: "Rendido", anulado: "Anulado", emitido: "Emitido" };
const TIPO_GASTO: Record<string, string> = { compra: "Compra", servicio: "Servicio", pago_fijo: "Pago fijo" };
const ORIGEN_CP: Record<string, string> = { expediente: "Expediente", caja_chica: "Caja chica", directo: "Directo" };
const fechaPe = (f: string | null) => (f ? f.split("-").reverse().join("/") : "");
const suma = (xs: (string | number | null)[][], i: number) => Math.round(xs.reduce((s, f) => s + (Number(f[i]) || 0), 0) * 100) / 100;

export async function GET(req: NextRequest, { params }: { params: Promise<{ lista: string }> }) {
  const { lista } = await params;
  const sp = req.nextUrl.searchParams;
  const ctx = await contextoMcp();
  const supabase = await supabaseServidor();
  const mcpId = ctx.mcp.id;
  const mes = sp.get("mes") || periodoActual();
  const rangoMes = rangoPeriodo(mes);
  const esFecha = (v: string | null) => !!v && /^\d{4}-\d{2}-\d{2}$/.test(v);
  // Si se pide un tramo (quincena, semana, día) se usa ese; si no, el mes completo
  const desde = esFecha(sp.get("desde")) ? sp.get("desde")! : rangoMes.desde;
  const hasta = esFecha(sp.get("hasta")) ? sp.get("hasta")! : rangoMes.hasta;
  // Sin comas ni paréntesis: así el texto no altera los filtros de la consulta.
  const q = (sp.get("q") ?? "").replace(/[,()%*\\]/g, " ").trim();
  const estado = sp.get("estado") || "";
  let hoja: Hoja;

  switch (lista) {
    case "expedientes": {
      let c = supabase
        .from("expedientes")
        .select("numero, anio, fecha, tipo, descripcion, area_usuaria, fase, estado, expediente_items(total, anulado), fuentes(municipalidad)")
        .eq("mcp_id", mcpId).gte("fecha", desde).lte("fecha", hasta).order("numero");
      if (estado) c = c.eq("estado", estado);
      if (q) c = c.ilike("descripcion", `%${q}%`);
      if (sp.get("tipo")) c = c.eq("tipo", sp.get("tipo")!);
      const { data } = await c;
      const filas = (data ?? []).map((e) => [
        `${num3(e.numero)}-${e.anio}`, fechaPe(e.fecha), TIPO_GASTO[e.tipo] ?? e.tipo, e.descripcion, e.area_usuaria,
        (e.fuentes as unknown as { municipalidad: string } | null)?.municipalidad ?? "", ESTADO[e.estado] ?? e.estado,
        e.estado === "anulado" ? 0 : (e.expediente_items as { total: number; anulado: boolean }[]).filter((i) => !i.anulado).reduce((s, i) => s + Number(i.total), 0),
      ]);
      hoja = {
        titulo: `Expedientes · ${nombrePeriodo(mes)}`,
        columnas: [
          { titulo: "N°", ancho: 11 }, { titulo: "Fecha", ancho: 12 }, { titulo: "Tipo", ancho: 12 }, { titulo: "Descripción", ancho: 50 },
          { titulo: "Área usuaria", ancho: 20 }, { titulo: "Se paga con", ancho: 34 }, { titulo: "Estado", ancho: 12 }, { titulo: "Monto S/", ancho: 14, tipo: "monto" },
        ],
        filas,
        totales: ["TOTAL", null, null, null, null, null, null, suma(filas, 7)],
      };
      break;
    }
    case "comprobantes": {
      let c = supabase
        .from("comprobantes_pago")
        .select("numero, origen, fecha, beneficiario, concepto, importe, cheque, estado, funcion, fuentes(municipalidad)")
        .eq("mcp_id", mcpId).gte("fecha", desde).lte("fecha", hasta).order("numero");
      if (estado) c = c.eq("estado", estado);
      if (sp.get("fuente")) c = c.eq("fuente_id", sp.get("fuente")!);
      if (q) c = c.or(`beneficiario.ilike.%${q}%,concepto.ilike.%${q}%,cheque.ilike.%${q}%`);
      const { data } = await c;
      const filas = (data ?? []).map((x) => [
        codigoCP(x.numero, x.origen), fechaPe(x.fecha), ORIGEN_CP[x.origen] ?? x.origen, x.beneficiario, x.concepto,
        (x.fuentes as unknown as { municipalidad: string } | null)?.municipalidad ?? "", x.funcion, x.cheque, ESTADO[x.estado] ?? x.estado,
        x.estado === "anulado" ? 0 : Number(x.importe),
      ]);
      hoja = {
        titulo: `Comprobantes de pago · ${nombrePeriodo(mes)}`,
        columnas: [
          { titulo: "N° CP", ancho: 12 }, { titulo: "Fecha", ancho: 12 }, { titulo: "Origen", ancho: 12 }, { titulo: "Beneficiario", ancho: 34 },
          { titulo: "Concepto", ancho: 46 }, { titulo: "Se pagó con", ancho: 34 }, { titulo: "Función", ancho: 26 }, { titulo: "N° cheque", ancho: 14 },
          { titulo: "Estado", ancho: 12 }, { titulo: "Importe S/", ancho: 14, tipo: "monto" },
        ],
        filas,
        totales: ["TOTAL", null, null, null, null, null, null, null, null, suma(filas, 9)],
      };
      break;
    }
    case "ingresos": {
      let c = supabase.from("ingresos").select("numero, anio, fecha, rubro, concepto, pagador_doc, pagador_nombre, monto, estado")
        .eq("mcp_id", mcpId).gte("fecha", desde).lte("fecha", hasta).order("numero");
      if (estado) c = c.eq("estado", estado);
      if (sp.get("rubro")) c = c.eq("rubro", sp.get("rubro")!);
      if (q) c = c.or(`concepto.ilike.%${q}%,pagador_nombre.ilike.%${q}%,pagador_doc.ilike.%${q}%`);
      const { data } = await c;
      const filas = (data ?? []).map((x) => [
        `${String(x.numero).padStart(4, "0")}-${x.anio}`, fechaPe(x.fecha), x.rubro, x.concepto, x.pagador_doc, x.pagador_nombre,
        ESTADO[x.estado] ?? x.estado, x.estado === "anulado" ? 0 : Number(x.monto),
      ]);
      hoja = {
        titulo: `Ingresos propios · ${nombrePeriodo(mes)}`,
        columnas: [
          { titulo: "N° recibo", ancho: 12 }, { titulo: "Fecha", ancho: 12 }, { titulo: "Rubro", ancho: 12 }, { titulo: "Concepto", ancho: 44 },
          { titulo: "DNI / RUC", ancho: 14 }, { titulo: "Pagó", ancho: 34 }, { titulo: "Estado", ancho: 12 }, { titulo: "Monto S/", ancho: 14, tipo: "monto" },
        ],
        filas,
        totales: ["TOTAL", null, null, null, null, null, null, suma(filas, 7)],
      };
      break;
    }
    case "caja-chica": {
      const { data: cajas } = await supabase.from("cajas_chicas").select("id, monto_fondo, numero_cheque").eq("mcp_id", mcpId).eq("periodo", mes).neq("estado", "anulada").order("numero");
      const caja = (cajas ?? []).find((c) => c.id === sp.get("caja")) ?? (cajas ?? [])[0];
      const { data } = caja
        ? await supabase.from("caja_chica_gastos").select("fecha, concepto, sustento_tipo, sustento_numero, razon_social, monto, anulado").eq("caja_id", caja.id).order("fecha")
        : { data: [] as { fecha: string; concepto: string; sustento_tipo: string; sustento_numero: string | null; razon_social: string; monto: number; anulado: boolean }[] };
      // Mismo formato que la hoja de caja chica: N°, FECHA, CP, N° CP, RAZÓN SOCIAL, CONCEPTO, MONTO (solo gastos vigentes)
      const filas = (data ?? [])
        .filter((g) => !g.anulado)
        .filter((g) => !q || `${g.concepto} ${g.razon_social}`.toUpperCase().includes(q.toUpperCase()))
        .map((g, i) => [i + 1, fechaPe(g.fecha), (caja?.numero_cheque ?? "").toUpperCase(), g.sustento_tipo, g.sustento_numero ?? "SN", g.razon_social.toUpperCase(), g.concepto.toUpperCase(), Number(g.monto)]);
      hoja = {
        titulo: `CAJA CHICA MES DE ${nombrePeriodo(mes).toUpperCase()}${caja ? ` · FONDO S/ ${Number(caja.monto_fondo).toFixed(2)}` : ""}`,
        columnas: [
          { titulo: "N°", ancho: 6 }, { titulo: "FECHA", ancho: 12 }, { titulo: "CHEQUE", ancho: 14 }, { titulo: "CP", ancho: 8 }, { titulo: "N° CP", ancho: 14 },
          { titulo: "RAZON SOCIAL", ancho: 38 }, { titulo: "CONCEPTO", ancho: 70 }, { titulo: "MONTO", ancho: 14, tipo: "monto" },
        ],
        filas,
        totales: ["TOTAL", null, null, null, null, null, null, suma(filas, 7)],
      };
      break;
    }
    case "caja-chica-anio": {
      const anio = mes.slice(0, 4);
      const fuenteId = sp.get("fuente") || "";
      let cq = supabase.from("cajas_chicas").select("id, periodo, numero, numero_cheque, monto_fondo, estado").eq("mcp_id", mcpId).gte("periodo", `${anio}-01`).lte("periodo", `${anio}-12`).neq("estado", "anulada").order("periodo").order("numero");
      if (fuenteId) cq = cq.eq("fuente_id", fuenteId);
      const { data: cajas } = await cq;
      const ids = (cajas ?? []).map((c) => c.id);
      const { data: gs } = ids.length ? await supabase.from("caja_chica_gastos").select("caja_id, monto").in("caja_id", ids).eq("anulado", false) : { data: [] as { caja_id: string; monto: number }[] };
      const filas = (cajas ?? []).map((c) => {
        const mios = (gs ?? []).filter((g) => g.caja_id === c.id);
        const gastado = mios.reduce((t, g) => t + Number(g.monto), 0);
        return [nombrePeriodo(c.periodo).toUpperCase(), c.numero ?? 1, c.numero_cheque ?? "", Number(c.monto_fondo), gastado, Number(c.monto_fondo) - gastado, mios.length, c.estado === "abierta" ? "ABIERTA" : "LIQUIDADA"];
      });
      hoja = {
        titulo: `CAJA CHICA ${anio} · CUADRO POR MES`,
        columnas: [
          { titulo: "MES", ancho: 22 }, { titulo: "CAJA", ancho: 8 }, { titulo: "CHEQUE", ancho: 16 }, { titulo: "FONDO", ancho: 14, tipo: "monto" },
          { titulo: "GASTADO", ancho: 14, tipo: "monto" }, { titulo: "SALDO", ancho: 14, tipo: "monto" }, { titulo: "GASTOS", ancho: 9 }, { titulo: "ESTADO", ancho: 12 },
        ],
        filas,
        totales: ["TOTAL", null, null, suma(filas, 3), suma(filas, 4), suma(filas, 5), filas.reduce((t, f) => t + Number(f[6]), 0), null],
      };
      break;
    }
    case "ingresos-anio": {
      const anio = mes.slice(0, 4);
      const { data: ing } = await supabase.from("ingresos").select("fecha, monto, numero").eq("mcp_id", mcpId).eq("estado", "emitido").gte("fecha", `${anio}-01-01`).lte("fecha", `${anio}-12-31`);
      const meses = Array.from({ length: 12 }, (_, i) => {
        const per = `${anio}-${String(i + 1).padStart(2, "0")}`;
        const rec = (ing ?? []).filter((r) => r.fecha.startsWith(per));
        const nums = rec.map((r) => Number(r.numero));
        return { per, n: rec.length, ingreso: rec.reduce((t, r) => t + Number(r.monto), 0), del: nums.length ? Math.min(...nums) : null, al: nums.length ? Math.max(...nums) : null };
      });
      const cod = (n: number | null) => (n === null ? "" : String(n).padStart(4, "0"));
      const filas = meses.map((m) => [nombrePeriodo(m.per).toUpperCase(), m.n, cod(m.del), cod(m.al), m.ingreso]);
      hoja = {
        titulo: `INGRESOS PROPIOS ${anio} · RESUMEN POR MES`,
        columnas: [
          { titulo: "MES", ancho: 22 }, { titulo: "RECIBOS", ancho: 10 }, { titulo: "DEL RECIBO N°", ancho: 14 }, { titulo: "AL RECIBO N°", ancho: 14 },
          { titulo: "RECAUDADO", ancho: 16, tipo: "monto" },
        ],
        filas,
        totales: ["TOTAL", filas.reduce((t, f) => t + Number(f[1]), 0), null, null, suma(filas, 4)],
      };
      break;
    }
    case "rendicion": {
      const id = sp.get("id");
      const { data: r } = await supabase.from("rendiciones").select("numero, anio, periodo, transferencia, fuentes(municipalidad)").eq("id", id ?? "").single();
      if (!r) return NextResponse.json({ error: "Rendición no encontrada" }, { status: 404 });
      const { data: its } = await supabase
        .from("rendicion_items")
        .select("comprobantes_pago(numero, origen, fecha, cheque, beneficiario, concepto, funcion, importe)")
        .eq("rendicion_id", id!).eq("activo", true);
      type Cp = { numero: number; origen: string; fecha: string; cheque: string | null; beneficiario: string; concepto: string; funcion: string | null; importe: number };
      const filas = (its ?? [])
        .map((i) => i.comprobantes_pago as unknown as Cp)
        .sort((a, b) => a.fecha.localeCompare(b.fecha))
        .map((c) => [codigoCP(c.numero, c.origen), fechaPe(c.fecha), c.cheque, c.beneficiario, c.concepto, c.funcion, Number(c.importe)]);
      hoja = {
        titulo: `Rendición ${num3(r.numero)}-${r.anio} · ${(r.fuentes as unknown as { municipalidad: string } | null)?.municipalidad ?? ""} · ${nombrePeriodo(r.periodo)} · transferido S/ ${Number(r.transferencia).toFixed(2)}`,
        columnas: [
          { titulo: "N° CP", ancho: 12 }, { titulo: "Fecha", ancho: 12 }, { titulo: "N° cheque", ancho: 14 }, { titulo: "Beneficiario", ancho: 34 },
          { titulo: "Concepto", ancho: 46 }, { titulo: "Función", ancho: 26 }, { titulo: "Importe S/", ancho: 14, tipo: "monto" },
        ],
        filas,
        totales: ["TOTAL", null, null, null, null, null, null, suma(filas, 7)],
      };
      break;
    }
    case "almacen": {
      const ver = sp.get("ver") || "stock";
      if (ver === "stock") {
        const { data } = await supabase.from("almacen_stock").select("*").eq("mcp_id", mcpId).order("descripcion");
        const filtro = sp.get("filtro") || "todos";
        const filas = (data ?? [])
          .filter((b) => !q || b.descripcion.includes(q.toUpperCase()))
          .filter((b) => filtro === "todos" || (filtro === "con" ? b.stock > 0 : filtro === "sin" ? b.stock <= 0 : b.stock_minimo > 0 && b.stock <= b.stock_minimo))
          .map((b) => [String(b.codigo).padStart(5, "0"), b.descripcion, b.unidad, Number(b.entradas), Number(b.salidas), Number(b.stock), Number(b.stock_minimo), Number(b.costo_promedio), Number(b.valor)]);
        hoja = {
          titulo: "Stock del almacén",
          columnas: [
            { titulo: "Código", ancho: 10 }, { titulo: "Bien", ancho: 44 }, { titulo: "Unidad", ancho: 12 }, { titulo: "Entró", ancho: 11, tipo: "cantidad" },
            { titulo: "Salió", ancho: 11, tipo: "cantidad" }, { titulo: "Stock", ancho: 11, tipo: "cantidad" }, { titulo: "Mínimo", ancho: 11, tipo: "cantidad" },
            { titulo: "Costo prom. S/", ancho: 15, tipo: "monto" }, { titulo: "Valor S/", ancho: 15, tipo: "monto" },
          ],
          filas,
          totales: ["VALOR TOTAL", null, null, null, null, null, null, null, suma(filas, 8)],
        };
      } else if (ver === "entradas") {
        const { data } = await supabase.from("notas_entrada").select("numero, anio, fecha, origen, proveedor, documento_ref, anulado, nota_entrada_items(total)")
          .eq("mcp_id", mcpId).gte("fecha", desde).lte("fecha", hasta).order("numero");
        const filas = (data ?? []).map((n) => [`NEA ${num3(n.numero)}-${n.anio}`, fechaPe(n.fecha), n.origen, n.proveedor, n.documento_ref, n.anulado ? "Anulada" : "Emitida",
          n.anulado ? 0 : (n.nota_entrada_items as { total: number }[]).reduce((s, i) => s + Number(i.total), 0)]);
        hoja = {
          titulo: `Entradas al almacén (NEA) · ${nombrePeriodo(mes)}`,
          columnas: [{ titulo: "N°", ancho: 14 }, { titulo: "Fecha", ancho: 12 }, { titulo: "Tipo", ancho: 12 }, { titulo: "Proveedor / procedencia", ancho: 36 },
            { titulo: "Documento", ancho: 22 }, { titulo: "Estado", ancho: 10 }, { titulo: "Valor S/", ancho: 14, tipo: "monto" }],
          filas,
          totales: ["TOTAL", null, null, null, null, null, null, suma(filas, 7)],
        };
      } else {
        const { data } = await supabase.from("pecosas").select("numero, anio, fecha, area_solicitante, solicitante, finalidad, anulado, pecosa_items(total)")
          .eq("mcp_id", mcpId).gte("fecha", desde).lte("fecha", hasta).order("numero");
        const filas = (data ?? []).map((p) => [`PECOSA ${num3(p.numero)}-${p.anio}`, fechaPe(p.fecha), p.area_solicitante, p.solicitante, p.finalidad, p.anulado ? "Anulada" : "Emitida",
          p.anulado ? 0 : (p.pecosa_items as { total: number }[]).reduce((s, i) => s + Number(i.total), 0)]);
        hoja = {
          titulo: `Salidas del almacén (PECOSA) · ${nombrePeriodo(mes)}`,
          columnas: [{ titulo: "N°", ancho: 16 }, { titulo: "Fecha", ancho: 12 }, { titulo: "Área", ancho: 26 }, { titulo: "Recibió", ancho: 30 },
            { titulo: "Para qué", ancho: 34 }, { titulo: "Estado", ancho: 10 }, { titulo: "Valor S/", ancho: 14, tipo: "monto" }],
          filas,
          totales: ["TOTAL", null, null, null, null, null, null, suma(filas, 7)],
        };
      }
      break;
    }
    case "kardex": {
      const bien = sp.get("bien") ?? "";
      const [{ data: b }, { data: ent }, { data: sal }] = await Promise.all([
        supabase.from("almacen_bienes").select("codigo, descripcion, unidad").eq("id", bien).single(),
        supabase.from("nota_entrada_items").select("cantidad, precio_unitario, total, notas_entrada!inner(numero, anio, fecha, proveedor, anulado, creado_en)").eq("bien_id", bien),
        supabase.from("pecosa_items").select("cantidad, precio_unitario, total, pecosas!inner(numero, anio, fecha, area_solicitante, anulado, creado_en)").eq("bien_id", bien),
      ]);
      if (!b) return NextResponse.json({ error: "Bien no encontrado" }, { status: 404 });
      type M = { fecha: string; en: string; doc: string; det: string; entra: number; sale: number; precio: number; total: number; anulado: boolean };
      const movs: M[] = [
        ...(ent ?? []).map((m) => { const n = m.notas_entrada as unknown as { numero: number; anio: number; fecha: string; proveedor: string | null; anulado: boolean; creado_en: string };
          return { fecha: n.fecha, en: n.creado_en, doc: `NEA ${num3(n.numero)}-${n.anio}`, det: n.proveedor ?? "", entra: Number(m.cantidad), sale: 0, precio: Number(m.precio_unitario), total: Number(m.total), anulado: n.anulado }; }),
        ...(sal ?? []).map((m) => { const p = m.pecosas as unknown as { numero: number; anio: number; fecha: string; area_solicitante: string; anulado: boolean; creado_en: string };
          return { fecha: p.fecha, en: p.creado_en, doc: `PECOSA ${num3(p.numero)}-${p.anio}`, det: p.area_solicitante, entra: 0, sale: Number(m.cantidad), precio: Number(m.precio_unitario), total: Number(m.total), anulado: p.anulado }; }),
      ].sort((x, y) => x.fecha.localeCompare(y.fecha) || x.en.localeCompare(y.en));
      let saldo = 0;
      const filas = movs.map((m) => {
        if (!m.anulado) saldo += m.entra - m.sale;
        return [fechaPe(m.fecha), m.doc + (m.anulado ? " (anulado)" : ""), m.det, m.entra || null, m.sale || null, saldo, m.precio, m.anulado ? 0 : m.total];
      });
      hoja = {
        titulo: `Kardex · ${String(b.codigo).padStart(5, "0")} ${b.descripcion} (${b.unidad})`,
        columnas: [{ titulo: "Fecha", ancho: 12 }, { titulo: "Documento", ancho: 22 }, { titulo: "Proveedor / área", ancho: 34 }, { titulo: "Entra", ancho: 11, tipo: "cantidad" },
          { titulo: "Sale", ancho: 11, tipo: "cantidad" }, { titulo: "Saldo", ancho: 11, tipo: "cantidad" }, { titulo: "Precio S/", ancho: 13, tipo: "monto" }, { titulo: "Importe S/", ancho: 14, tipo: "monto" }],
        filas,
      };
      break;
    }
    case "contabilidad": {
      const ver = sp.get("ver") || "bancos";
      const anio = Number(mes.slice(0, 4));
      const d = await cargarContabilidad(supabase, mcpId, anio, ctx.fuentes);
      if (ver === "bancos" || ver === "caja") {
        const l = libroContable(d, ver, mes);
        const filas: (string | number | null)[][] = [
          [null, null, "SALDO ANTERIOR", null, null, l.anterior],
          ...l.filas.map((m) => [fechaPe(m.fecha), m.documento, m.detalle, m.entra || null, m.sale || null, m.saldo]),
        ];
        hoja = {
          titulo: `${ver === "bancos" ? "Libro Bancos" : "Libro Caja"} · ${nombrePeriodo(mes)}`,
          columnas: [{ titulo: "Fecha", ancho: 12 }, { titulo: "Documento", ancho: 26 }, { titulo: "Detalle", ancho: 56 }, { titulo: "Ingreso S/", ancho: 14, tipo: "monto" }, { titulo: "Egreso S/", ancho: 14, tipo: "monto" }, { titulo: "Saldo S/", ancho: 14, tipo: "monto" }],
          filas,
          totales: ["TOTALES", null, "Saldo final", l.entradas, l.salidas, l.final],
        };
      } else if (ver === "diario") {
        const filas: (string | number | null)[][] = [];
        libroDiario(d, mes).forEach((a, i) => {
          filas.push([i + 1, fechaPe(a.fecha), a.glosa, null, null]);
          a.lineas.forEach((l) => filas.push([null, null, `   ${l.cuenta}`, l.debe || null, l.haber || null]));
        });
        hoja = {
          titulo: `Libro diario simplificado · ${nombrePeriodo(mes)}`,
          columnas: [{ titulo: "N°", ancho: 6 }, { titulo: "Fecha", ancho: 12 }, { titulo: "Cuenta / glosa", ancho: 70 }, { titulo: "Debe S/", ancho: 14, tipo: "monto" }, { titulo: "Haber S/", ancho: 14, tipo: "monto" }],
          filas,
          totales: ["TOTALES", null, null, suma(filas, 3), suma(filas, 4)],
        };
      } else {
        const m1 = matriz(d.cps, (c) => `Gasto · ${c.partida}`, (c) => c.fecha, (c) => c.importe);
        const m0 = matriz(
          [...d.transferencias.map((t) => ({ k: `Ingreso · Transferencia ${t.municipalidad}`, f: t.fecha, v: t.monto })), ...d.ingresos.map((i) => ({ k: `Ingreso · Propios ${nombreRubro(i.rubro)}`, f: i.fecha, v: i.monto }))],
          (x) => x.k, (x) => x.f, (x) => x.v,
        );
        const m2 = matriz(d.cps, (c) => `Función · ${c.funcion}`, (c) => c.fecha, (c) => c.importe);
        const filas = [...m0.filas, ...m1.filas, ...m2.filas].map((f) => [f.nombre, ...f.meses, f.total]);
        hoja = {
          titulo: `Ejecución de ingresos y gastos ${anio}`,
          columnas: [{ titulo: "Concepto", ancho: 46 }, ...MESES_CORTOS.map((x) => ({ titulo: x, ancho: 11, tipo: "monto" as const })), { titulo: "Total", ancho: 13, tipo: "monto" }],
          filas,
        };
      }
      break;
    }
    default:
      return NextResponse.json({ error: "Lista no válida" }, { status: 404 });
  }

  // ---------------------------------------------------------------- libro
  const libro = new ExcelJS.Workbook();
  libro.creator = "Sistema MCP";
  const ws = libro.addWorksheet(lista.slice(0, 30), { views: [{ state: "frozen", ySplit: 4 }] });
  const n = hoja.columnas.length;
  ws.columns = hoja.columnas.map((c) => ({ width: c.ancho }));

  ws.mergeCells(1, 1, 1, n);
  ws.getCell(1, 1).value = ctx.mcp.nombre.toUpperCase();
  ws.getCell(1, 1).font = { bold: true, size: 13 };
  ws.mergeCells(2, 1, 2, n);
  ws.getCell(2, 1).value = `${ctx.mcp.ruc ? `RUC ${ctx.mcp.ruc} · ` : ""}${hoja.titulo}`;
  ws.getCell(2, 1).font = { size: 11, color: { argb: "FF444444" } };

  const cab = ws.getRow(4);
  hoja.columnas.forEach((c, i) => {
    const celda = cab.getCell(i + 1);
    celda.value = c.titulo;
    celda.font = { bold: true, color: { argb: "FFFFFFFF" } };
    celda.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF2B6FE6" } };
    celda.alignment = { vertical: "middle", horizontal: c.tipo === "monto" || c.tipo === "cantidad" ? "right" : "left", wrapText: true };
    celda.border = { bottom: { style: "thin", color: { argb: "FF1F5BC7" } } };
  });
  cab.height = 22;

  const borde = { style: "thin" as const, color: { argb: "FFD3D8DE" } };
  hoja.filas.forEach((f, r) => {
    const fila = ws.getRow(5 + r);
    f.forEach((v, i) => {
      const celda = fila.getCell(i + 1);
      celda.value = v ?? null;
      const t = hoja.columnas[i]?.tipo;
      if (t === "monto") celda.numFmt = "#,##0.00";
      if (t === "cantidad") celda.numFmt = "#,##0.###";
      celda.border = { top: borde, bottom: borde, left: borde, right: borde };
      celda.alignment = { vertical: "top", wrapText: !t };
    });
  });
  if (hoja.filas.length) ws.autoFilter = { from: { row: 4, column: 1 }, to: { row: 4 + hoja.filas.length, column: n } };

  if (hoja.totales) {
    const fila = ws.getRow(5 + hoja.filas.length);
    hoja.totales.forEach((v, i) => {
      const celda = fila.getCell(i + 1);
      celda.value = v ?? null;
      celda.font = { bold: true };
      celda.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFECF3FE" } };
      if (hoja.columnas[i]?.tipo === "monto") celda.numFmt = "#,##0.00";
    });
  }

  const buffer = await libro.xlsx.writeBuffer();
  const nombre = `${lista}-${lista === "kardex" || lista === "rendicion" ? "detalle" : mes}.xlsx`;
  return new NextResponse(buffer as ArrayBuffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${nombre}"`,
      "Cache-Control": "no-store",
    },
  });
}
