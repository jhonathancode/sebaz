import Avisos, { type ParamsAviso } from "@/components/Avisos";
import BotonConfirmar from "@/components/BotonConfirmar";
import { obtenerContexto } from "@/lib/contexto";
import { fechaHora } from "@/lib/formato";
import { TIPOS_AVISO, type TipoAviso } from "@/lib/notificaciones";
import { supabaseServicio, supabaseServidor } from "@/lib/supabase/server";
import { enviarMensaje } from "../acciones";

/** Mensajes y novedades del sistema para los usuarios de las municipalidades. */
export default async function Mensajes({ searchParams }: { searchParams: ParamsAviso }) {
  const sp = await searchParams;
  const ctx = await obtenerContexto();
  if (!ctx.esSuperadmin) return <div className="aviso error">Esta pantalla es solo para el dueño del sistema.</div>;
  const supabase = await supabaseServidor();
  const { data: mcps } = await supabase.from("mcps").select("id, nombre").order("nombre");

  // Últimos envíos (se agrupan los que salieron juntos)
  let envios: { titulo: string; tipo: TipoAviso; creado: string; n: number; leidos: number }[] = [];
  try {
    const { data } = await supabaseServicio()
      .from("notificaciones")
      .select("titulo, tipo, creado_en, leida_en")
      .eq("de", ctx.userId)
      .in("tipo", ["sistema", "mensaje"])
      .order("creado_en", { ascending: false })
      .limit(600);
    const grupos = new Map<string, { titulo: string; tipo: TipoAviso; creado: string; n: number; leidos: number }>();
    for (const r of data ?? []) {
      const clave = `${r.titulo}|${r.tipo}|${r.creado_en.slice(0, 16)}`;
      const g = grupos.get(clave) ?? { titulo: r.titulo, tipo: r.tipo as TipoAviso, creado: r.creado_en, n: 0, leidos: 0 };
      g.n++;
      if (r.leida_en) g.leidos++;
      grupos.set(clave, g);
    }
    envios = [...grupos.values()].slice(0, 15);
  } catch {
    envios = [];
  }

  return (
    <>
      <div className="cab-vista">
        <div>
          <h1>Mensajes y novedades</h1>
          <div className="sub">Avise a las municipalidades de una actualización o escriba un mensaje. Les llega a la campana de arriba.</div>
        </div>
      </div>
      <Avisos ok={sp.ok} error={sp.error} />

      <div className="dos-columnas">
        <form action={enviarMensaje} className="panel">
          <div className="panel-cab">Nuevo mensaje</div>
          <div className="panel-cuerpo">
            <div className="rejilla-2">
              <label className="campo">
                Para
                <select name="para" defaultValue="todos">
                  <option value="todos">Todos los usuarios</option>
                  {(mcps ?? []).map((m) => <option key={m.id} value={m.id}>{m.nombre}</option>)}
                </select>
              </label>
              <label className="campo">
                Tipo
                <select name="tipo" defaultValue="sistema">
                  <option value="sistema">Actualización o novedad del sistema</option>
                  <option value="mensaje">Mensaje</option>
                </select>
              </label>
            </div>
            <label className="campo">Título<input name="titulo" required minLength={4} maxLength={120} placeholder="Ej.: Nueva versión: documentos más ordenados" /></label>
            <label className="campo">Texto (opcional)<textarea name="detalle" maxLength={600} rows={4} placeholder="Qué cambió o qué deben hacer" /></label>
            <BotonConfirmar pregunta="¿Enviar este mensaje?" detalle="Les llegará a la campana a todas las personas indicadas y no se puede deshacer." textoConfirmar="Sí, enviar">Enviar mensaje</BotonConfirmar>
          </div>
        </form>

        <div className="columna">
          <section className="panel">
            <div className="panel-cab">Cómo se ven los mensajes</div>
            <div className="panel-cuerpo">
              {(Object.keys(TIPOS_AVISO) as TipoAviso[]).map((t) => (
                <div key={t} className={`aviso-item nt-${t} nuevo`} style={{ cursor: "default", opacity: 1 }}>
                  <span className="nt-ico" aria-hidden="true">{TIPOS_AVISO[t].simbolo}</span>
                  <span className="nt-texto"><span className="nt-titulo">{TIPOS_AVISO[t].nombre}</span><span className="nt-detalle">{TIPOS_AVISO[t].ayuda}</span></span>
                </div>
              ))}
              <span className="pequeno tenue">Los de aprobado, devuelto, anulado y por aprobar salen solos cuando el alcalde o el equipo actúan. Usted envía los de «Sistema» y «Mensaje».</span>
            </div>
          </section>
          <section className="panel">
            <div className="panel-cab">Últimos envíos</div>
            <div className="filas" style={{ border: "none", borderRadius: 0 }}>
              {envios.length === 0 && <div className="vacio">Aún no ha enviado mensajes.</div>}
              {envios.map((e, i) => (
                <div key={i} className="fila" style={{ gridTemplateColumns: "minmax(0,1fr) auto" }}>
                  <div className="f-desc"><span className="f-titulo">{e.titulo}</span><div className="f-meta"><span className={`etq nt-${e.tipo}`}>{TIPOS_AVISO[e.tipo].nombre}</span><span>{fechaHora(e.creado)}</span></div></div>
                  <div className="pequeno tenue" style={{ textAlign: "right" }}>{e.leidos} de {e.n} leyeron</div>
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>
    </>
  );
}
