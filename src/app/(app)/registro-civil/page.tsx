import Link from "next/link";
import Avisos, { type ParamsAviso } from "@/components/Avisos";
import VisorArchivo from "@/components/VisorArchivo";
import VentanaFlotante from "@/components/VentanaFlotante";
import { contextoMcp, tiene } from "@/lib/contexto";
import { fecha } from "@/lib/formato";
import { nombreCompleto, NOMBRE_TIPO_RC, normalizar, TIPOS_RC, type RegistroCivil } from "@/lib/registroCivil";
import { supabaseServidor } from "@/lib/supabase/server";
import BuscadorRC from "./BuscadorRC";
import CamposRegistro from "./CamposRegistro";
import { crearRegistro } from "./acciones";

const LIMITE = 60;

export default async function RegistroCivil({ searchParams }: { searchParams: ParamsAviso }) {
  const sp = await searchParams;
  const ctx = await contextoMcp();
  const supabase = await supabaseServidor();
  const puede = tiene(ctx, "admin", "tesorero", "contador", "alcalde");
  const q = (sp.q ?? "").trim();
  const tipo = TIPOS_RC.some((t) => t.codigo === sp.tipo) ? (sp.tipo as string) : "";

  let consulta = supabase.from("rc_registros").select("*", { count: "exact" }).eq("mcp_id", ctx.mcp.id);
  if (tipo) consulta = consulta.eq("tipo", tipo);
  for (const palabra of normalizar(q).split(/\s+/).filter(Boolean).slice(0, 6)) consulta = consulta.ilike("busqueda", `%${palabra.replace(/[%_\\]/g, "")}%`);
  const [{ data, count, error }, { count: total }, { count: conPartida }] = await Promise.all([
    consulta.order("apellido_paterno").order("apellido_materno").order("nombres").limit(LIMITE),
    supabase.from("rc_registros").select("id", { count: "exact", head: true }).eq("mcp_id", ctx.mcp.id).eq("estado", "vigente"),
    supabase.from("rc_archivos").select("registro_id", { count: "exact", head: true }).eq("mcp_id", ctx.mcp.id).eq("anulado", false),
  ]);
  const filas = (data ?? []) as RegistroCivil[];
  const sinTablas = !!error && /rc_registros|schema cache/.test(error.message);

  // La partida más reciente de cada resultado, para verla e imprimirla desde la lista
  const { data: archivos } = filas.length
    ? await supabase.from("rc_archivos").select("registro_id, archivo_path, archivo_nombre, archivo_tipo, creado_en").in("registro_id", filas.map((f) => f.id)).eq("anulado", false).order("creado_en", { ascending: false })
    : { data: [] };
  const primero = new Map<string, { archivo_path: string; archivo_nombre: string | null; archivo_tipo: string | null }>();
  for (const a of archivos ?? []) if (!primero.has(a.registro_id)) primero.set(a.registro_id, a);
  const rutas = [...primero.values()].map((a) => a.archivo_path);
  const [ver, bajar] = rutas.length
    ? await Promise.all([supabase.storage.from("sustentos").createSignedUrls(rutas, 1800), supabase.storage.from("sustentos").createSignedUrls(rutas, 1800, { download: true })])
    : [{ data: [] }, { data: [] }];
  const urlVer = new Map((ver.data ?? []).map((x) => [x.path, x.signedUrl]));
  const urlBajar = new Map((bajar.data ?? []).map((x) => [x.path, x.signedUrl]));

  return (
    <>
      <div className="titulo-ventana">
        <h1>Registro Civil · Padrón</h1>
        <span className="espacio" />
        {puede && <Link className="btn contorno" href="/registro-civil/importar">Importar padrón</Link>}
        {puede && (
          <VentanaFlotante boton="+ Nuevo registro" titulo="Nuevo registro en el padrón" accion={crearRegistro} textoGuardar="Guardar registro" ancha>
            <CamposRegistro conArchivo />
          </VentanaFlotante>
        )}
      </div>
      <Avisos ok={sp.ok} error={sp.error} />
      {sinTablas && <div className="aviso error">Falta la actualización de la base (ACTUALIZAR_BASE.sql). Avise a soporte.</div>}

      <section className="panel rc-panel">
        <BuscadorRC q={q} tipo={tipo} tipos={TIPOS_RC.map((t) => ({ codigo: t.codigo, nombre: t.nombre }))} />
        <p className="tenue pequeno rc-resumen">
          {q || tipo ? (
            <>{count ?? 0} {count === 1 ? "resultado" : "resultados"}{(count ?? 0) > LIMITE ? ` (se muestran los primeros ${LIMITE}; escriba más letras para acotar)` : ""}</>
          ) : (
            <>{total ?? 0} registros en el padrón · {conPartida ?? 0} partidas adjuntas. Escriba un apellido o un DNI para buscar.</>
          )}
        </p>
        <div className="tabla-marco" style={{ border: "none", borderRadius: 0 }}>
          <table className="tabla">
            <thead>
              <tr><th>Apellidos y nombres</th><th>DNI</th><th>Tipo</th><th>Fecha</th><th>N° acta</th><th>Expediente</th><th>Partida</th><th></th></tr>
            </thead>
            <tbody>
              {filas.length === 0 && (
                <tr><td colSpan={8} className="tenue" style={{ textAlign: "center", padding: 26 }}>{q || tipo ? "Nada coincide. Pruebe con menos letras o solo el apellido." : "Todavía no hay registros. Use «+ Nuevo registro» o «Importar padrón»."}</td></tr>
              )}
              {filas.map((r) => {
                const a = primero.get(r.id);
                const url = a ? urlVer.get(a.archivo_path) : null;
                return (
                  <tr key={r.id} className={r.estado === "anulado" ? "anulado" : undefined}>
                    <td className="envolver"><Link href={`/registro-civil/${r.id}`}><b>{nombreCompleto(r)}</b></Link>{r.estado === "anulado" && <span className="tenue"> · ANULADO</span>}</td>
                    <td>{r.dni ?? "—"}</td>
                    <td>{NOMBRE_TIPO_RC[r.tipo] ?? r.tipo}</td>
                    <td>{r.fecha_acto ? fecha(r.fecha_acto) : "—"}</td>
                    <td>{r.numero_acta ?? "—"}</td>
                    <td>{r.expediente ?? "—"}</td>
                    <td>
                      {a && url ? (
                        <VisorArchivo url={url} descarga={urlBajar.get(a.archivo_path) ?? url} nombre={a.archivo_nombre ?? "partida"} tipo={a.archivo_tipo ?? "application/pdf"} titulo={`Partida · ${nombreCompleto(r)}`} />
                      ) : (
                        <span className="tenue pequeno">Sin adjuntar</span>
                      )}
                    </td>
                    <td className="acc"><Link className="btn chico contorno" href={`/registro-civil/${r.id}`}>Ficha</Link></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
