import CampoDocumento from "@/components/CampoDocumento";
import Link from "next/link";
import { notFound } from "next/navigation";
import Avisos, { type ParamsAviso } from "@/components/Avisos";
import Motivo from "@/components/Motivo";
import VentanaFlotante from "@/components/VentanaFlotante";
import VisorArchivo from "@/components/VisorArchivo";
import CampoArchivoEstado from "@/components/formularios/CampoArchivoEstado";
import { contextoMcp, tiene } from "@/lib/contexto";
import { fecha } from "@/lib/formato";
import { DESCRIPCIONES_ARCHIVO, nombreCompleto, NOMBRE_TIPO_RC, type RegistroCivil } from "@/lib/registroCivil";
import { supabaseServidor } from "@/lib/supabase/server";
import CamposRegistro from "../CamposRegistro";
import { anularPartida, anularRegistro, editarRegistro, registrarEntrega, restaurarRegistro, subirPartida } from "../acciones";

const MOTIVOS_REGISTRO = ["Registro duplicado", "Datos del acta mal copiados", "Se registró a otra persona por error", "El acta corresponde a otra municipalidad"];
const MOTIVOS_ARCHIVO = ["Archivo equivocado", "Foto borrosa o incompleta", "Corresponde a otra persona", "Se subió dos veces"];

function Dato({ t, v }: { t: string; v: string | null | undefined }) {
  return (
    <div className="rc-dato">
      <span>{t}</span>
      <b>{v || "—"}</b>
    </div>
  );
}

const kb = (n: number | null | undefined) => (n ? (n > 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`) : "");

export default async function FichaRegistro({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: ParamsAviso }) {
  const { id } = await params;
  const sp = await searchParams;
  const ctx = await contextoMcp();
  const supabase = await supabaseServidor();
  const puede = tiene(ctx, "admin", "tesorero", "contador", "alcalde");

  const { data } = await supabase.from("rc_registros").select("*").eq("id", id).eq("mcp_id", ctx.mcp.id).maybeSingle();
  if (!data) notFound();
  const r = data as RegistroCivil;

  const [{ data: archivos }, { data: entregas }, { data: otros }] = await Promise.all([
    supabase.from("rc_archivos").select("*").eq("registro_id", id).order("creado_en", { ascending: false }),
    supabase.from("rc_entregas").select("*").eq("registro_id", id).order("creado_en", { ascending: false }).limit(30),
    r.dni
      ? supabase.from("rc_registros").select("id, tipo, fecha_acto, numero_acta, apellido_paterno, apellido_materno, nombres").eq("mcp_id", ctx.mcp.id).eq("dni", r.dni).neq("id", id).limit(10)
      : Promise.resolve({ data: [] }),
  ]);
  const vigentes = (archivos ?? []).filter((a) => !a.anulado);
  const rutas = vigentes.map((a) => a.archivo_path as string);
  const [ver, bajar] = rutas.length
    ? await Promise.all([supabase.storage.from("sustentos").createSignedUrls(rutas, 1800), supabase.storage.from("sustentos").createSignedUrls(rutas, 1800, { download: true })])
    : [{ data: [] }, { data: [] }];
  const urlVer = new Map((ver.data ?? []).map((x) => [x.path, x.signedUrl]));
  const urlBajar = new Map((bajar.data ?? []).map((x) => [x.path, x.signedUrl]));
  const anulado = r.estado === "anulado";

  const iniciales = (r.apellido_paterno[0] ?? "") + (r.nombres[0] ?? "");
  const filiacion = [r.padre ? { t: "Padre", v: r.padre } : null, r.madre ? { t: "Madre", v: r.madre } : null].filter(Boolean) as { t: string; v: string }[];

  return (
    <>
      <Avisos ok={sp.ok} error={sp.error} />
      {anulado && <div className="aviso error">Registro anulado: {r.anulado_motivo}</div>}

      <header className="rc-perfil-cab">
        <div className="rc-perfil-avatar" aria-hidden="true">{iniciales}</div>
        <div className="rc-perfil-id">
          <h1>{r.apellido_paterno} {r.apellido_materno ?? ""}</h1>
          <div className="rc-perfil-nombres">{r.nombres}</div>
          <div className="rc-perfil-chips">
            <span className={`rc-chip rc-${r.tipo}`}>{NOMBRE_TIPO_RC[r.tipo] ?? r.tipo}</span>
            {r.dni && <span className="rc-chip">DNI {r.dni}</span>}
            {r.sexo && <span className="rc-chip">{r.sexo === "M" ? "Masculino" : "Femenino"}</span>}
            {anulado && <span className="rc-chip rc-anulado-chip">Anulado</span>}
            <span className="rc-chip">{r.origen === "digital" ? "Sistema digital" : "Libro físico"}</span>
          </div>
        </div>
        <div className="rc-perfil-acc no-imprimir">
          {puede && !anulado && (
            <VentanaFlotante boton="Corregir datos" titulo="Corregir datos del registro" accion={editarRegistro} claseBoton="btn contorno" ancha>
              <CamposRegistro r={r} />
            </VentanaFlotante>
          )}
          {puede && !anulado && <Motivo accion={anularRegistro} boton="Anular registro" ayuda="Motivo de la anulación" campos={{ id }} motivos={MOTIVOS_REGISTRO} />}
          {puede && anulado && (
            <form action={restaurarRegistro}>
              <input type="hidden" name="id" value={id} />
              <button className="btn contorno" type="submit">Volver a dejar vigente</button>
            </form>
          )}
          <Link className="btn" href="/registro-civil">← Volver al padrón</Link>
        </div>
      </header>

      <section className="rc-ubica" aria-label="Dónde está el acta">
        <div><span>Fecha del hecho</span><b>{r.fecha_acto ? fecha(r.fecha_acto) : "—"}</b></div>
        <div><span>N° de acta</span><b>{r.numero_acta || "—"}</b></div>
        <div><span>N° de expediente</span><b>{r.expediente || "—"}</b></div>
        <div><span>Libro / Folio</span><b>{[r.libro, r.folio].filter(Boolean).join(" / ") || "—"}</b></div>
        <div><span>Guardado en</span><b>{r.ubicacion || "—"}</b></div>
      </section>

      <div className="rc-perfil-cols">
        <div className="rc-perfil-main">
          <section className="panel">
            <div className="panel-cab">Partida y constancias adjuntas<span className="tenue pequeno">{vigentes.length} {vigentes.length === 1 ? "archivo" : "archivos"}</span></div>
            <div className="panel-cuerpo">
              {vigentes.length === 0 ? (
                <div className="rc-vacio-caja">
                  <b>Todavía no tiene la partida adjunta</b>
                  <span>{puede ? "Súbala aquí abajo y se podrá ver e imprimir desde esta ficha." : "Quien registra puede adjuntarla."}</span>
                </div>
              ) : (
                <ul className="rc-archivos">
                  {vigentes.map((a) => {
                    const url = urlVer.get(a.archivo_path);
                    const pdf = a.archivo_tipo === "application/pdf";
                    return (
                      <li key={a.id}>
                        <span className={`rc-tipo-arch ${pdf ? "pdf" : "img"}`} aria-hidden="true">{pdf ? "PDF" : "IMG"}</span>
                        <span className="rc-arch-txt">
                          <b>{a.descripcion}</b>
                          <small>{a.archivo_nombre} · {kb(a.archivo_tamano)} · subido el {fecha(String(a.creado_en).slice(0, 10))}</small>
                        </span>
                        <span className="rc-arch-acc">
                          {url ? <VisorArchivo url={url} descarga={urlBajar.get(a.archivo_path) ?? url} nombre={a.archivo_nombre ?? "partida"} tipo={a.archivo_tipo ?? "application/pdf"} titulo={`${a.descripcion} · ${nombreCompleto(r)}`} /> : <span className="tenue pequeno">No disponible</span>}
                          {puede && <Motivo accion={anularPartida} boton="Anular" ayuda="Motivo" campos={{ id: a.id, registro_id: id }} chico motivos={MOTIVOS_ARCHIVO} />}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}
              {(archivos ?? []).filter((a) => a.anulado).map((a) => (
                <p key={a.id} className="tenue pequeno" style={{ margin: "8px 0 0" }}>Anulado: {a.descripcion} ({a.archivo_nombre}) · {a.anulado_motivo}</p>
              ))}
              {puede && !anulado && (
                <form action={subirPartida} className="rc-subir rc-form">
                  <input type="hidden" name="registro_id" value={id} />
                  <label className="campo">Qué documento es
                    <select name="descripcion" defaultValue="Partida">
                      {DESCRIPCIONES_ARCHIVO.map((d) => <option key={d}>{d}</option>)}
                    </select>
                  </label>
                  <div className="rc-subir-archivo">
                    <CampoArchivoEstado etiqueta="Foto o PDF" multiple={false} ayuda="PDF o foto; máximo 4 MB. Las fotos grandes se reducen solas." />
                  </div>
                  <button className="btn primario" type="submit">Adjuntar</button>
                </form>
              )}
            </div>
          </section>

          <section className="panel">
            <div className="panel-cab">Copias entregadas<span className="tenue pequeno">{(entregas ?? []).length}</span></div>
            <div className="panel-cuerpo">
              {(entregas ?? []).length === 0 ? (
                <p className="tenue" style={{ margin: 0 }}>Aún no se entregó ninguna copia de esta partida.</p>
              ) : (
                <ol className="rc-linea">
                  {(entregas ?? []).map((e) => (
                    <li key={e.id}>
                      <span className="rc-linea-fecha">{fecha(e.fecha)}</span>
                      <span className="rc-linea-txt"><b>{e.solicitante_nombre}</b>{e.solicitante_dni ? ` · DNI ${e.solicitante_dni}` : ""}{e.motivo ? <small>{e.motivo}</small> : null}</span>
                    </li>
                  ))}
                </ol>
              )}
              {puede && !anulado && (
                <details className="rc-entrega-form">
                  <summary>+ Registrar una entrega</summary>
                  <form action={registrarEntrega} className="rc-form">
                    <input type="hidden" name="registro_id" value={id} />
                    <div className="rc-rejilla">
                      <label className="campo rc-ancho2">Quién pidió la copia<input name="solicitante_nombre" required style={{ textTransform: "uppercase" }} autoComplete="off" /></label>
                      <label className="campo">DNI<CampoDocumento name="solicitante_dni" inputMode="numeric" maxLength={8} pattern="[0-9]{8}" title="El DNI tiene 8 dígitos" autoComplete="off" /></label>
                      <label className="campo rc-ancho3">Para qué<input name="motivo" placeholder="Ej.: MATRÍCULA, TRÁMITE DE DNI" style={{ textTransform: "uppercase" }} autoComplete="off" /></label>
                    </div>
                    <div><button className="btn primario" type="submit">Registrar entrega</button></div>
                  </form>
                </details>
              )}
            </div>
          </section>
        </div>

        <aside className="rc-perfil-lado">
          <section className="panel">
            <div className="panel-cab">Filiación</div>
            <div className="panel-cuerpo rc-datos">
              {filiacion.length === 0 && r.tipo !== "matrimonio" && <p className="tenue" style={{ margin: 0 }}>No consta.</p>}
              {filiacion.map((f) => <Dato key={f.t} t={f.t} v={f.v} />)}
              {r.tipo === "matrimonio" && <Dato t="Cónyuge" v={[r.conyuge_nombre, r.conyuge_dni && `DNI ${r.conyuge_dni}`].filter(Boolean).join(" · ")} />}
            </div>
          </section>
          <section className="panel">
            <div className="panel-cab">Más datos</div>
            <div className="panel-cuerpo rc-datos">
              <Dato t="Lugar" v={r.lugar} />
              <Dato t="Observaciones" v={r.observaciones} />
            </div>
          </section>
          {(otros ?? []).length > 0 && (
            <section className="panel">
              <div className="panel-cab">Otras actas de esta persona</div>
              <div className="panel-cuerpo">
                <ul className="lista-docs">
                  {(otros ?? []).map((o) => (
                    <li key={o.id}>
                      <span className="nombre-doc"><b>{NOMBRE_TIPO_RC[o.tipo] ?? o.tipo}</b><small>{o.fecha_acto ? fecha(o.fecha_acto) : "sin fecha"}{o.numero_acta ? ` · acta ${o.numero_acta}` : ""}</small></span>
                      <Link className="btn chico contorno" href={`/registro-civil/${o.id}`}>Ver</Link>
                    </li>
                  ))}
                </ul>
              </div>
            </section>
          )}
        </aside>
      </div>
    </>
  );
}
