import { NextResponse, type NextRequest } from "next/server";
import { obtenerContexto, tiene } from "@/lib/contexto";
import { armarRespaldoTesoreria } from "@/lib/respaldoTesoreria";
import { supabaseServidor } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Respaldo de toda la tesorería de una MCP en un Excel ordenado. Solo su administrador o el superadmin. */
export async function GET(req: NextRequest) {
  const ctx = await obtenerContexto();
  const pedido = req.nextUrl.searchParams.get("mcp");
  const mcpId = ctx.esSuperadmin && pedido ? pedido : ctx.mcp?.id;
  if (!mcpId || !(ctx.esSuperadmin || tiene(ctx, "admin"))) return NextResponse.json({ error: "Solo el administrador puede descargar el respaldo." }, { status: 403 });
  const supabase = await supabaseServidor();
  const { data: fila } = await supabase.from("mcps").select("*").eq("id", mcpId).single();
  if (!fila) return NextResponse.json({ error: "No se encontró la municipalidad." }, { status: 404 });
  const libro = await armarRespaldoTesoreria(supabase, { ...ctx, mcp: fila } as never, fila);
  const buffer = await libro.xlsx.writeBuffer();
  const nombre = `Respaldo ${String(fila.nombre).replace(/[^\w\- ]+/g, "").trim()} ${new Date().toISOString().slice(0, 10)}.xlsx`;
  return new NextResponse(buffer as ArrayBuffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${nombre}"`,
    },
  });
}
