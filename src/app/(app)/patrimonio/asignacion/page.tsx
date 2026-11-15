import Link from "next/link";
import BotonImprimir from "@/components/BotonImprimir";
import BotonPdf from "@/components/BotonPdf";
import Encabezado from "@/components/Encabezado";
import Firmas from "@/components/Firmas";
import { contextoMcp } from "@/lib/contexto";
import { fecha, soles } from "@/lib/formato";
import { supabaseServidor } from "@/lib/supabase/server";

/** Hoja de asignación en uso: los bienes a cargo de cada responsable, para su firma. */
export default async function Asignacion({ searchParams }: { searchParams: Promise<{ persona?: string }> }) {
  const sp = await searchParams;
  const ctx = await contextoMcp();
  const supabase = await supabaseServidor();
  const { data } = await supabase.from("bienes_patrimonio").select("codigo, descripcion, marca, modelo, serie, estado_conservacion, ubicacion, responsable, valor").eq("mcp_id", ctx.mcp.id).eq("estado", "activo").not("responsable", "is", null).order("descripcion");
  const porPersona = new Map<string, NonNullable<typeof data>>();
  (data ?? []).forEach((b) => porPersona.set(b.responsable as string, [...(porPersona.get(b.responsable as string) ?? []), b]));
  const personas = [...porPersona.keys()].sort();
  const elegidas = sp.persona ? personas.filter((p) => p === sp.persona) : personas;
  return (
    <>
      <div className="titulo-ventana no-imprimir">
        <Link className="btn" href="/patrimonio">← Volver a patrimonio</Link>
        <span className="espacio" />
        <form method="get" style={{ display: "flex", gap: 8 }}>
          <select name="persona" defaultValue={sp.persona ?? ""}><option value="">Todos los responsables</option>{personas.map((p) => <option key={p} value={p}>{p}</option>)}</select>
          <button className="btn contorno">Ver</button>
        </form>
        <BotonPdf nombre="Hojas de asignacion en uso" />
        <BotonImprimir />
      </div>
      <div className="hoja">
        {elegidas.length === 0 && <p className="tenue">No hay bienes con responsable asignado.</p>}
        {elegidas.map((p, n) => {
          const bs = porPersona.get(p)!;
          return (
            <section key={p} style={n ? { pageBreakBefore: "always", marginTop: 40 } : undefined}>
              <Encabezado mcp={ctx.mcp} titulo="HOJA DE ASIGNACIÓN EN USO DE BIENES" numero={fecha(new Date().toISOString().slice(0, 10))} />
              <p style={{ margin: "10px 0" }}>Recibí en uso, bajo mi responsabilidad, los siguientes bienes de la municipalidad: <b>{p}</b></p>
              <table className="formato">
                <thead><tr><th>N°</th><th>Código</th><th>Descripción</th><th>Marca / modelo / serie</th><th>Estado</th><th>Ubicación</th><th className="num">Valor</th></tr></thead>
                <tbody>
                  {bs.map((b, i) => (
                    <tr key={i}><td>{i + 1}</td><td>{b.codigo ?? ""}</td><td>{b.descripcion}</td><td>{[b.marca, b.modelo, b.serie].filter(Boolean).join(" · ")}</td><td>{String(b.estado_conservacion).toUpperCase()}</td><td>{b.ubicacion ?? ""}</td><td className="num">{soles(b.valor)}</td></tr>
                  ))}
                  <tr><th colSpan={6}>TOTAL</th><th className="num">{soles(bs.reduce((s, b) => s + Number(b.valor), 0))}</th></tr>
                </tbody>
              </table>
              <Firmas nombres={[p, "TESORERO", "ALCALDE"]} />
            </section>
          );
        })}
      </div>
    </>
  );
}
