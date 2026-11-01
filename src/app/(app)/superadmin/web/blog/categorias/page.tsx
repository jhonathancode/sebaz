import Link from "next/link";
import Avisos, { type ParamsAviso } from "@/components/Avisos";
import VentanaFlotante from "@/components/VentanaFlotante";
import { obtenerContexto } from "@/lib/contexto";
import { supabaseServidor } from "@/lib/supabase/server";
import { guardarCategoria } from "../../acciones";

type Cat = { id: string; slug: string; nombre: string; descripcion: string | null; orden: number };

function Campos({ c }: { c?: Cat }) {
  return (
    <div className="rejilla-2">
      {c && <input type="hidden" name="id" value={c.id} />}
      <label className="campo">Nombre<input name="nombre" required defaultValue={c?.nombre ?? ""} /></label>
      <label className="campo">Enlace<input name="slug" defaultValue={c?.slug ?? ""} placeholder="Se arma solo con el nombre" /></label>
      <label className="campo">Orden<input name="orden" inputMode="numeric" defaultValue={String(c?.orden ?? 0)} /></label>
      <label className="campo" style={{ gridColumn: "1 / -1" }}>Descripción (sale en la página de la categoría)<input name="descripcion" defaultValue={c?.descripcion ?? ""} /></label>
    </div>
  );
}

export default async function Categorias({ searchParams }: { searchParams: ParamsAviso }) {
  const sp = await searchParams;
  const ctx = await obtenerContexto();
  if (!ctx.esSuperadmin) return <div className="aviso error">Esta pantalla es solo para el dueño del sistema.</div>;
  const supabase = await supabaseServidor();
  const [{ data: cats }, { data: arts }] = await Promise.all([supabase.from("blog_categorias").select("*").order("orden"), supabase.from("blog_articulos").select("categoria_id")]);
  return (
    <>
      <div className="cab-vista">
        <div><h1>Categorías del blog</h1><div className="sub">Los temas con los que se ordenan los artículos</div></div>
        <span className="espacio" />
        <Link className="btn contorno" href="/superadmin/web/blog">← Volver al blog</Link>
        <VentanaFlotante boton="+ Nueva categoría" titulo="Nueva categoría" accion={guardarCategoria} textoGuardar="Guardar" claseBoton="btn primario grande"><Campos /></VentanaFlotante>
      </div>
      <Avisos ok={sp.ok} error={sp.error} />
      <div className="wl-lista">
        {((cats ?? []) as Cat[]).map((c) => (
          <div key={c.id} className="wl-fila" style={{ gridTemplateColumns: "minmax(0, 1fr) auto auto" }}>
            <div className="wl-titulo"><b>{c.nombre}</b><small>/blog/categoria/{c.slug} · {c.descripcion ?? "sin descripción"}</small></div>
            <span className="wl-estado">{(arts ?? []).filter((a) => a.categoria_id === c.id).length} artículo(s)</span>
            <VentanaFlotante boton="Editar" titulo={`Editar · ${c.nombre}`} accion={guardarCategoria} textoGuardar="Guardar cambios" claseBoton="btn chico contorno"><Campos c={c} /></VentanaFlotante>
          </div>
        ))}
      </div>
    </>
  );
}
