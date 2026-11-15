import { NextResponse } from "next/server";
import { obtenerContexto } from "@/lib/contexto";
import { num3 } from "@/lib/formato";
import { supabaseServidor } from "@/lib/supabase/server";

export type ResultadoBusqueda = { grupo: string; titulo: string; detalle: string; href: string };

/** Búsqueda global dentro de la MCP elegida: expedientes, comprobantes, recibos de ingreso, proveedores y pagos fijos. */
export async function GET(req: Request) {
  const ctx = await obtenerContexto();
  if (!ctx.mcp) return NextResponse.json({ resultados: [] });
  const bruto = (new URL(req.url).searchParams.get("q") ?? "").trim().slice(0, 60);
  const q = bruto.replace(/[,()%*\\]/g, " ").replace(/\s+/g, " ").trim();
  if (q.length < 2) return NextResponse.json({ resultados: [] });
  const sb = await supabaseServidor();
  const mcp = ctx.mcp.id;
  const num = /^\d{1,6}$/.test(q) ? Number(q) : null;
  const like = `%${q}%`;
  const [exps, cps, ings, provs, pfs] = await Promise.all([
    sb.from("expedientes").select("id, anio, numero, descripcion, estado, tipo").eq("mcp_id", mcp).or(`descripcion.ilike.${like}${num !== null ? `,numero.eq.${num}` : ""}`).order("fecha", { ascending: false }).limit(6),
    sb.from("comprobantes_pago").select("id, anio, numero, origen, expediente_id, beneficiario, concepto, importe, cheque, estado").eq("mcp_id", mcp).neq("estado", "anulado").or(`beneficiario.ilike.${like},concepto.ilike.${like},cheque.ilike.${like}${num !== null ? `,numero.eq.${num}` : ""}`).order("fecha", { ascending: false }).limit(5),
    sb.from("ingresos").select("id, numero, anio, fecha, pagador_nombre, pagador_doc, concepto, monto, estado").eq("mcp_id", mcp).or(`pagador_nombre.ilike.${like},pagador_doc.ilike.${like},concepto.ilike.${like}${num !== null ? `,numero.eq.${num}` : ""}`).order("fecha", { ascending: false }).limit(5),
    sb.from("proveedores").select("id, razon_social, num_doc").eq("mcp_id", mcp).or(`razon_social.ilike.${like},num_doc.ilike.${like}`).limit(4),
    sb.from("pagos_fijos").select("id, concepto, beneficiario").eq("mcp_id", mcp).or(`concepto.ilike.${like},beneficiario.ilike.${like}`).limit(4),
  ]);
  const r: ResultadoBusqueda[] = [];
  for (const e of exps.data ?? []) r.push({ grupo: "Expedientes", titulo: `${num3(e.numero)}-${e.anio} · ${e.descripcion}`, detalle: String(e.estado), href: `/expedientes/${e.id}` });
  for (const c of cps.data ?? []) {
    const href = c.expediente_id ? `/expedientes/${c.expediente_id}?paso=comprobante&ver=comprobante` : `/comprobantes`;
    r.push({ grupo: "Comprobantes de pago", titulo: `${c.beneficiario} · S/ ${Number(c.importe).toFixed(2)}`, detalle: `${c.cheque ? `Cheque ${c.cheque} · ` : ""}${c.concepto}`, href });
  }
  for (const i of ings.data ?? []) r.push({ grupo: "Recibos de ingreso", titulo: `${String(i.numero ?? 0).padStart(4, "0")} · ${i.pagador_nombre} · S/ ${Number(i.monto).toFixed(2)}`, detalle: i.concepto, href: `/ingresos?mes=${String(i.fecha).slice(0, 7)}&q=${encodeURIComponent(q)}` });
  for (const p of provs.data ?? []) r.push({ grupo: "Proveedores", titulo: p.razon_social, detalle: p.num_doc, href: `/expedientes?q=${encodeURIComponent(p.razon_social)}&mes=` });
  for (const p of pfs.data ?? []) r.push({ grupo: "Pagos fijos", titulo: p.concepto, detalle: p.beneficiario ?? "", href: `/configuracion?seccion=pagos` });
  return NextResponse.json({ resultados: r });
}
