import ExcelJS from "exceljs";
import { NextResponse } from "next/server";
import { obtenerContexto } from "@/lib/contexto";
import { supabaseServidor } from "@/lib/supabase/server";

export const runtime = "nodejs";

/** Relación de bienes muebles en Excel (activos y dados de baja), lista para revisar o cargar en SINABIP. */
export async function GET() {
  const ctx = await obtenerContexto();
  if (!ctx.mcp) return NextResponse.json({ error: "Sin municipalidad." }, { status: 403 });
  const supabase = await supabaseServidor();
  const { data } = await supabase.from("bienes_patrimonio").select("*").eq("mcp_id", ctx.mcp.id).order("estado").order("descripcion");
  const libro = new ExcelJS.Workbook();
  const hoja = libro.addWorksheet("Bienes muebles");
  hoja.columns = [
    { header: "Código patrimonial", key: "codigo", width: 18 }, { header: "Descripción", key: "descripcion", width: 36 }, { header: "Marca", key: "marca", width: 16 },
    { header: "Modelo", key: "modelo", width: 16 }, { header: "Serie", key: "serie", width: 18 }, { header: "Color", key: "color", width: 12 },
    { header: "Estado de conservación", key: "estado_conservacion", width: 18 }, { header: "Ubicación", key: "ubicacion", width: 24 }, { header: "Responsable", key: "responsable", width: 26 },
    { header: "Fecha de adquisición", key: "fecha_adquisicion", width: 18 }, { header: "Valor S/", key: "valor", width: 12 }, { header: "Situación", key: "estado", width: 12 },
    { header: "Resolución de baja", key: "baja_resolucion", width: 28 }, { header: "Fecha de baja", key: "baja_fecha", width: 14 },
  ];
  hoja.getRow(1).font = { bold: true };
  (data ?? []).forEach((b) => hoja.addRow({ ...b, estado: b.estado === "baja" ? "BAJA" : "ACTIVO", estado_conservacion: String(b.estado_conservacion).toUpperCase(), valor: Number(b.valor) }));
  hoja.getColumn("valor").numFmt = "#,##0.00";
  const buffer = await libro.xlsx.writeBuffer();
  return new NextResponse(buffer as ArrayBuffer, { headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": 'attachment; filename="bienes-muebles.xlsx"' } });
}
