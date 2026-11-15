import PanelTutoriales from "@/components/PanelTutoriales";
import { contextoMcp } from "@/lib/contexto";
import { tieneModulo, tieneOpcional, type ClaveModulo } from "@/lib/modulos";
import { TUTORIALES } from "@/lib/tutoriales";

/** Guías paso a paso ordenadas por módulo; solo salen las de los módulos que la municipalidad tiene activos. */
export default async function Tutoriales() {
  const ctx = await contextoMcp();
  const visibles = TUTORIALES.filter((m) => {
    if (!m.modulo) return true;
    if (m.modulo === "registro_civil" || m.modulo === "secretaria") return tieneOpcional(ctx.mcp, m.modulo);
    return tieneModulo(ctx.mcp, m.modulo as ClaveModulo);
  });
  return (
    <>
      <div className="titulo-ventana">
        <h1>Tutoriales</h1>
      </div>
      <p className="tenue pequeno" style={{ marginTop: 0 }}>Guías paso a paso por módulo. Elija un módulo o escriba lo que busca.</p>
      <PanelTutoriales modulos={visibles} />
    </>
  );
}
