import ExcelJS from "exceljs";
import { NextResponse, type NextRequest } from "next/server";
import { contextoMcp } from "@/lib/contexto";
import { periodoActual } from "@/lib/formato";
import { supabaseServidor } from "@/lib/supabase/server";
import { construirHoja } from "@/lib/reportes";

export const runtime = "nodejs";

export async function GET(req: NextRequest, { params }: { params: Promise<{ lista: string }> }) {
  const { lista } = await params;
  const sp = req.nextUrl.searchParams;
  const ctx = await contextoMcp();
  const supabase = await supabaseServidor();
  const mes = sp.get("mes") || periodoActual();
  const r = await construirHoja(lista, ctx, supabase, sp);
  if ("error" in r) return NextResponse.json({ error: r.error }, { status: 404 });
  const hoja = r;

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
  const nombre = `${lista}-${lista === "kardex" || lista === "rendicion" ? "detalle" : lista === "contabilidad" && sp.get("ver") === "acumulado" ? `acumulado-${sp.get("cuadro") ?? "ingresos"}-${mes.slice(0, 4)}` : mes}.xlsx`;
  return new NextResponse(buffer as ArrayBuffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${nombre}"`,
      "Cache-Control": "no-store",
    },
  });
}
