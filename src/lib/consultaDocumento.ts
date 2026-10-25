import { supabaseServicio } from "./supabase/server";

export type DatosDocumento =
  | { tipo: "dni"; documento: string; nombre: string }
  | { tipo: "ruc"; documento: string; nombre: string; direccion: string | null; estado: string | null; condicion: string | null };

export type Resultado = { ok: true; datos: DatosDocumento; cache: boolean } | { ok: false; codigo: "no_configurado" | "invalido" | "no_existe" | "no_disponible"; mensaje: string };

const DIAS_VIGENCIA = 30;
const BASE = "https://api.apiperu.dev";

/** DNI (8 dígitos) o RUC (11): consulta apiperu.dev con el token del servidor y recuerda la respuesta 30 días. */
export async function consultarDocumento(documento: string): Promise<Resultado> {
  const doc = documento.replace(/\D/g, "");
  const tipo = doc.length === 8 ? "dni" : doc.length === 11 ? "ruc" : null;
  if (!tipo) return { ok: false, codigo: "invalido", mensaje: "El DNI tiene 8 dígitos y el RUC 11." };
  const token = process.env.APIPERU_TOKEN;
  if (!token) return { ok: false, codigo: "no_configurado", mensaje: "La consulta automática aún no está activada." };

  // Memoria: si ya se consultó hace poco, no se gasta cupo
  const servicio = supabaseServicio();
  try {
    const { data } = await servicio.from("consultas_documento").select("datos, consultado_en").eq("documento", doc).maybeSingle();
    if (data && Date.now() - new Date(data.consultado_en).getTime() < DIAS_VIGENCIA * 86400000) {
      return { ok: true, datos: data.datos as DatosDocumento, cache: true };
    }
  } catch {
    /* sin memoria: se consulta igual */
  }

  let respuesta: Response;
  try {
    respuesta = await fetch(`${BASE}/${tipo}`, {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(tipo === "dni" ? { dni: doc } : { ruc: doc }),
      signal: AbortSignal.timeout(8000),
      cache: "no-store",
    });
  } catch {
    return { ok: false, codigo: "no_disponible", mensaje: "No se pudo consultar ahora. Escriba los datos a mano." };
  }
  if (respuesta.status === 404) return { ok: false, codigo: "no_existe", mensaje: tipo === "ruc" ? "Ese RUC no existe." : "No se encontró ese DNI en las fuentes públicas. Escriba el nombre a mano." };
  if (respuesta.status === 400) return { ok: false, codigo: "invalido", mensaje: "Número incorrecto." };
  if (!respuesta.ok) return { ok: false, codigo: "no_disponible", mensaje: "El servicio de consulta no está disponible ahora. Escriba los datos a mano." };

  const json = (await respuesta.json().catch(() => null)) as { success?: boolean; data?: Record<string, unknown> } | null;
  const d = json?.data;
  if (!json?.success || !d) return { ok: false, codigo: "no_disponible", mensaje: "No se recibieron datos. Escriba los datos a mano." };

  const texto = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim().toLocaleUpperCase("es-PE") : null);
  const datos: DatosDocumento =
    tipo === "dni"
      ? { tipo, documento: doc, nombre: texto(d.nombre_completo) ?? "" }
      : { tipo, documento: doc, nombre: texto(d.nombre_o_razon_social) ?? "", direccion: texto(d.direccion), estado: texto(d.estado), condicion: texto(d.condicion) };
  if (!datos.nombre) return { ok: false, codigo: "no_existe", mensaje: "No se encontró nombre para ese número. Escriba los datos a mano." };

  try {
    await servicio.from("consultas_documento").upsert({ documento: doc, tipo, datos, consultado_en: new Date().toISOString() }, { onConflict: "documento" });
  } catch {
    /* si no se pudo recordar, no importa */
  }
  return { ok: true, datos, cache: false };
}
