"use client";

import { marked } from "marked";
import { useMemo, useRef, useState } from "react";
import { subirImagenWeb } from "@/app/(app)/superadmin/web/acciones";
import BotonConfirmar from "@/components/BotonConfirmar";
import CampoImagenWeb, { reducirImagen } from "@/components/CampoImagenWeb";
import { normalizarParrafos, slugify, tiempoLectura } from "@/lib/sitio/texto";

export type DatosArticulo = {
  id?: string;
  titulo: string;
  slug: string;
  extracto: string;
  contenido: string;
  portada_path: string;
  categoria_id: string;
  etiquetas: string;
  autor: string;
  estado: string;
  publicado_en: string; // yyyy-MM-ddTHH:mm en hora de Lima
  destacado: boolean;
  seo_titulo: string;
  seo_descripcion: string;
};

export default function EditorArticulo({ inicial, categorias, guardar, urlPublica }: { inicial: DatosArticulo; categorias: { id: string; nombre: string }[]; guardar: (fd: FormData) => Promise<void>; urlPublica?: string }) {
  const [d, setD] = useState<DatosArticulo>(inicial);
  const [slugManual, setSlugManual] = useState(!!inicial.id);
  const [pestana, setPestana] = useState<"escribir" | "vista">("escribir");
  const [subiendo, setSubiendo] = useState(false);
  const area = useRef<HTMLTextAreaElement>(null);
  const fotos = useRef<HTMLInputElement>(null);
  const poner = <K extends keyof DatosArticulo>(k: K, v: DatosArticulo[K]) => setD((x) => ({ ...x, [k]: v }));

  const html = useMemo(() => marked.parse(normalizarParrafos(d.contenido || ""), { async: false, gfm: true }) as string, [d.contenido]);
  const palabras = d.contenido.split(/\s+/).filter(Boolean).length;

  function envolver(antes: string, despues = antes, ejemplo = "texto") {
    const el = area.current;
    if (!el) return;
    const { selectionStart: a, selectionEnd: b, value } = el;
    const sel = value.slice(a, b) || ejemplo;
    const nuevo = value.slice(0, a) + antes + sel + despues + value.slice(b);
    poner("contenido", nuevo);
    setTimeout(() => {
      el.focus();
      el.setSelectionRange(a + antes.length, a + antes.length + sel.length);
    }, 0);
  }
  function lineas(prefijo: string | ((i: number) => string)) {
    const el = area.current;
    if (!el) return;
    const { selectionStart: a, selectionEnd: b, value } = el;
    const ini = value.lastIndexOf("\n", a - 1) + 1;
    const finIdx = value.indexOf("\n", b);
    const fin = finIdx === -1 ? value.length : finIdx;
    const bloque = value.slice(ini, fin).split("\n").map((l, i) => (typeof prefijo === "function" ? prefijo(i) : prefijo) + l).join("\n");
    poner("contenido", value.slice(0, ini) + bloque + value.slice(fin));
    setTimeout(() => el.focus(), 0);
  }
  /** Pasa a minúsculas normales lo que quedó guardado en MAYÚSCULAS (primera letra de cada oración en mayúscula). */
  function aNormal() {
    if (!window.confirm("¿Convertir título, resumen, contenido y autor a minúsculas normales? Revise después las siglas y nombres propios.")) return;
    const oracion = (t: string) =>
      t.toLocaleLowerCase("es-PE").replace(/(^|[.!?¿¡]\s+|\n+(?:#{1,6}\s+|[-*>]\s+|\d+\.\s+)?)(\p{L})/gu, (_m, ini: string, l: string) => ini + l.toLocaleUpperCase("es-PE"));
    const nombre = (t: string) => t.toLocaleLowerCase("es-PE").replace(/(^|\s)(\p{L})/gu, (_m, ini: string, l: string) => ini + l.toLocaleUpperCase("es-PE"));
    setD((x) => ({ ...x, titulo: oracion(x.titulo), extracto: oracion(x.extracto), contenido: oracion(x.contenido), autor: nombre(x.autor) }));
  }
  async function imagen(f: File) {
    setSubiendo(true);
    const fd = new FormData();
    fd.set("imagen", await reducirImagen(f));
    const r = await subirImagenWeb(fd);
    setSubiendo(false);
    if (r.error) return window.alert(r.error);
    envolver(`![`, `](${r.url})`, f.name.replace(/\.[^.]+$/, ""));
  }

  return (
    <form action={guardar} className="ea" data-sin-mayusculas>
      {d.id && <input type="hidden" name="id" value={d.id} />}
      <input type="hidden" name="contenido" value={d.contenido} />

      <div className="ea-principal">
        <label className="campo">
          Título
          <input
            name="titulo"
            value={d.titulo}
            required
            className="ea-titulo"
            placeholder="Escriba un título claro y atractivo"
            onChange={(e) => {
              poner("titulo", e.target.value);
              if (!slugManual) poner("slug", slugify(e.target.value));
            }}
          />
        </label>
        <label className="campo">
          Resumen (sale en las listas y al compartir)
          <textarea name="extracto" rows={2} value={d.extracto} onChange={(e) => poner("extracto", e.target.value)} placeholder="Una o dos frases que inviten a leer" />
        </label>

        <div className="ea-editor">
          <div className="ea-barra" role="toolbar" aria-label="Formato">
            <div className="ea-tabs">
              <button type="button" className={pestana === "escribir" ? "activa" : ""} onClick={() => setPestana("escribir")}>Escribir</button>
              <button type="button" className={pestana === "vista" ? "activa" : ""} onClick={() => setPestana("vista")}>Vista previa</button>
            </div>
            {pestana === "escribir" && (
              <div className="ea-botones">
                <button type="button" onClick={() => lineas("## ")} title="Título grande">H2</button>
                <button type="button" onClick={() => lineas("### ")} title="Subtítulo">H3</button>
                <button type="button" onClick={() => envolver("**")} title="Negrita"><b>B</b></button>
                <button type="button" onClick={() => envolver("*")} title="Cursiva"><i>I</i></button>
                <button type="button" onClick={() => lineas("- ")} title="Lista">• Lista</button>
                <button type="button" onClick={() => lineas((i) => `${i + 1}. `)} title="Lista numerada">1. Lista</button>
                <button type="button" onClick={() => lineas("> ")} title="Cita">❝ Cita</button>
                <button type="button" onClick={() => envolver("[", "](https://)", "texto del enlace")} title="Enlace">🔗 Enlace</button>
                <button type="button" onClick={() => fotos.current?.click()} disabled={subiendo} title="Insertar imagen">{subiendo ? "Subiendo…" : "🖼 Imagen"}</button>
                <button type="button" onClick={() => envolver("\n\n---\n\n", "", "")} title="Línea divisoria">― Línea</button>
                <button type="button" onClick={aNormal} title="Convertir de MAYÚSCULAS a minúsculas normales">Aa Normal</button>
                <input ref={fotos} type="file" hidden accept="image/jpeg,image/png,image/webp,image/gif" onChange={(e) => { const f = e.target.files?.[0]; if (f) void imagen(f); e.target.value = ""; }} />
              </div>
            )}
            <span className="ea-conteo">{palabras} palabras · {tiempoLectura(d.contenido)} min</span>
          </div>
          {pestana === "escribir" ? (
            <textarea ref={area} className="ea-area" value={d.contenido} onChange={(e) => poner("contenido", e.target.value)} placeholder={"Escriba el artículo aquí.\n\nUse ## para los títulos de sección, ** para negrita y las flechas de arriba para listas, enlaces e imágenes."} />
          ) : (
            <div className="sw ea-vista" style={{ minHeight: 0 }}>
              <div className="sw-texto" dangerouslySetInnerHTML={{ __html: html || "<p><em>Aún no hay contenido.</em></p>" }} />
            </div>
          )}
        </div>
      </div>

      <aside className="ea-lateral">
        <section className="ea-caja">
          <h3>Publicación</h3>
          <label className="campo">
            Estado
            <select name="estado" value={d.estado} onChange={(e) => poner("estado", e.target.value)}>
              <option value="borrador">Borrador (no se ve en la web)</option>
              <option value="publicado">Publicado</option>
              <option value="programado">Programado</option>
              <option value="archivado">Archivado</option>
            </select>
          </label>
          {(d.estado === "programado" || d.estado === "publicado") && (
            <label className="campo">
              {d.estado === "programado" ? "Se publica el" : "Fecha de publicación"}
              <input type="datetime-local" name="publicado_en" value={d.publicado_en} onChange={(e) => poner("publicado_en", e.target.value)} />
            </label>
          )}
          <label className="ea-check">
            <input type="checkbox" name="destacado" value="1" checked={d.destacado} onChange={(e) => poner("destacado", e.target.checked)} />
            <span>Destacado: sale grande al inicio del blog</span>
          </label>
          <div className="ea-acciones">
            <BotonConfirmar className="btn primario grande" pregunta="¿Guardar el artículo?" detalle={d.estado === "publicado" ? "Quedará visible para todos en el blog de la web." : "Se guarda tal como está."} textoConfirmar="Sí, guardar">Guardar artículo</BotonConfirmar>
            {urlPublica && d.estado === "publicado" && <a className="btn contorno" href={urlPublica} target="_blank" rel="noreferrer">Ver en la web</a>}
          </div>
        </section>

        <section className="ea-caja">
          <h3>Datos del artículo</h3>
          <label className="campo">
            Categoría
            <select name="categoria_id" value={d.categoria_id} onChange={(e) => poner("categoria_id", e.target.value)}>
              <option value="">Sin categoría</option>
              {categorias.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
            </select>
          </label>
          <label className="campo">
            Etiquetas (separadas por coma)
            <input name="etiquetas" value={d.etiquetas} onChange={(e) => poner("etiquetas", e.target.value)} placeholder="rendición, perené, plazos" />
          </label>
          <label className="campo">
            Autor
            <input name="autor" value={d.autor} onChange={(e) => poner("autor", e.target.value)} placeholder="Richard Pérez" />
          </label>
          <CampoImagenWeb nombre="portada_path" titulo="Imagen de portada" inicial={d.portada_path} ayuda="Mejor horizontal, 1200×630 o más." />
        </section>

        <section className="ea-caja">
          <h3>Google (SEO)</h3>
          <label className="campo">
            Enlace del artículo
            <input name="slug" value={d.slug} onChange={(e) => { setSlugManual(true); poner("slug", slugify(e.target.value)); }} placeholder="como-rendir-a-perene" />
            <span className="pequeno tenue">/blog/{d.slug || "…"}</span>
          </label>
          <label className="campo">
            Título para Google ({d.seo_titulo.length}/60)
            <input name="seo_titulo" value={d.seo_titulo} onChange={(e) => poner("seo_titulo", e.target.value)} placeholder={d.titulo || "Si lo deja vacío se usa el título"} />
          </label>
          <label className="campo">
            Descripción para Google ({d.seo_descripcion.length}/160)
            <textarea name="seo_descripcion" rows={3} value={d.seo_descripcion} onChange={(e) => poner("seo_descripcion", e.target.value)} placeholder="Si la deja vacía se usa el resumen" />
          </label>
          <div className="ea-google">
            <b>{d.seo_titulo || d.titulo || "Título del artículo"}</b>
            <span>/blog/{d.slug || "…"}</span>
            <p>{(d.seo_descripcion || d.extracto || "Aquí saldrá la descripción del artículo.").slice(0, 160)}</p>
          </div>
        </section>
      </aside>
    </form>
  );
}
