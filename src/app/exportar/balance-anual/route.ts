import ExcelJS from "exceljs";
import { NextResponse, type NextRequest } from "next/server";
import { hojasBalance, type FormatoEF, type LineaEF } from "@/lib/balanceAnual";
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
    if (h.ef) { hojaEF(ws, h.ef, ctx.mcp.nombre.toUpperCase(), anio); return; }
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

/** EF-1 y EF-2 con el mismo formato del modelo: cajas con borde, totales en amarillo y firmas. */
function hojaEF(ws: ExcelJS.Worksheet, ef: FormatoEF, nombre: string, anio: number) {
  const dos = !!ef.der;
  const negro = { style: "thin" as const, color: { argb: "FF9DB9EA" } };
  const caja = { top: negro, bottom: negro, left: negro, right: negro };
  const amarillo = { type: "pattern" as const, pattern: "solid" as const, fgColor: { argb: "FFECF3FE" } };
  const azul = { type: "pattern" as const, pattern: "solid" as const, fgColor: { argb: "FF2B6FE6" } };
  const tinta = { argb: "FF1F5BC7" };
  ws.columns = dos ? [{ width: 46 }, { width: 14 }, { width: 14 }, { width: 3 }, { width: 46 }, { width: 14 }, { width: 14 }] : [{ width: 54 }, { width: 16 }, { width: 16 }];
  const ultimaCol = dos ? 7 : 3;
  ws.mergeCells(1, 1, 1, ultimaCol - 1);
  ws.getCell(1, 1).value = nombre;
  ws.getCell(1, 1).font = { bold: true, size: 12, color: tinta };
  ws.getCell(1, ultimaCol).value = ef.codigo;
  ws.getCell(1, ultimaCol).font = { bold: true, size: 14, color: { argb: "FFFFFFFF" } };
  ws.getCell(1, ultimaCol).fill = azul;
  ws.getCell(1, ultimaCol).alignment = { horizontal: "center" };
  ws.mergeCells(3, 1, 3, ultimaCol);
  ws.getCell(3, 1).value = ef.titulo;
  ws.getCell(3, 1).font = { bold: true, size: 14, color: tinta };
  ws.getCell(3, 1).alignment = { horizontal: "center" };
  ws.mergeCells(4, 1, 4, ultimaCol);
  ws.getCell(4, 1).value = ef.codigo === "EF-1" ? `01 de Enero al 31 de Diciembre del ${anio}` : `Del 01 de Enero al 31 de Diciembre de ${anio}`;
  ws.getCell(4, 1).alignment = { horizontal: "center" };
  ws.mergeCells(5, 1, 5, ultimaCol);
  ws.getCell(5, 1).value = "(EN SOLES, A VALORES HISTÓRICOS)";
  ws.getCell(5, 1).alignment = { horizontal: "center" };
  ws.getCell(7, 1).value = `Entidad: ${nombre}`;
  ws.getCell(7, 1).font = { bold: true };

  const escribir = (lineas: LineaEF[], col: number, fila0: number, conAnios: number) => {
    const total = lineas.length;
    let fila = fila0;
    lineas.forEach((l, i) => {
      if (l.tipo === "esp") { fila += 1; return; }
      const a = ws.getCell(fila, col);
      a.value = l.texto;
      if (l.tipo === "titulo" || l.tipo === "total" || l.tipo === "gran" || l.tipo === "orden") a.font = { bold: true, color: tinta };
      if (l.tipo !== "titulo") {
        [1, 2].forEach((k) => {
          const c = ws.getCell(fila, col + k);
          if (l.tipo !== "orden") { c.value = (k === 1 ? l.a : l.b) ?? 0; c.numFmt = ef.codigo === "EF-2" ? '#,##0.00;(S/. #,##0.00)' : "#,##0.00"; }
          c.border = caja;
          if (l.tipo === "total" || l.tipo === "orden") { c.fill = amarillo; c.font = { bold: true, color: tinta }; }
          if (l.tipo === "gran") { c.fill = azul; c.font = { bold: true, color: { argb: "FFFFFFFF" } }; }
        });
      }
      fila += 1;
      if (i === conAnios) {
        [1, 2].forEach((k) => {
          const c = ws.getCell(fila, col + k);
          c.value = ef.anios[k - 1];
          c.fill = azul;
          c.font = { bold: true, color: { argb: "FFFFFFFF" } };
          c.border = caja;
          c.alignment = { horizontal: "center" };
        });
        fila += 1;
      }
    });
    return total;
  };
  if (dos) {
    escribir(ef.izq, 1, 9, 1);
    escribir(ef.der!, 5, 9, 1);
  } else {
    [1, 2].forEach((k) => {
      const c = ws.getCell(9, 1 + k);
      c.value = ef.anios[k - 1];
      c.fill = azul;
      c.font = { bold: true, color: { argb: "FFFFFFFF" } };
      c.border = caja;
      c.alignment = { horizontal: "center" };
    });
    escribir(ef.izq, 1, 10, -1);
  }
  const filaFirmas = 9 + Math.max(ef.izq.length, ef.der?.length ?? 0) + 5;
  ef.firmas.forEach((f, i) => {
    const col = dos ? [1, 5, 7][i] ?? 1 : [1, 3][i] ?? 1;
    ws.getCell(filaFirmas, col).value = "..............................................";
    ws.getCell(filaFirmas + 1, col).value = f;
    ws.getCell(filaFirmas + 1, col).font = { size: 9 };
  });
  ws.pageSetup = { orientation: dos ? "landscape" : "portrait", fitToPage: true, fitToWidth: 1, fitToHeight: 1, paperSize: 9 };
}
