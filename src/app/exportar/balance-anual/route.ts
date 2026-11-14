import ExcelJS from "exceljs";
import { NextResponse, type NextRequest } from "next/server";
import { hojasBalance } from "@/lib/balanceAnual";
import { contextoMcp } from "@/lib/contexto";
import { hoyISO } from "@/lib/formato";
import { supabaseServidor } from "@/lib/supabase/server";

export const runtime = "nodejs";

/** Un solo libro de Excel con todas las hojas del balance anual (una pestaña por hoja). */
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const ctx = await contextoMcp();
  const supabase = await supabaseServidor();
  const anio = /^\d{4}$/.test(sp.get("anio") ?? "") ? Number(sp.get("anio")) : Number(hoyISO().slice(0, 4));
  const hojas = await hojasBalance(ctx, supabase, anio);

  const libro = new ExcelJS.Workbook();
  libro.creator = "Sistema MCP";
  const azul = { type: "pattern" as const, pattern: "solid" as const, fgColor: { argb: "FF2B6FE6" } };
  const celeste = { type: "pattern" as const, pattern: "solid" as const, fgColor: { argb: "FFECF3FE" } };
  const borde = { style: "thin" as const, color: { argb: "FFD3D8DE" } };

  hojas.forEach((h) => {
    const ws = libro.addWorksheet(h.pestana.replace("·", "-").replace(/[\\/?*[\]:]/g, "").slice(0, 30));
    const n = h.columnas.length;
    ws.columns = h.columnas.map((c) => ({ width: c.ancho }));
    ws.mergeCells(1, 1, 1, n);
    ws.getCell(1, 1).value = ctx.mcp.nombre.toUpperCase();
    ws.getCell(1, 1).font = { bold: true, size: 13 };
    ws.mergeCells(2, 1, 2, n);
    ws.getCell(2, 1).value = `${ctx.mcp.ruc ? `RUC ${ctx.mcp.ruc} · ` : ""}${h.titulo}`;
    ws.getCell(2, 1).font = { bold: true, size: 11 };

    let r = 4;
    if (h.grupos) {
      h.grupos.forEach((g) => {
        if (g.hasta > g.desde) ws.mergeCells(r, g.desde + 1, r, g.hasta + 1);
        const c = ws.getCell(r, g.desde + 1);
        c.value = g.titulo;
        c.font = { bold: true };
        c.alignment = { horizontal: "center" };
        c.fill = celeste;
      });
      r += 1;
    }
    const cab = ws.getRow(r);
    h.columnas.forEach((c, i) => {
      const x = cab.getCell(i + 1);
      x.value = c.titulo;
      x.font = { bold: true, color: { argb: "FFFFFFFF" } };
      x.fill = azul;
      x.alignment = { vertical: "middle", horizontal: c.tipo === "monto" ? "right" : "left", wrapText: true };
    });
    cab.height = 30;
    ws.views = [{ state: "frozen", ySplit: r }];
    r += 1;

    h.filas.forEach((f) => {
      if (f.tipo === "grupo") {
        ws.mergeCells(r, 1, r, n);
        const c = ws.getCell(r, 1);
        c.value = f.celdas[0];
        c.font = { bold: true };
        c.fill = celeste;
      } else {
        f.celdas.forEach((v, i) => {
          const c = ws.getRow(r).getCell(i + 1);
          c.value = v ?? null;
          if (h.columnas[i]?.tipo === "monto") c.numFmt = "#,##0.00";
          c.border = { top: borde, bottom: borde, left: borde, right: borde };
          if (f.tipo === "grupo4") c.font = { bold: true };
          if (f.tipo === "total" || f.tipo === "destacado") { c.font = { bold: true }; c.fill = celeste; }
        });
      }
      r += 1;
    });
    if (h.nota) {
      ws.mergeCells(r + 1, 1, r + 1, n);
      ws.getCell(r + 1, 1).value = h.nota;
      ws.getCell(r + 1, 1).font = { italic: true, color: { argb: "FF555555" } };
    }
  });

  const buffer = await libro.xlsx.writeBuffer();
  return new NextResponse(buffer as ArrayBuffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="balance-anual-${anio}.xlsx"`,
      "Cache-Control": "no-store",
    },
  });
}
