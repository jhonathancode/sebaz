import Link from "next/link";
import Avisos, { type ParamsAviso } from "@/components/Avisos";
import EditorArticulo from "@/components/EditorArticulo";
import { obtenerContexto } from "@/lib/contexto";
import { supabaseServidor } from "@/lib/supabase/server";
import { guardarArticulo } from "../../acciones";

export default async function NuevoArticulo({ searchParams }: { searchParams: ParamsAviso }) {
  const sp = await searchParams;
  const ctx = await obtenerContexto();
  if (!ctx.esSuperadmin) return <div className="aviso error">Esta pantalla es solo para el dueño del sistema.</div>;
  const supabase = await supabaseServidor();
  const { data: cats } = await supabase.from("blog_categorias").select("id, nombre").order("orden");
  return (
    <>
      <div className="cab-vista">
        <div><h1>Nuevo artículo</h1><div className="sub">Se guarda como borrador hasta que lo publique</div></div>
        <span className="espacio" />
        <Link className="btn contorno" href="/superadmin/web/blog">← Volver al blog</Link>
      </div>
      <Avisos ok={sp.ok} error={sp.error} />
      <EditorArticulo
        categorias={cats ?? []}
        guardar={guardarArticulo}
        inicial={{ titulo: "", slug: "", extracto: "", contenido: "", portada_path: "", categoria_id: "", etiquetas: "", autor: ctx.nombre ?? "", estado: "borrador", publicado_en: "", destacado: false, seo_titulo: "", seo_descripcion: "" }}
      />
    </>
  );
}
