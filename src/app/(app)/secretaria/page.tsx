import Link from "next/link";
import Avisos, { type ParamsAviso } from "@/components/Avisos";
import Estado from "@/components/Estado";
import { contextoMcp, tiene } from "@/lib/contexto";
import { fecha } from "@/lib/formato";
import { TIPOS_SEC, tipoSec } from "@/lib/secretaria";
import { supabaseServidor } from "@/lib/supabase/server";

type Doc = { id: string; tipo: string; numero: number | null; anio: number; estado: string; fecha: string; destinatario: string | null; asunto: string | null; archivo_path: string | null };

const Carpeta = () => (
  <svg viewBox="0 0 64 52" aria-hidden="true" className="sec-ico-carpeta">
    <path d="M4 10a5 5 0 0 1 5-5h14l6 7h26a5 5 0 0 1 5 5v26a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5Z" fill="currentColor" opacity=".35" />
    <path d="M4 18a5 5 0 0 1 5-5h46a5 5 0 0 1 5 5v23a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5Z" fill="currentColor" />
  </svg>
);
const Hoja = () => (
  <svg viewBox="0 0 40 48" aria-hidden="true" className="sec-ico-hoja">
    <path d="M6 3h20l10 10v30a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z" fill="#fff" stroke="currentColor" strokeWidth="2" />
    <path d="M26 3v10h10" fill="none" stroke="currentColor" strokeWidth="2" />
    <path d="M10 22h20M10 28h20M10 34h13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
  </svg>
);

const nombreArchivo = (d: Doc) => (d.numero ? `${tipoSec(d.tipo).nombre} N° ${String(d.numero).padStart(3, "0")}-${d.anio}` : `${tipoSec(d.tipo).nombre} · borrador`);

function Archivos({ docs, puede }: { docs: Doc[]; puede: boolean }) {
  return (
    <div className="sec-archivos">
      {docs.map((d) => (
        <Link key={d.id} href={d.estado === "borrador" && puede ? `/secretaria/${d.id}/editar` : `/secretaria/${d.id}`} className={`sec-archivo${d.estado === "anulado" ? " anulado" : ""}`}>
          <Hoja />
          <div className="sa-texto">
            <b>{nombreArchivo(d)}</b>
            <span className="sa-asunto">{d.asunto || "Sin asunto"}</span>
            <small>{fecha(d.fecha)}{d.destinatario ? ` · ${d.destinatario}` : ""}{d.archivo_path ? " · 📎 firmado" : ""}</small>
          </div>
          <Estado valor={d.estado} />
        </Link>
      ))}
    </div>
  );
}

export default async function Secretaria({ searchParams }: { searchParams: ParamsAviso }) {
  const sp = await searchParams;
  const ctx = await contextoMcp();
  const supabase = await supabaseServidor();
  const puede = tiene(ctx, "admin", "tesorero", "contador", "alcalde");
  const { data, error } = await supabase
    .from("sec_documentos")
    .select("id, tipo, numero, anio, estado, fecha, destinatario, asunto, archivo_path")
    .eq("mcp_id", ctx.mcp.id)
    .order("fecha", { ascending: false })
    .order("creado_en", { ascending: false })
    .limit(1000);
  const todos = (data ?? []) as Doc[];
  const tipo = TIPOS_SEC.some((t) => t.clave === sp.tipo) ? (sp.tipo as string) : "";
  const estado = sp.estado ?? "";
  const q = (sp.q ?? "").toLowerCase().trim();
  const coincide = (d: Doc) => `${d.destinatario ?? ""} ${d.asunto ?? ""} ${nombreArchivo(d)}`.toLowerCase().includes(q);
  const enlace = (extra: Record<string, string>) => {
    const p = new URLSearchParams();
    const base: Record<string, string> = { tipo, q: sp.q ?? "", estado, ...extra };
    for (const [k, v] of Object.entries(base)) if (v) p.set(k, v);
    const s = p.toString();
    return `/secretaria${s ? `?${s}` : ""}`;
  };

  // ---------------------------------------------------------- dentro de una carpeta
  if (tipo) {
    const t = tipoSec(tipo);
    const deTipo = todos.filter((d) => d.tipo === tipo);
    const filas = deTipo.filter((d) => (!estado || d.estado === estado) && (!q || coincide(d)));
    return (
      <>
        <nav className="sec-ruta" aria-label="Ubicación"><Link href="/secretaria">Secretaría</Link><span>›</span><b>{t.plural}</b></nav>
        <div className="titulo-ventana">
          <h1>{t.plural}</h1>
          <span className="espacio" />
          {puede && <Link className="btn primario" href={`/secretaria/nuevo?tipo=${tipo}`}>Nuevo: {t.nombre}</Link>}
        </div>
        <Avisos ok={sp.ok} error={sp.error} />
        <form className="ing-filtros" method="get">
          <input type="hidden" name="tipo" value={tipo} />
          <input name="q" defaultValue={sp.q ?? ""} placeholder={`Buscar en ${t.plural.toLowerCase()}: asunto, destinatario o número`} aria-label="Buscar" />
          <select name="estado" defaultValue={estado} aria-label="Estado">
            <option value="">Todos</option>
            <option value="emitido">Emitidos</option>
            <option value="borrador">Borradores</option>
            <option value="anulado">Anulados</option>
          </select>
          <button className="btn" type="submit">Filtrar</button>
        </form>
        {filas.length === 0 ? (
          <div className="sec-vacia">
            <Carpeta />
            <p>{deTipo.length ? "Ningún archivo coincide con la búsqueda." : `Esta carpeta está vacía. Pulse «Nuevo: ${t.nombre}» y elija un modelo.`}</p>
          </div>
        ) : (
          <Archivos docs={filas} puede={puede} />
        )}
      </>
    );
  }

  // ---------------------------------------------------------- raíz: las carpetas
  const buscando = q.length > 0;
  const hallados = buscando ? todos.filter(coincide) : [];
  return (
    <>
      <div className="titulo-ventana">
        <h1>Secretaría</h1>
        <span className="espacio" />
        {puede && <Link className="btn primario" href="/secretaria/nuevo">Nuevo documento</Link>}
      </div>
      <Avisos ok={sp.ok} error={sp.error} />
      {error && <div className="aviso error">El módulo aún no está activo: falta la actualización de la base de datos (ACTUALIZAR_BASE.sql). Avise a soporte.</div>}

      <form className="ing-filtros" method="get">
        <input name="q" defaultValue={sp.q ?? ""} placeholder="Buscar en todos los documentos: asunto, destinatario o número" aria-label="Buscar" />
        <button className="btn" type="submit">Buscar</button>
        {buscando && <Link className="btn contorno" href="/secretaria">Quitar búsqueda</Link>}
      </form>

      {buscando ? (
        hallados.length === 0 ? <div className="sec-vacia"><Carpeta /><p>No se encontró ningún documento.</p></div> : <Archivos docs={hallados} puede={puede} />
      ) : (
        <>
          <div className="sec-carpetas">
            {TIPOS_SEC.map((t) => {
              const lista = todos.filter((d) => d.tipo === t.clave);
              const borr = lista.filter((d) => d.estado === "borrador").length;
              const emit = lista.filter((d) => d.estado === "emitido").length;
              return (
                <Link key={t.clave} href={`/secretaria?tipo=${t.clave}`} className="sec-carpeta">
                  <Carpeta />
                  <b>{t.plural}</b>
                  <small>{lista.length === 0 ? "Vacía" : `${emit} emitido${emit === 1 ? "" : "s"}${borr ? ` · ${borr} borrador${borr === 1 ? "" : "es"}` : ""}`}</small>
                </Link>
              );
            })}
          </div>
          {todos.length > 0 && (
            <>
              <h2 className="sec-grupo">Recientes</h2>
              <Archivos docs={todos.slice(0, 6)} puede={puede} />
            </>
          )}
        </>
      )}
    </>
  );
}
