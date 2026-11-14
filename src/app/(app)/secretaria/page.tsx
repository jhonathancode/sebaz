import Link from "next/link";
import Avisos, { type ParamsAviso } from "@/components/Avisos";
import Estado from "@/components/Estado";
import { contextoMcp, tiene } from "@/lib/contexto";
import { fecha } from "@/lib/formato";
import { codigoSec, TIPOS_SEC, tipoSec } from "@/lib/secretaria";
import { supabaseServidor } from "@/lib/supabase/server";

export default async function Secretaria({ searchParams }: { searchParams: ParamsAviso }) {
  const sp = await searchParams;
  const ctx = await contextoMcp();
  const supabase = await supabaseServidor();
  const puede = tiene(ctx, "admin", "tesorero", "contador", "alcalde");
  const { data, error } = await supabase
    .from("sec_documentos")
    .select("id, tipo, numero, anio, estado, fecha, destinatario, asunto, archivo_path, creado_en")
    .eq("mcp_id", ctx.mcp.id)
    .order("fecha", { ascending: false })
    .order("creado_en", { ascending: false })
    .limit(500);
  const todos = data ?? [];
  const q = (sp.q ?? "").toLowerCase().trim();
  const tipo = sp.tipo ?? "";
  const estado = sp.estado ?? "";
  const filas = todos.filter(
    (d) =>
      (!tipo || d.tipo === tipo) &&
      (!estado || d.estado === estado) &&
      (!q || `${d.destinatario ?? ""} ${d.asunto ?? ""} ${codigoSec(d.tipo, d.numero, d.anio, ctx.mcp.nombre)}`.toLowerCase().includes(q)),
  );
  const enlace = (extra: Record<string, string>) => {
    const p = new URLSearchParams();
    const base: Record<string, string> = { q: sp.q ?? "", tipo, estado, ...extra };
    for (const [k, v] of Object.entries(base)) if (v) p.set(k, v);
    const s = p.toString();
    return `/secretaria${s ? `?${s}` : ""}`;
  };
  const borradores = todos.filter((d) => d.estado === "borrador").length;

  return (
    <>
      <div className="titulo-ventana">
        <h1>Secretaría</h1>
        <span className="espacio" />
        {puede && <Link className="btn primario" href="/secretaria/nuevo">Nuevo documento</Link>}
      </div>
      <Avisos ok={sp.ok} error={sp.error} />
      {error && <div className="aviso error">El módulo aún no está activo: falta la actualización de la base de datos (ACTUALIZAR_BASE.sql). Avise a soporte.</div>}

      <div className="ing-franja" aria-label="Resumen">
        <span><small>Documentos</small><b>{todos.filter((d) => d.estado === "emitido").length}</b><em>emitidos</em></span>
        <span><small>Borradores</small><b>{borradores}</b></span>
        <span><small>Anulados</small><b>{todos.filter((d) => d.estado === "anulado").length}</b></span>
      </div>

      <div className="sec-tipos" role="group" aria-label="Tipo de documento">
        <Link href={enlace({ tipo: "" })} className={!tipo ? "activo" : undefined}>Todos</Link>
        {TIPOS_SEC.map((t) => (
          <Link key={t.clave} href={enlace({ tipo: t.clave })} className={tipo === t.clave ? "activo" : undefined}>{t.plural}</Link>
        ))}
      </div>

      <form className="ing-filtros" method="get">
        {tipo && <input type="hidden" name="tipo" value={tipo} />}
        <input name="q" defaultValue={sp.q ?? ""} placeholder="Buscar: asunto, destinatario o número" aria-label="Buscar" />
        <select name="estado" defaultValue={estado} aria-label="Estado">
          <option value="">Todos los estados</option>
          <option value="emitido">Emitidos</option>
          <option value="borrador">Borradores</option>
          <option value="anulado">Anulados</option>
        </select>
        <button className="btn" type="submit">Filtrar</button>
      </form>

      <div className="cc-excel-marco">
        <table className="cc-excel">
          <caption>Archivo de documentos</caption>
          <thead>
            <tr><th>Documento</th><th>Fecha</th><th>Destinatario</th><th>Asunto</th><th>Estado</th><th className="cc-acc-th"><span className="sr-solo">Ver</span></th></tr>
          </thead>
          <tbody>
            {filas.length === 0 && <tr><td colSpan={6} className="cc-vacio">{todos.length ? "Ningún documento coincide con la búsqueda." : "Aún no hay documentos. Pulse «Nuevo documento» y elija un modelo."}</td></tr>}
            {filas.map((d) => (
              <tr key={d.id} className={d.estado === "anulado" ? "anulado sin-pdf" : undefined}>
                <td><b>{d.numero ? `${tipoSec(d.tipo).nombre} N° ${String(d.numero).padStart(3, "0")}-${d.anio}` : `${tipoSec(d.tipo).nombre} (borrador)`}</b></td>
                <td className="c">{fecha(d.fecha)}</td>
                <td>{d.destinatario || "—"}</td>
                <td className="tachar">{d.asunto || "—"}{d.archivo_path && <span title="Tiene el escaneado firmado"> 📎</span>}</td>
                <td className="c"><Estado valor={d.estado} /></td>
                <td className="acc"><div className="acciones-fila"><Link className="btn chico contorno" href={d.estado === "borrador" && puede ? `/secretaria/${d.id}/editar` : `/secretaria/${d.id}`}>{d.estado === "borrador" && puede ? "Continuar" : "Ver"}</Link></div></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
