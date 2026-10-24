import Link from "next/link";
import Avisos, { type ParamsAviso } from "@/components/Avisos";
import { obtenerContexto } from "@/lib/contexto";
import { fechaHora } from "@/lib/formato";
import { ES_TIPO_AVISO, TIPOS_AVISO, type Aviso, type TipoAviso } from "@/lib/notificaciones";
import { supabaseServidor } from "@/lib/supabase/server";
import { abrirAviso, marcarTodasLeidas } from "./acciones";

/** Todos los mensajes de la persona, con filtro por tipo. */
export default async function Mensajes({ searchParams }: { searchParams: ParamsAviso & { tipo?: string; solo?: string } }) {
  const sp = await searchParams;
  const ctx = await obtenerContexto();
  const supabase = await supabaseServidor();
  const tipo = sp.tipo && ES_TIPO_AVISO(sp.tipo) ? sp.tipo : "";
  const soloNuevos = sp.solo === "nuevos";

  const { data, error } = await supabase
    .from("notificaciones")
    .select("id, tipo, titulo, detalle, enlace, leida_en, creado_en")
    .eq("user_id", ctx.userId)
    .order("creado_en", { ascending: false })
    .limit(300);
  if (error) return <div className="aviso error">Falta la actualización de la base de datos (ACTUALIZAR_BASE.sql) para activar los mensajes.</div>;
  const todos = (data ?? []) as Aviso[];
  const cuenta = (t: TipoAviso) => todos.filter((a) => a.tipo === t).length;
  const lista = todos.filter((a) => (!tipo || a.tipo === tipo) && (!soloNuevos || !a.leida_en));
  const sinLeer = todos.filter((a) => !a.leida_en).length;
  const enlace = (p: { tipo?: string; solo?: string }) => {
    const q = new URLSearchParams();
    const t = p.tipo ?? tipo;
    const s = p.solo ?? (soloNuevos ? "nuevos" : "");
    if (t) q.set("tipo", t);
    if (s) q.set("solo", s);
    return `/mensajes${q.size ? `?${q}` : ""}`;
  };

  return (
    <>
      <div className="cab-vista">
        <div>
          <h1>Mensajes</h1>
          <div className="sub">Avisos de aprobación, novedades del sistema y mensajes de soporte.</div>
        </div>
        <span className="espacio" />
        {sinLeer > 0 && (
          <form action={marcarTodasLeidas}>
            <button className="btn contorno" type="submit">Marcar todo como leído ({sinLeer})</button>
          </form>
        )}
      </div>
      <Avisos ok={sp.ok} error={sp.error} />

      <div className="filtros">
        <div className="grupo" role="group" aria-label="Tipo de mensaje">
          <Link className={`f-chip${tipo === "" ? " activo" : ""}`} href={enlace({ tipo: "" })}>Todos <span className="n">{todos.length}</span></Link>
          {(Object.keys(TIPOS_AVISO) as TipoAviso[]).map((t) => (
            <Link key={t} className={`f-chip chip-nt nt-${t}${tipo === t ? " activo" : ""}`} href={enlace({ tipo: t })} title={TIPOS_AVISO[t].ayuda}>
              <span className="nt-punto" aria-hidden="true" />{TIPOS_AVISO[t].nombre} <span className="n">{cuenta(t)}</span>
            </Link>
          ))}
        </div>
        <div className="grupo">
          <Link className={`f-chip${soloNuevos ? " activo" : ""}`} href={enlace({ solo: soloNuevos ? "" : "nuevos" })}>Solo sin leer</Link>
        </div>
      </div>

      <div className="filas">
        {lista.length === 0 && <div className="vacio">No hay mensajes con este filtro.</div>}
        {lista.map((a) => (
          <form key={a.id} action={abrirAviso}>
            <input type="hidden" name="id" value={a.id} />
            <button type="submit" className={`aviso-item aviso-fila nt-${a.tipo}${a.leida_en ? "" : " nuevo"}`}>
              <span className="nt-ico" aria-hidden="true">{TIPOS_AVISO[a.tipo].simbolo}</span>
              <span className="nt-texto">
                <span className="nt-titulo">{a.titulo}</span>
                {a.detalle && <span className="nt-detalle">{a.detalle}</span>}
                <span className="nt-pie"><span className="nt-etq">{TIPOS_AVISO[a.tipo].nombre}</span> · {fechaHora(a.creado_en)}{a.leida_en ? "" : " · sin leer"}</span>
              </span>
            </button>
          </form>
        ))}
      </div>
    </>
  );
}
