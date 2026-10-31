import Link from "next/link";
import { notFound } from "next/navigation";
import Avisos, { type ParamsAviso } from "@/components/Avisos";
import EditorArticulo from "@/components/EditorArticulo";
import { obtenerContexto } from "@/lib/contexto";
import { supabaseServidor } from "@/lib/supabase/server";
import { guardarArticulo } from "../../acciones";

/** Fecha guardada (UTC) → «yyyy-MM-ddTHH:mm» en hora de Lima, para el campo de fecha y hora. */
const aLima = (iso: string | null) => {
  if (!iso) return "";
  const d = new Date(new Date(iso).getTime() - 5 * 3600 * 1000);
  return d.toISOString().slice(0, 16);
};

export default async function EditarArticulo({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: ParamsAviso }) {
  const { id } = await params;
  const sp = await searchParams;
  const ctx = await obtenerContexto();
  if (!ctx.esSuperadmin) return <div className="aviso error">Esta pantalla es solo para el dueño del sistema.</div>;
  const supabase = await supabaseServidor();
  const [{ data: a }, { data: cats }] = await Promise.all([supabase.from("blog_articulos").select("*").eq("id", id).maybeSingle(), supabase.from("blog_categorias").select("id, nombre").order("orden")]);
  if (!a) notFound();
  return (
    <>
      <div className="cab-vista">
        <div><h1>Editar artículo</h1><div className="sub">/blog/{a.slug}</div></div>
        <span className="espacio" />
        <Link className="btn contorno" href="/superadmin/web/blog">← Volver al blog</Link>
      </div>
      <Avisos ok={sp.ok} error={sp.error} />
      <EditorArticulo
        categorias={cats ?? []}
        guardar={guardarArticulo}
        urlPublica={`/sitio/blog/${a.slug}`}
        inicial={{
          id: a.id,
          titulo: a.titulo,
          slug: a.slug,
          extracto: a.extracto ?? "",
          contenido: a.contenido ?? "",
          portada_path: a.portada_path ?? "",
          categoria_id: a.categoria_id ?? "",
          etiquetas: (a.etiquetas ?? []).join(", "),
          autor: a.autor ?? "",
          estado: a.estado,
          publicado_en: aLima(a.publicado_en),
          destacado: !!a.destacado,
          seo_titulo: a.seo_titulo ?? "",
          seo_descripcion: a.seo_descripcion ?? "",
        }}
      />
    </>
  );
}
