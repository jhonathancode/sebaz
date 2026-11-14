import Link from "next/link";
import Avisos, { type ParamsAviso } from "@/components/Avisos";
import BotonConfirmar from "@/components/BotonConfirmar";
import Estado from "@/components/Estado";
import VentanaFlotante from "@/components/VentanaFlotante";
import CampoArchivoEstado from "@/components/formularios/CampoArchivoEstado";
import { contextoMcp, tiene } from "@/lib/contexto";
import { fecha } from "@/lib/formato";
import { MODELOS_BASE, TIPOS_SEC, tipoSec } from "@/lib/secretaria";
import { supabaseServidor } from "@/lib/supabase/server";
import { archivarModelo, crearDesdeModelo, importarModeloWord } from "./acciones";

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
            <b className="sa-asunto">{d.asunto || "Sin asunto"}</b>
            <span>{nombreArchivo(d)}</span>
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
    const { data: mp } = await supabase.from("sec_modelos").select("id, nombre, asunto").eq("mcp_id", ctx.mcp.id).eq("tipo", tipo).eq("activo", true).order("nombre");
    const propios = mp ?? [];
    const base = MODELOS_BASE.filter((m) => m.tipo === tipo);
    const deTipo = todos.filter((d) => d.tipo === tipo);
    const filas = deTipo.filter((d) => (!estado || d.estado === estado) && (!q || coincide(d)));
    return (
      <>
        <nav className="sec-ruta" aria-label="Ubicación"><Link href="/secretaria">Secretaría</Link><span>›</span><b>{t.plural}</b></nav>
        <div className="titulo-ventana">
          <h1>{t.plural}</h1>
          <span className="espacio" />
          {puede && (
            <>
              <VentanaFlotante boton="Subir modelo de Word" titulo={`Subir un modelo de ${t.nombre.toLowerCase()} desde Word`} accion={importarModeloWord} textoGuardar="Cargar modelo" claseBoton="btn">
                <input type="hidden" name="tipo" value={tipo} />
                <label className="campo">Nombre del modelo<input name="nombre" required placeholder={`Ej.: ${t.nombre} de audiencia pública`} /></label>
                <CampoArchivoEstado etiqueta="Archivo de Word (.docx)" multiple={false} accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document" ayuda="Solo .docx, máximo 4 MB. Quedará guardado en esta carpeta, en «Mis modelos»." />
              </VentanaFlotante>
              <form action={crearDesdeModelo}>
                <input type="hidden" name="origen" value={`blanco:${tipo}`} />
                <button type="submit" className="btn primario">{t.nombre} en blanco</button>
              </form>
            </>
          )}
        </div>
        <Avisos ok={sp.ok} error={sp.error} />
        {puede && (
          <>
            <h2 className="sec-grupo">Modelos · un clic crea el documento</h2>
            <div className="sec-mods">
              {propios.map((m) => (
                <div key={m.id} className="sec-mod propio">
                  <form action={crearDesdeModelo}>
                    <input type="hidden" name="origen" value={`propio:${m.id}`} />
                    <button type="submit" className="sec-mod-btn"><Hoja /><span><b>{m.nombre}</b><small>Mi modelo</small></span></button>
                  </form>
                  <form action={archivarModelo} className="sec-mod-x">
                    <input type="hidden" name="id" value={m.id} />
                    <input type="hidden" name="tipo" value={tipo} />
                    <BotonConfirmar className="btn chico contorno" pregunta="¿Archivar este modelo?" detalle="Dejará de aparecer aquí. Los documentos ya hechos con él no cambian." textoConfirmar="Sí, archivar">Archivar</BotonConfirmar>
                  </form>
                </div>
              ))}
              {base.map((m) => (
                <div key={m.id} className="sec-mod">
                  <form action={crearDesdeModelo}>
                    <input type="hidden" name="origen" value={`base:${m.id}`} />
                    <button type="submit" className="sec-mod-btn"><Hoja /><span><b>{m.nombre}</b><small>{m.detalle}</small></span></button>
                  </form>
                </div>
              ))}
            </div>
          </>
        )}
        <h2 className="sec-grupo">Documentos</h2>
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
            <p>{deTipo.length ? "Ningún archivo coincide con la búsqueda." : "Todavía no hay documentos. Pulse un modelo de arriba para crear el primero."}</p>
          </div>
        ) : (
          [
            { clave: "emitido", titulo: "Emitidos", vacio: `Aquí aparecerán los ${t.plural.toLowerCase()} que emita, con su número correlativo.` },
            { clave: "borrador", titulo: "Borradores (aún sin número)", vacio: "" },
            { clave: "anulado", titulo: "Anulados", vacio: "" },
          ].map((g) => {
            const lista = filas.filter((d) => d.estado === g.clave).sort((a, b) => (b.numero ?? 0) - (a.numero ?? 0) || b.fecha.localeCompare(a.fecha));
            if (lista.length === 0 && (!g.vacio || estado)) return null;
            return (
              <section key={g.clave} className="sec-seccion">
                <h3 className="sec-sub-grupo">{g.titulo} <span>{lista.length}</span></h3>
                {lista.length === 0 ? <p className="tenue pequeno">{g.vacio}</p> : <Archivos docs={lista} puede={puede} />}
              </section>
            );
          })
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
