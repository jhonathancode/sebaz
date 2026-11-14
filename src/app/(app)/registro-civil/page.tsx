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
        <div className="rc-cifras">
          <div><b>{total ?? 0}</b><span>Registros en el padrón</span></div>
          <div><b>{conPartida ?? 0}</b><span>Partidas adjuntas</span></div>
          <div><b>{q || tipo ? count ?? 0 : "—"}</b><span>{q || tipo ? ((count ?? 0) > LIMITE ? `Resultados (se muestran ${LIMITE})` : "Resultados de la búsqueda") : "Escriba para buscar"}</span></div>
        </div>
        <div className="rc-tabla-marco">
          <table className="rc-tabla">
            <colgroup><col className="c-persona" /><col className="c-dni" /><col className="c-tipo" /><col className="c-fecha" /><col className="c-acta" /><col className="c-partida" /><col className="c-acc" /></colgroup>
            <thead>
              <tr><th>Persona</th><th>DNI</th><th>Tipo de acta</th><th>Fecha</th><th>Acta y expediente</th><th>Partida</th><th><span className="sr-solo">Acciones</span></th></tr>
            </thead>
            <tbody>
              {filas.length === 0 && (
                <tr><td colSpan={7} className="rc-vacio">{q || tipo ? "Nada coincide. Pruebe con menos letras o solo el apellido." : "Todavía no hay registros. Use «+ Nuevo registro» o «Importar padrón»."}</td></tr>
              )}
              {filas.map((r) => {
                const a = primero.get(r.id);
                const url = a ? urlVer.get(a.archivo_path) : null;
                const filiacion = [r.padre, r.madre].filter(Boolean).join(" y ");
                return (
                  <tr key={r.id} className={r.estado === "anulado" ? "anulado" : undefined}>
                    <td>
                      <Link href={`/registro-civil/${r.id}`} className="rc-persona">
                        <span className="rc-avatar" aria-hidden="true">{(r.apellido_paterno[0] ?? "") + (r.nombres[0] ?? "")}</span>
                        <span className="rc-persona-txt">
                          <b>{[r.apellido_paterno, r.apellido_materno].filter(Boolean).join(" ")}, {r.nombres}</b>
                          {(filiacion || r.lugar) && <small>{filiacion ? `Hijo(a) de ${filiacion}` : r.lugar}</small>}
                        </span>
                      </Link>
                      {r.estado === "anulado" && <span className="rc-anulado">ANULADO</span>}
                    </td>
                    <td className="rc-num">{r.dni ?? <span className="tenue">—</span>}</td>
                    <td><span className={`rc-chip rc-${r.tipo}`}>{NOMBRE_TIPO_RC[r.tipo] ?? r.tipo}</span></td>
                    <td className="rc-num">{r.fecha_acto ? fecha(r.fecha_acto) : <span className="tenue">—</span>}</td>
                    <td className="rc-acta">
                      <span><i>Acta</i>{r.numero_acta ?? "—"}</span>
                      <span><i>Exp.</i>{r.expediente ?? "—"}</span>
                    </td>
                    <td>
                      {a && url ? (
                        <span className="rc-partida si">
                          <span className="rc-ok">✓ Adjunta</span>
                          <VisorArchivo url={url} descarga={urlBajar.get(a.archivo_path) ?? url} nombre={a.archivo_nombre ?? "partida"} tipo={a.archivo_tipo ?? "application/pdf"} titulo={`Partida · ${nombreCompleto(r)}`} />
                        </span>
                      ) : (
                        <span className="rc-partida no">Sin adjuntar</span>
                      )}
                    </td>
                    <td className="rc-der"><Link className="btn chico contorno" href={`/registro-civil/${r.id}`}>Ficha</Link></td>
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
