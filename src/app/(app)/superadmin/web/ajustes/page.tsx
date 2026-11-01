import Link from "next/link";
import Avisos, { type ParamsAviso } from "@/components/Avisos";
import BotonConfirmar from "@/components/BotonConfirmar";
import CampoImagenWeb from "@/components/CampoImagenWeb";
import { obtenerContexto } from "@/lib/contexto";
import type { Ajustes } from "@/lib/sitio/datos";
import { supabaseServidor } from "@/lib/supabase/server";
import { guardarAjustes } from "../acciones";

const aLineas = (l: { texto: string; href: string }[] | null | undefined) => (l ?? []).map((x) => `${x.texto} | ${x.href}`).join("\n");

export default async function AjustesWeb({ searchParams }: { searchParams: ParamsAviso }) {
  const sp = await searchParams;
  const ctx = await obtenerContexto();
  if (!ctx.esSuperadmin) return <div className="aviso error">Esta pantalla es solo para el dueño del sistema.</div>;
  const supabase = await supabaseServidor();
  const { data } = await supabase.from("web_ajustes").select("*").eq("id", 1).maybeSingle();
  const a = (data ?? {}) as Partial<Ajustes>;
  const redes = (a.redes ?? {}) as Record<string, string>;
  return (
    <>
      <div className="cab-vista">
        <div><h1>Menú, contacto y SEO</h1><div className="sub">Lo que se ve en todas las páginas de la web</div></div>
        <span className="espacio" />
        <Link className="btn contorno" href="/superadmin/web">← Sitio web</Link>
      </div>
      <Avisos ok={sp.ok} error={sp.error} />
      <form action={guardarAjustes} className="cfg-dos-iguales">
        <section className="panel cfg-panel">
          <div className="panel-cab">Marca y menú</div>
          <div className="panel-cuerpo">
            <label className="campo">Nombre del sitio<input name="nombre_sitio" defaultValue={a.nombre_sitio ?? "Sebaz"} required /></label>
            <label className="campo">Eslogan (título grande del inicio)<input name="eslogan" defaultValue={a.eslogan ?? ""} /></label>
            <label className="campo">Dominio de la web<input name="dominio" defaultValue={a.dominio ?? ""} placeholder="https://sebaz.pe" /></label>
            <CampoImagenWeb nombre="logo_path" titulo="Logo (opcional)" inicial={a.logo_path} carpeta="ajustes" ayuda="Si no sube logo se usa el nombre con un sello." />
            <label className="campo">
              Menú (una opción por línea: texto | enlace)
              <textarea name="menu" rows={6} defaultValue={aLineas(a.menu)} placeholder={"Inicio | /\nBlog | /blog\nContacto | /contacto"} />
            </label>
            <div className="rejilla-2">
              <label className="campo">Botón del menú: texto<input name="boton_menu_texto" defaultValue={a.boton_menu_texto ?? ""} /></label>
              <label className="campo">Botón: enlace<input name="boton_menu_enlace" defaultValue={a.boton_menu_enlace ?? "/login"} /></label>
            </div>
          </div>
        </section>

        <section className="panel cfg-panel">
          <div className="panel-cab">Contacto y redes</div>
          <div className="panel-cuerpo">
            <div className="rejilla-2">
              <label className="campo">WhatsApp (con código de país)<input name="whatsapp" defaultValue={a.whatsapp ?? ""} placeholder="51999999999" inputMode="tel" /></label>
              <label className="campo">Mensaje inicial del WhatsApp<input name="whatsapp_mensaje" defaultValue={a.whatsapp_mensaje ?? ""} placeholder="Hola, quiero información de Sebaz" /></label>
              <label className="campo">Correo<input type="email" name="correo" defaultValue={a.correo ?? ""} /></label>
              <label className="campo">Teléfono<input name="telefono" defaultValue={a.telefono ?? ""} /></label>
            </div>
            <label className="campo">Dirección<input name="direccion" defaultValue={a.direccion ?? ""} placeholder="La Merced, Chanchamayo, Junín" /></label>
            <div className="rejilla-2">
              {["facebook", "instagram", "tiktok", "youtube", "linkedin", "x"].map((r) => (
                <label key={r} className="campo" style={{ textTransform: "capitalize" }}>{r}<input name={`red_${r}`} defaultValue={redes[r] ?? ""} placeholder="https://…" style={{ textTransform: "none" }} /></label>
              ))}
            </div>
          </div>
        </section>

        <section className="panel cfg-panel">
          <div className="panel-cab">Pie de página</div>
          <div className="panel-cuerpo">
            <label className="campo">Texto del pie<textarea name="pie_texto" rows={3} defaultValue={a.pie_texto ?? ""} /></label>
            <label className="campo">
              Enlaces del pie (texto | enlace; si lo deja vacío se usa el menú)
              <textarea name="pie_enlaces" rows={5} defaultValue={aLineas(a.pie_enlaces)} />
            </label>
          </div>
        </section>

        <section className="panel cfg-panel">
          <div className="panel-cab">Google (SEO) y estadísticas</div>
          <div className="panel-cuerpo">
            <label className="campo">Título de la web en Google<input name="seo_titulo" defaultValue={a.seo_titulo ?? ""} placeholder="Sebaz · Sistema de control para municipalidades" /></label>
            <label className="campo">Descripción en Google<textarea name="seo_descripcion" rows={3} defaultValue={a.seo_descripcion ?? ""} /></label>
            <CampoImagenWeb nombre="og_imagen" titulo="Imagen al compartir en redes (1200×630)" inicial={a.og_imagen} carpeta="ajustes" />
            <div className="rejilla-2">
              <label className="campo">Google Analytics (G-XXXXXXX)<input name="ga_id" defaultValue={a.ga_id ?? ""} placeholder="G-ABC123XYZ" /></label>
              <label className="campo">Google Search Console (código de verificación)<input name="search_console" defaultValue={a.search_console ?? ""} /></label>
            </div>
            <p className="pequeno tenue" style={{ margin: 0 }}>El mapa del sitio y el RSS se generan solos: /sitemap.xml y /rss.xml.</p>
          </div>
        </section>

        <div className="cfg-pie" style={{ gridColumn: "1 / -1" }}>
          <BotonConfirmar className="btn primario grande" pregunta="¿Guardar los ajustes de la web?" detalle="Se actualizan el menú, el contacto y el pie de todas las páginas." textoConfirmar="Sí, guardar">Guardar ajustes</BotonConfirmar>
        </div>
      </form>
    </>
  );
}
