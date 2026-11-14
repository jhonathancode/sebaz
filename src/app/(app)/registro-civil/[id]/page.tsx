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

  return (
    <>
      <div className="titulo-ventana">
        <h1>{nombreCompleto(r)}</h1>
        <span className="etq">{NOMBRE_TIPO_RC[r.tipo] ?? r.tipo}</span>
        {anulado && <span className="etq">Anulado</span>}
        <span className="espacio" />
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
        <Link className="btn" href="/registro-civil">Cerrar</Link>
      </div>
      <Avisos ok={sp.ok} error={sp.error} />
      {anulado && <div className="aviso error">Registro anulado: {r.anulado_motivo}</div>}

      <div className="columnas en-pila">
        <div className="principal">
          <section className="panel">
            <div className="panel-cab">Partida y constancias adjuntas</div>
            <div className="panel-cuerpo">
              {vigentes.length === 0 && <p className="tenue">Todavía no tiene la partida adjunta. {puede ? "Súbala abajo para poder imprimirla desde aquí." : ""}</p>}
              <ul className="lista-docs">
                {vigentes.map((a) => {
                  const url = urlVer.get(a.archivo_path);
                  return (
                    <li key={a.id}>
                      <span className="nombre-doc">
                        <b>{a.descripcion}</b>
                        <small>{a.archivo_nombre} · subido el {fecha(String(a.creado_en).slice(0, 10))}</small>
                      </span>
                      {url ? <VisorArchivo url={url} descarga={urlBajar.get(a.archivo_path) ?? url} nombre={a.archivo_nombre ?? "partida"} tipo={a.archivo_tipo ?? "application/pdf"} titulo={`${a.descripcion} · ${nombreCompleto(r)}`} /> : <span className="tenue pequeno">No disponible</span>}
                      {puede && <Motivo accion={anularPartida} boton="Anular" ayuda="Motivo" campos={{ id: a.id, registro_id: id }} chico motivos={MOTIVOS_ARCHIVO} />}
                    </li>
                  );
                })}
              </ul>
              {(archivos ?? []).filter((a) => a.anulado).map((a) => (
                <p key={a.id} className="tenue pequeno" style={{ margin: "6px 0 0" }}>Anulado: {a.descripcion} ({a.archivo_nombre}) · {a.anulado_motivo}</p>
              ))}
              {puede && !anulado && (
                <form action={subirPartida} className="barra" style={{ marginTop: 14 }}>
                  <input type="hidden" name="registro_id" value={id} />
                  <label className="campo">Qué documento es
                    <select name="descripcion" defaultValue="Partida">
                      {DESCRIPCIONES_ARCHIVO.map((d) => <option key={d}>{d}</option>)}
                    </select>
                  </label>
                  <div style={{ flex: "1 1 260px" }}>
                    <CampoArchivoEstado etiqueta="Foto o PDF" multiple={false} ayuda="PDF o foto; máximo 4 MB. Las fotos grandes se reducen solas." />
                  </div>
                  <button className="btn primario" type="submit">Adjuntar</button>
                </form>
              )}
            </div>
          </section>

          <section className="panel">
            <div className="panel-cab">Copias entregadas</div>
            <div className="panel-cuerpo">
              {(entregas ?? []).length === 0 ? (
                <p className="tenue">Aún no se registró ninguna entrega de copia.</p>
              ) : (
                <div className="tabla-marco" style={{ border: "none" }}>
                  <table className="tabla">
                    <thead><tr><th>Fecha</th><th>Solicitante</th><th>DNI</th><th>Motivo</th></tr></thead>
                    <tbody>
                      {(entregas ?? []).map((e) => (
                        <tr key={e.id}><td>{fecha(e.fecha)}</td><td className="envolver">{e.solicitante_nombre}</td><td>{e.solicitante_dni ?? "—"}</td><td className="envolver">{e.motivo ?? "—"}</td></tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {puede && !anulado && (
                <form action={registrarEntrega} className="barra" style={{ marginTop: 14 }}>
                  <input type="hidden" name="registro_id" value={id} />
                  <label className="campo" style={{ flex: "2 1 220px" }}>Quién pidió la copia<input name="solicitante_nombre" required style={{ textTransform: "uppercase" }} autoComplete="off" /></label>
                  <label className="campo">DNI<input name="solicitante_dni" inputMode="numeric" maxLength={8} autoComplete="off" /></label>
                  <label className="campo" style={{ flex: "2 1 200px" }}>Para qué<input name="motivo" placeholder="Ej.: MATRÍCULA, TRÁMITE DE DNI" style={{ textTransform: "uppercase" }} autoComplete="off" /></label>
                  <button className="btn" type="submit">Registrar entrega</button>
                </form>
              )}
            </div>
          </section>
        </div>

        <aside className="lateral">
          <section className="panel">
            <div className="panel-cab">Datos del acta</div>
            <div className="panel-cuerpo rc-datos">
              <Dato t="DNI" v={r.dni} />
              <Dato t="Fecha del hecho" v={r.fecha_acto ? fecha(r.fecha_acto) : null} />
              <Dato t="Sexo" v={r.sexo === "M" ? "Masculino" : r.sexo === "F" ? "Femenino" : null} />
              <Dato t="Lugar" v={r.lugar} />
              <Dato t="Padre" v={r.padre} />
              <Dato t="Madre" v={r.madre} />
              {r.tipo === "matrimonio" && <Dato t="Cónyuge" v={[r.conyuge_nombre, r.conyuge_dni].filter(Boolean).join(" · ")} />}
              <Dato t="N° de acta" v={r.numero_acta} />
              <Dato t="N° de expediente" v={r.expediente} />
              <Dato t="Libro / Folio" v={[r.libro, r.folio].filter(Boolean).join(" / ")} />
              <Dato t="Guardado en" v={r.ubicacion} />
              <Dato t="Origen" v={r.origen === "digital" ? "Sistema digital" : "Libro físico"} />
              {r.observaciones && <Dato t="Observaciones" v={r.observaciones} />}
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
