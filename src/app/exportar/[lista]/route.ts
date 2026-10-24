import ExcelJS from "exceljs";
import { NextResponse, type NextRequest } from "next/server";
import { contextoMcp } from "@/lib/contexto";
import { codigoCP, nombrePeriodo, num3, periodoActual, rangoPeriodo } from "@/lib/formato";
import { supabaseServidor } from "@/lib/supabase/server";

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
  const { desde, hasta } = rangoPeriodo(mes);
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
      const { data: cajas } = await supabase.from("cajas_chicas").select("id, monto_fondo").eq("mcp_id", mcpId).eq("periodo", mes).neq("estado", "anulada");
      const caja = (cajas ?? [])[0];
      const { data } = caja
        ? await supabase.from("caja_chica_gastos").select("fecha, concepto, sustento_tipo, sustento_numero, razon_social, monto, anulado").eq("caja_id", caja.id).order("fecha")
        : { data: [] as { fecha: string; concepto: string; sustento_tipo: string; sustento_numero: string | null; razon_social: string; monto: number; anulado: boolean }[] };
      const filas = (data ?? [])
        .filter((g) => !q || `${g.concepto} ${g.razon_social}`.toUpperCase().includes(q.toUpperCase()))
        .map((g, i) => [i + 1, fechaPe(g.fecha), g.concepto, g.sustento_tipo, g.sustento_numero, g.razon_social, g.anulado ? "Anulado" : "Vigente", g.anulado ? 0 : Number(g.monto)]);
      hoja = {
        titulo: `Caja chica · ${nombrePeriodo(mes)}${caja ? ` · fondo S/ ${Number(caja.monto_fondo).toFixed(2)}` : ""}`,
        columnas: [
          { titulo: "N°", ancho: 6 }, { titulo: "Fecha", ancho: 12 }, { titulo: "Concepto", ancho: 44 }, { titulo: "Sustento", ancho: 10 },
          { titulo: "N° documento", ancho: 16 }, { titulo: "Razón social / persona", ancho: 34 }, { titulo: "Estado", ancho: 10 }, { titulo: "Monto S/", ancho: 14, tipo: "monto" },
        ],
        filas,
        totales: ["TOTAL", null, null, null, null, null, null, suma(filas, 7)],
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
        totales: ["TOTAL", null, null, null, null, null, suma(filas, 6)],
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
          totales: ["TOTAL", null, null, null, null, null, suma(filas, 6)],
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
          totales: ["TOTAL", null, null, null, null, null, suma(filas, 6)],
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
