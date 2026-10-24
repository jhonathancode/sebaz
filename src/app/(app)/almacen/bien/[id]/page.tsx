import Link from "next/link";
import { notFound } from "next/navigation";
import Avisos, { type ParamsAviso } from "@/components/Avisos";
import BotonConfirmar from "@/components/BotonConfirmar";
import { contextoMcp, tiene } from "@/lib/contexto";
import { fecha, num3, soles } from "@/lib/formato";
import { supabaseServidor } from "@/lib/supabase/server";
import { guardarStockMinimo } from "../../acciones";

const cant = (n: number) => Number(n).toLocaleString("es-PE", { maximumFractionDigits: 3 });

/** Kardex: todas las entradas y salidas de un bien, con su saldo. */
export default async function Kardex({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: ParamsAviso }) {
  const { id } = await params;
  const sp = await searchParams;
  const ctx = await contextoMcp();
  const supabase = await supabaseServidor();
  const [{ data: b }, { data: ent }, { data: sal }] = await Promise.all([
    supabase.from("almacen_stock").select("*").eq("bien_id", id).single(),
    supabase.from("nota_entrada_items").select("cantidad, precio_unitario, total, notas_entrada!inner(id, numero, anio, fecha, proveedor, anulado, creado_en)").eq("bien_id", id),
    supabase.from("pecosa_items").select("cantidad, precio_unitario, total, pecosas!inner(id, numero, anio, fecha, area_solicitante, anulado, creado_en)").eq("bien_id", id),
  ]);
  if (!b) notFound();

  type Mov = { fecha: string; en: string; doc: string; href: string; detalle: string; entra: number; sale: number; precio: number; total: number; anulado: boolean };
  const movs: Mov[] = [
    ...(ent ?? []).map((m) => {
      const n = m.notas_entrada as unknown as { id: string; numero: number; anio: number; fecha: string; proveedor: string | null; anulado: boolean; creado_en: string };
      return { fecha: n.fecha, en: n.creado_en, doc: `NEA ${num3(n.numero)}-${n.anio}`, href: `/almacen/nea/${n.id}`, detalle: n.proveedor ?? "", entra: Number(m.cantidad), sale: 0, precio: Number(m.precio_unitario), total: Number(m.total), anulado: n.anulado };
    }),
    ...(sal ?? []).map((m) => {
      const p = m.pecosas as unknown as { id: string; numero: number; anio: number; fecha: string; area_solicitante: string; anulado: boolean; creado_en: string };
      return { fecha: p.fecha, en: p.creado_en, doc: `PECOSA ${num3(p.numero)}-${p.anio}`, href: `/almacen/pecosa/${p.id}`, detalle: p.area_solicitante, entra: 0, sale: Number(m.cantidad), precio: Number(m.precio_unitario), total: Number(m.total), anulado: p.anulado };
    }),
  ].sort((x, y) => x.fecha.localeCompare(y.fecha) || x.en.localeCompare(y.en));

  let saldo = 0;
  const filas = movs.map((m) => {
    if (!m.anulado) saldo += m.entra - m.sale;
    return { ...m, saldo };
  });

  return (
    <>
      <div className="titulo-ventana">
        <Link className="btn" href="/almacen">← Almacén</Link>
        <h1>Kardex · {b.descripcion}</h1>
        <span className="espacio" />
        <a className="btn contorno" href={`/exportar/kardex?bien=${id}`}>Descargar Excel</a>
      </div>
      <Avisos ok={sp.ok} error={sp.error} />

      <div className="rejilla-3">
        <div className="tarjeta"><span className="etiqueta">Código · unidad</span><span className="valor">{String(b.codigo).padStart(5, "0")}</span><span className="detalle">{b.unidad}</span></div>
        <div className="tarjeta"><span className="etiqueta">Stock actual</span><span className="valor">{cant(b.stock)}</span><span className="detalle">Entró {cant(b.entradas)} · salió {cant(b.salidas)}</span></div>
        <div className="tarjeta"><span className="etiqueta">Valor</span><span className="valor">S/ {soles(b.valor)}</span><span className="detalle">Costo promedio S/ {soles(b.costo_promedio)}</span></div>
      </div>

      {tiene(ctx, "admin", "tesorero", "contador", "alcalde") && (
        <form action={guardarStockMinimo} className="barra">
          <input type="hidden" name="bien_id" value={id} />
          <label className="campo">
            Avisar cuando quede (stock mínimo)
            <input type="number" name="stock_minimo" min="0" step="0.001" defaultValue={Number(b.stock_minimo)} />
          </label>
          <BotonConfirmar className="btn" pregunta="¿Guardar el stock mínimo?" detalle="Inicio y el almacén avisarán cuando el stock llegue a esta cantidad." textoConfirmar="Sí, guardar">Guardar</BotonConfirmar>
        </form>
      )}

      <div className="tabla-marco">
        <table className="tabla" style={{ minWidth: 860 }}>
          <thead>
            <tr>
              <th>Fecha</th>
              <th>Documento</th>
              <th>Proveedor / área</th>
              <th className="num">Entra</th>
              <th className="num">Sale</th>
              <th className="num">Saldo</th>
              <th className="num">Precio S/</th>
              <th className="num">Importe S/</th>
            </tr>
          </thead>
          <tbody>
            {filas.length === 0 && <tr><td colSpan={8} className="tenue">Sin movimientos.</td></tr>}
            {filas.map((m, i) => (
              <tr key={i} className={m.anulado ? "anulado" : undefined}>
                <td>{fecha(m.fecha)}</td>
                <td><Link href={m.href}>{m.doc}</Link>{m.anulado && " (anulado)"}</td>
                <td className="envolver">{m.detalle}</td>
                <td className="num tachar">{m.entra ? cant(m.entra) : ""}</td>
                <td className="num tachar">{m.sale ? cant(m.sale) : ""}</td>
                <td className="num" style={{ fontWeight: 700 }}>{cant(m.saldo)}</td>
                <td className="num">{soles(m.precio)}</td>
                <td className="num tachar">{soles(m.total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
