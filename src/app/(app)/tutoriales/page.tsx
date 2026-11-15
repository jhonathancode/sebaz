import PanelTutoriales from "@/components/PanelTutoriales";
import { contextoMcp } from "@/lib/contexto";
import { tieneModulo, tieneOpcional, type ClaveModulo } from "@/lib/modulos";
import { cargarTutoriales, MODULOS_TUT } from "@/lib/tutorialesDb";
import { supabaseServidor } from "@/lib/supabase/server";

/** Guías paso a paso ordenadas por módulo; solo salen las de los módulos que la municipalidad tiene activos. */
export default async function Tutoriales({ searchParams }: { searchParams: Promise<{ modulo?: string }> }) {
  const sp = await searchParams;
  const ctx = await contextoMcp();
  const supabase = await supabaseServidor();
  const { filas } = await cargarTutoriales(supabase);
  const modulos = MODULOS_TUT.filter((m) => {
    if (!m.modulo) return true;
    if (m.modulo === "registro_civil" || m.modulo === "secretaria") return tieneOpcional(ctx.mcp, m.modulo);
    return tieneModulo(ctx.mcp, m.modulo as ClaveModulo);
  })
    .map((m) => ({ ...m, tutoriales: filas.filter((f) => f.modulo === m.clave).map((f) => ({ slug: f.slug, titulo: f.titulo, pasos: f.pasos.length, video: !!f.video_url, texto: `${f.pasos.join(" ")} ${f.consejo ?? ""}` })) }))
    .filter((m) => m.tutoriales.length > 0);
  return (
    <>
      <div className="titulo-ventana">
        <h1>Tutoriales</h1>
      </div>
      <p className="tenue pequeno" style={{ marginTop: 0 }}>Guías paso a paso con video, por módulo. Elija un módulo o escriba lo que busca.</p>
      <PanelTutoriales modulos={modulos} inicial={sp.modulo} />
    </>
  );
}
