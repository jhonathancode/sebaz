import AsistenteRequerimiento from "@/components/AsistenteRequerimiento";
import CamposRequerimiento from "@/components/formularios/CamposRequerimiento";
import { contextoMcp } from "@/lib/contexto";
import { hoyISO } from "@/lib/formato";
import { cargarAtajos } from "@/lib/atajos";
import { CORRELATIVO, proximoNumero } from "@/lib/numeracion";
import { cargarCatalogoPagosFijos, siguienteCheque } from "@/lib/pagosFijos";
import { supabaseServidor } from "@/lib/supabase/server";
import { registrarExpedienteCompleto } from "@/app/(app)/expedientes/acciones";

/**
 * La ventana «Nuevo requerimiento» lista para abrirse en Inicio. Carga solo lo que la ventana necesita
 * (no la lista de expedientes) y va en segundo plano, así Inicio no se demora.
 */
export default async function NuevoRequerimientoInicio() {
  const ctx = await contextoMcp();
  const supabase = await supabaseServidor();
  const anio = Number(hoyISO().slice(0, 4));
  const [pagosFijos, chequeSugerido, atajos, { data: provData }, { data: tesoreroMiembro }, nExp, nOrdC, nOrdS, nMemo, nNea, nCp] = await Promise.all([
    cargarCatalogoPagosFijos(supabase, ctx.mcp.id),
    siguienteCheque(supabase, ctx.mcp.id),
    cargarAtajos(supabase, ctx.mcp.id),
    supabase.from("proveedores").select("num_doc, razon_social, direccion, telefono").eq("mcp_id", ctx.mcp.id).order("razon_social"),
    supabase.from("miembros").select("cargo, perfiles(nombre)").eq("mcp_id", ctx.mcp.id).eq("rol", "tesorero").eq("activo", true).maybeSingle(),
    proximoNumero(supabase, ctx.mcp.id, CORRELATIVO.expediente, anio),
    proximoNumero(supabase, ctx.mcp.id, CORRELATIVO.ordenCompra, anio),
    proximoNumero(supabase, ctx.mcp.id, CORRELATIVO.ordenServicio, anio),
    proximoNumero(supabase, ctx.mcp.id, CORRELATIVO.memorando, anio),
    proximoNumero(supabase, ctx.mcp.id, CORRELATIVO.nea, anio),
    proximoNumero(supabase, ctx.mcp.id, CORRELATIVO.comprobante, anio),
  ]);
  return (
    <AsistenteRequerimiento
      eventoAbrir="sebaz:abrir-nuevo-requerimiento"
      accion={registrarExpedienteCompleto}
      mcp={ctx.mcp}
      proximos={{ expediente: nExp, ordenCompra: nOrdC, ordenServicio: nOrdS, memorando: nMemo, nea: nNea, comprobante: nCp }}
      tesorero={(tesoreroMiembro?.perfiles as unknown as { nombre: string } | null)?.nombre ?? ""}
      cargo={tesoreroMiembro?.cargo ?? "Tesorero(a)"}
      hechoPor={ctx.nombre}
      proveedores={provData ?? []}
      chequeSugerido={chequeSugerido}
      fuentes={ctx.fuentes}
    >
      <CamposRequerimiento modo="asistente" fuentes={ctx.fuentes} pagosFijos={pagosFijos} chequeSugerido={chequeSugerido} historial={atajos.historial} fuenteFrecuente={atajos.fuenteFrecuente} proveedores={provData ?? []} />
    </AsistenteRequerimiento>
  );
}
