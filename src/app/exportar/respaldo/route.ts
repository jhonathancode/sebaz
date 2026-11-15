import ExcelJS from "exceljs";
import { NextResponse, type NextRequest } from "next/server";
import { obtenerContexto, tiene } from "@/lib/contexto";
import { supabaseServidor } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const maxDuration = 60;

// Tablas del negocio de la MCP (sin claves ni PIN). Las que no existan en la base se omiten.
const TABLAS = [
  "fuentes", "cuentas_bancarias", "proveedores", "pagos_fijos", "expedientes", "expediente_items", "expediente_adjuntos", "cotizaciones",
  "ordenes", "conformidades", "comprobantes_pago", "cheques_cobrados", "rendiciones", "rendicion_items", "ingresos", "caja_chica_gastos",
  "notas_entrada", "almacen_bienes", "periodos", "periodo_reaperturas", "auditoria",
];

const celda = (v: unknown) => (v === null || v === undefined ? "" : typeof v === "object" ? JSON.stringify(v) : (v as string | number | boolean));

/** Respaldo completo de una municipalidad en un Excel (una hoja por tabla). Solo su administrador o el superadmin. */
export async function GET(req: NextRequest) {
  const ctx = await obtenerContexto();
  const pedido = req.nextUrl.searchParams.get("mcp");
  const mcpId = ctx.esSuperadmin && pedido ? pedido : ctx.mcp?.id;
  if (!mcpId || !(ctx.esSuperadmin || tiene(ctx, "admin"))) return NextResponse.json({ error: "Solo el administrador puede descargar el respaldo." }, { status: 403 });
  const supabase = await supabaseServidor();
  const { data: mcp } = await supabase.from("mcps").select("nombre, ruc").eq("id", mcpId).single();
  if (!mcp) return NextResponse.json({ error: "No se encontró la municipalidad." }, { status: 404 });

  const libro = new ExcelJS.Workbook();
  libro.creator = "Sistema MCP";
  const resumen = libro.addWorksheet("RESUMEN");
  resumen.addRow([mcp.nombre.toUpperCase()]).font = { bold: true, size: 13 };
  resumen.addRow([`${mcp.ruc ? `RUC ${mcp.ruc} · ` : ""}Respaldo generado el ${new Date().toLocaleString("es-PE", { timeZone: "America/Lima" })}`]);
  resumen.addRow([]);
  resumen.addRow(["Hoja", "Filas"]).font = { bold: true };
  resumen.getColumn(1).width = 34;

  for (const tabla of TABLAS) {
    const filas: Record<string, unknown>[] = [];
    let omitida = false;
    for (let desde = 0; desde < 50000; desde += 1000) {
      const { data, error } = await supabase.from(tabla).select("*").eq("mcp_id", mcpId).range(desde, desde + 999);
      if (error) { omitida = true; break; }
      filas.push(...(data ?? []));
      if (!data || data.length < 1000) break;
    }
    if (omitida) continue;
    const ws = libro.addWorksheet(tabla.slice(0, 31), { views: [{ state: "frozen", ySplit: 1 }] });
    const cols = Array.from(new Set(filas.flatMap((f) => Object.keys(f))));
    ws.addRow(cols).font = { bold: true };
    for (const f of filas) ws.addRow(cols.map((c) => celda(f[c])));
    cols.forEach((_, i) => (ws.getColumn(i + 1).width = 18));
    resumen.addRow([tabla, filas.length]);
  }

  const buffer = await libro.xlsx.writeBuffer();
  const nombre = `Respaldo ${mcp.nombre.replace(/[^\w\- ]+/g, "").trim()} ${new Date().toISOString().slice(0, 10)}.xlsx`;
  return new NextResponse(buffer as ArrayBuffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${nombre}"`,
    },
  });
}
