"use server";

import { revalidatePath } from "next/cache";
import { contextoMcp, tiene } from "@/lib/contexto";
import { mensajeError, numero, texto, volver } from "@/lib/acciones";
import { supabaseServidor } from "@/lib/supabase/server";

const RUTA = "/patrimonio";
const mayus = (v: string | null) => v?.toUpperCase() ?? null;
const conservacion = (v: string | null) => (v === "regular" || v === "malo" ? v : "bueno");

async function puede(ruta: string) {
  const ctx = await contextoMcp();
  if (!tiene(ctx, "admin", "tesorero")) volver(ruta, "error", "Solo el tesorero o el administrador cambian el patrimonio.");
  return ctx;
}

export async function guardarBien(fd: FormData) {
  const ctx = await puede(RUTA);
  const supabase = await supabaseServidor();
  const descripcion = mayus(texto(fd, "descripcion"));
  if (!descripcion) volver(RUTA, "error", "Escriba la descripción del bien.");
  const datos = {
    codigo: texto(fd, "codigo")?.replace(/\s/g, "") || null,
    descripcion,
    marca: mayus(texto(fd, "marca")), modelo: mayus(texto(fd, "modelo")), serie: mayus(texto(fd, "serie")), color: mayus(texto(fd, "color")),
    estado_conservacion: conservacion(texto(fd, "estado_conservacion")),
    ubicacion: mayus(texto(fd, "ubicacion")), responsable: mayus(texto(fd, "responsable")),
    fecha_adquisicion: texto(fd, "fecha_adquisicion"),
    valor: numero(fd, "valor") ?? 0,
    observacion: mayus(texto(fd, "observacion")),
  };
  const id = texto(fd, "id");
  const { error } = id ? await supabase.from("bienes_patrimonio").update(datos).eq("id", id) : await supabase.from("bienes_patrimonio").insert({ ...datos, mcp_id: ctx.mcp.id });
  if (error) volver(RUTA, "error", error.message.includes("bienes_patrimonio_codigo") ? "Ya existe un bien con ese código patrimonial." : mensajeError(error));
  revalidatePath(RUTA);
  volver(RUTA, "ok", id ? "Bien corregido." : "Bien registrado.");
}

/** Da de alta como bienes las compras de un expediente (una fila por unidad). */
export async function altaDesdeExpediente(fd: FormData) {
  const ctx = await puede(RUTA);
  const supabase = await supabaseServidor();
  const marcados = fd.getAll("item").map(String);
  if (!marcados.length) volver(RUTA, "error", "Marque los ítems que son bienes duraderos.");
  const { data: items } = await supabase.from("expediente_items").select("id, expediente_id, descripcion, cantidad, precio_unitario, expedientes(fecha, mcp_id)").in("id", marcados);
  const validos = (items ?? []).filter((i) => (i.expedientes as unknown as { mcp_id: string } | null)?.mcp_id === ctx.mcp.id);
  if (!validos.length) volver(RUTA, "error", "No se encontraron los ítems del expediente.");
  const filas = validos.flatMap((i) =>
    Array.from({ length: Math.min(Math.max(Math.round(Number(i.cantidad)), 1), 100) }, () => ({
      mcp_id: ctx.mcp.id, descripcion: String(i.descripcion).toUpperCase(), valor: Number(i.precio_unitario),
      fecha_adquisicion: (i.expedientes as unknown as { fecha: string } | null)?.fecha ?? null, expediente_id: i.expediente_id,
      ubicacion: mayus(texto(fd, "ubicacion")), responsable: mayus(texto(fd, "responsable")),
    })),
  );
  const { error } = await supabase.from("bienes_patrimonio").insert(filas);
  if (error) volver(RUTA, "error", mensajeError(error));
  revalidatePath(RUTA);
  volver(RUTA, "ok", `${filas.length} bien(es) dados de alta desde el expediente. Complete marca, serie y código cuando los tenga.`);
}

export async function bajaBien(fd: FormData) {
  await puede(RUTA);
  const supabase = await supabaseServidor();
  const resolucion = mayus(texto(fd, "resolucion"));
  const motivo = texto(fd, "motivo");
  if (!resolucion) volver(RUTA, "error", "Escriba la resolución que aprueba la baja.");
  const { error } = await supabase.from("bienes_patrimonio").update({ estado: "baja", baja_fecha: texto(fd, "fecha") ?? new Date().toISOString().slice(0, 10), baja_resolucion: resolucion, baja_motivo: motivo }).eq("id", texto(fd, "id")!);
  if (error) volver(RUTA, "error", mensajeError(error));
  revalidatePath(RUTA);
  volver(RUTA, "ok", "Bien dado de baja. Queda en el historial con su resolución.");
}

export async function crearInventario(fd: FormData) {
  const ctx = await puede(`${RUTA}?vista=inventario`);
  const supabase = await supabaseServidor();
  const anio = Number(texto(fd, "anio"));
  if (!anio) volver(`${RUTA}?vista=inventario`, "error", "Escriba el año del inventario.");
  const comision = (texto(fd, "comision") ?? "").split("\n").map((l) => l.trim()).filter(Boolean).map((l) => {
    const [nombre, ...cargo] = l.split(/\s+[-–]\s+/);
    return { nombre: nombre.toUpperCase(), cargo: cargo.join(" - ").toUpperCase() };
  });
  if (comision.length < 1) volver(`${RUTA}?vista=inventario`, "error", "Escriba al menos un integrante de la comisión de inventario.");
  const { data: inv, error } = await supabase.from("inventarios_patrimonio").insert({ mcp_id: ctx.mcp.id, anio, fecha_cierre: texto(fd, "fecha_cierre") ?? `${anio}-12-31`, resolucion: mayus(texto(fd, "resolucion")), comision }).select("id").single();
  if (error || !inv) volver(`${RUTA}?vista=inventario`, "error", error?.message.includes("inventarios_patrimonio_anio") ? `Ya hay un inventario ${anio}.` : mensajeError(error));
  const { data: bienes } = await supabase.from("bienes_patrimonio").select("id").eq("mcp_id", ctx.mcp.id).eq("estado", "activo");
  if (bienes?.length) {
    const { error: eI } = await supabase.from("inventario_patrimonio_items").insert(bienes.map((b) => ({ mcp_id: ctx.mcp.id, inventario_id: inv.id, bien_id: b.id })));
    if (eI) volver(`${RUTA}/inventario/${inv.id}`, "error", "Se creó el inventario pero no su lista de bienes: " + mensajeError(eI));
  }
  revalidatePath(RUTA);
  volver(`${RUTA}/inventario/${inv.id}`, "ok", `Inventario ${anio} iniciado con ${bienes?.length ?? 0} bien(es) por verificar.`);
}

export async function registrarResultado(fd: FormData) {
  await puede(RUTA);
  const supabase = await supabaseServidor();
  const inv = texto(fd, "inventario_id")!;
  const aqui = `${RUTA}/inventario/${inv}`;
  const r = texto(fd, "resultado");
  const resultado = r === "encontrado" || r === "no_encontrado" ? r : "pendiente";
  const { error } = await supabase.from("inventario_patrimonio_items").update({ resultado, estado_conservacion: resultado === "encontrado" ? conservacion(texto(fd, "estado_conservacion")) : null, observacion: mayus(texto(fd, "observacion")) }).eq("id", texto(fd, "id")!);
  if (error) volver(aqui, "error", mensajeError(error));
  revalidatePath(aqui);
  volver(aqui, "ok", "Resultado guardado.");
}

export async function cerrarInventario(fd: FormData) {
  await puede(RUTA);
  const supabase = await supabaseServidor();
  const id = texto(fd, "id")!;
  const aqui = `${RUTA}/inventario/${id}`;
  const { count } = await supabase.from("inventario_patrimonio_items").select("id", { count: "exact", head: true }).eq("inventario_id", id).eq("resultado", "pendiente");
  if (count) volver(aqui, "error", `Aún faltan ${count} bien(es) por verificar.`);
  const { error } = await supabase.from("inventarios_patrimonio").update({ estado: "cerrado", saldo_contable: numero(fd, "saldo_contable"), informe: texto(fd, "informe"), cerrado_en: new Date().toISOString() }).eq("id", id).eq("estado", "en_curso");
  if (error) volver(aqui, "error", mensajeError(error));
  revalidatePath(RUTA);
  volver(aqui, "ok", "Inventario cerrado. Ya puede imprimir el informe final y el acta de conciliación.");
}

export async function anularInventario(fd: FormData) {
  await puede(RUTA);
  const supabase = await supabaseServidor();
  const id = texto(fd, "id")!;
  const { error } = await supabase.from("inventarios_patrimonio").update({ estado: "anulado", anulado_motivo: texto(fd, "motivo") }).eq("id", id);
  if (error) volver(`${RUTA}/inventario/${id}`, "error", mensajeError(error));
  revalidatePath(RUTA);
  volver(`${RUTA}?vista=inventario`, "ok", "Inventario anulado. Queda en el historial.");
}

export async function guardarPredio(fd: FormData) {
  const ctx = await puede(`${RUTA}?vista=predios`);
  const supabase = await supabaseServidor();
  const nombre = mayus(texto(fd, "nombre"));
  if (!nombre) volver(`${RUTA}?vista=predios`, "error", "Escriba el nombre del predio.");
  const c = texto(fd, "condicion");
  const datos = {
    nombre, direccion: mayus(texto(fd, "direccion")), area_m2: numero(fd, "area_m2"), partida: mayus(texto(fd, "partida")), cus: mayus(texto(fd, "cus")), uso: mayus(texto(fd, "uso")),
    condicion: c === "cesion" || c === "posesion" || c === "otro" ? c : "propiedad", observacion: mayus(texto(fd, "observacion")),
  };
  const id = texto(fd, "id");
  const { error } = id ? await supabase.from("predios_mcp").update(datos).eq("id", id) : await supabase.from("predios_mcp").insert({ ...datos, mcp_id: ctx.mcp.id });
  if (error) volver(`${RUTA}?vista=predios`, "error", mensajeError(error));
  revalidatePath(RUTA);
  volver(`${RUTA}?vista=predios`, "ok", id ? "Predio corregido." : "Predio registrado.");
}

export async function anularPredio(fd: FormData) {
  await puede(RUTA);
  const supabase = await supabaseServidor();
  const { error } = await supabase.from("predios_mcp").update({ anulado: true, anulado_motivo: texto(fd, "motivo") }).eq("id", texto(fd, "id")!);
  if (error) volver(`${RUTA}?vista=predios`, "error", mensajeError(error));
  revalidatePath(RUTA);
  volver(`${RUTA}?vista=predios`, "ok", "Predio anulado. Queda en el historial.");
}
