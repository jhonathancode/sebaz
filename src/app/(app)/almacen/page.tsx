import Link from "next/link";
import Avisos, { type ParamsAviso } from "@/components/Avisos";
import { contextoMcp, tiene } from "@/lib/contexto";
import { fecha, num3, periodoActual, rangoPeriodo, soles } from "@/lib/formato";
import { supabaseServidor } from "@/lib/supabase/server";

const cant = (n: number | string) => Number(n).toLocaleString("es-PE", { maximumFractionDigits: 3 });

type Stock = {
  bien_id: string;
  codigo: number;
  descripcion: string;
  unidad: string;
  stock_minimo: number;
  activo: boolean;
  entradas: number;
  salidas: number;
  stock: number;
  costo_promedio: number;
  valor: number;
};

export default async function Almacen({ searchParams }: { searchParams: ParamsAviso }) {
  const sp = await searchParams;
  const ctx = await contextoMcp();
  const supabase = await supabaseServidor();
  const ver = sp.ver === "entradas" || sp.ver === "salidas" ? sp.ver : "stock";
  const q = (sp.q ?? "").trim();
  const mes = sp.mes ?? periodoActual();
  const { desde, hasta } = rangoPeriodo(mes);
  const puede = tiene(ctx, "admin", "tesorero", "contador", "alcalde");

  const { data: stockData, error: errStock } = await supabase.from("almacen_stock").select("*").eq("mcp_id", ctx.mcp.id).order("descripcion");
  if (errStock) {
    return (
      <div className="aviso error">
        El almacén aún no está activo en su MCP: falta la actualización de la base de datos (ACTUALIZAR_BASE.sql). Avise a soporte.
      </div>
    );
  }
  const todos = (stockData ?? []) as Stock[];
  const bajoMinimo = todos.filter((b) => b.stock_minimo > 0 && Number(b.stock) <= Number(b.stock_minimo));
  const valorTotal = todos.reduce((s, b) => s + Number(b.valor), 0);
  const conStock = todos.filter((b) => Number(b.stock) > 0).length;

  // ---- Stock con filtros
  const filtro = sp.filtro ?? "todos";
  const stock = todos.filter((b) => {
    if (q && !b.descripcion.includes(q.toUpperCase()) && String(b.codigo) !== q.replace(/^0+/, "")) return false;
    if (filtro === "con" && Number(b.stock) <= 0) return false;
    if (filtro === "sin" && Number(b.stock) > 0) return false;
    if (filtro === "minimo" && !(b.stock_minimo > 0 && Number(b.stock) <= Number(b.stock_minimo))) return false;
    return true;
  });

  // ---- Entradas o salidas del mes
  let movimientos: { id: string; numero: number; anio: number; fecha: string; quien: string; detalle: string; total: number; anulado: boolean; href: string }[] = [];
  if (ver === "entradas") {
    const { data } = await supabase
      .from("notas_entrada")
      .select("id, numero, anio, fecha, origen, proveedor, documento_ref, anulado, nota_entrada_items(total)")
      .eq("mcp_id", ctx.mcp.id)
      .gte("fecha", desde)
      .lte("fecha", hasta)
      .order("numero", { ascending: false });
    movimientos = (data ?? []).map((n) => ({
      id: n.id,
      numero: n.numero,
      anio: n.anio,
      fecha: n.fecha,
      quien: n.proveedor ?? "",
      detalle: [n.origen === "compra" ? "Compra" : n.origen === "donacion" ? "Donación" : "Otro", n.documento_ref].filter(Boolean).join(" · "),
      total: (n.nota_entrada_items as { total: number }[]).reduce((s, i) => s + Number(i.total), 0),
      anulado: n.anulado,
      href: `/almacen/nea/${n.id}`,
    }));
  } else if (ver === "salidas") {
    const { data } = await supabase
      .from("pecosas")
      .select("id, numero, anio, fecha, area_solicitante, solicitante, finalidad, anulado, pecosa_items(total)")
      .eq("mcp_id", ctx.mcp.id)
      .gte("fecha", desde)
      .lte("fecha", hasta)
      .order("numero", { ascending: false });
    movimientos = (data ?? []).map((p) => ({
      id: p.id,
      numero: p.numero,
      anio: p.anio,
      fecha: p.fecha,
      quien: [p.area_solicitante, p.solicitante].filter(Boolean).join(" · "),
      detalle: p.finalidad ?? "",
      total: (p.pecosa_items as { total: number }[]).reduce((s, i) => s + Number(i.total), 0),
      anulado: p.anulado,
      href: `/almacen/pecosa/${p.id}`,
    }));
  }
  if (q && ver !== "stock") {
    const Q = q.toUpperCase();
    movimientos = movimientos.filter((m) => m.quien.toUpperCase().includes(Q) || m.detalle.toUpperCase().includes(Q) || String(m.numero) === q.replace(/^0+/, ""));
  }

  const pestana = (v: string, t: string) => (
    <Link role="tab" aria-selected={ver === v} className={ver === v ? "activo" : undefined} href={`/almacen?ver=${v}`}>
      {t}
    </Link>
  );

  return (
    <>
      <div className="titulo-ventana">
        <h1>Almacén</h1>
        <span className="espacio" />
        {puede && (
          <>
            <Link className="btn" href="/almacen/nea/nueva">+ Entrada (NEA)</Link>
            <Link className="btn primario grande" href="/almacen/pecosa/nueva">Entregar bienes (PECOSA)</Link>
          </>
        )}
      </div>
      <Avisos ok={sp.ok} error={sp.error} />

      <div className="rejilla-3">
        <div className="tarjeta">
          <span className="etiqueta">Bienes con stock</span>
          <span className="valor">{conStock}</span>
          <span className="detalle">de {todos.length} registrados</span>
        </div>
        <div className="tarjeta">
          <span className="etiqueta">Valor del almacén</span>
          <span className="valor">S/ {soles(valorTotal)}</span>
          <span className="detalle">a costo promedio</span>
        </div>
        <Link className="tarjeta" href="/almacen?filtro=minimo">
          <span className="etiqueta">Por reponer</span>
          <span className="valor" style={bajoMinimo.length ? { color: "var(--rojo)" } : undefined}>{bajoMinimo.length}</span>
          <span className="detalle">{bajoMinimo.length ? "bienes en su stock mínimo o menos" : "Ningún bien bajo su mínimo"}</span>
        </Link>
      </div>

      <div className="pestanas" role="tablist" aria-label="Vistas del almacén">
        {pestana("stock", "Stock de bienes")}
        {pestana("entradas", "Entradas (NEA)")}
        {pestana("salidas", "Salidas (PECOSA)")}
      </div>

      <form className="barra" method="get">
        <input type="hidden" name="ver" value={ver} />
        <label className="campo" style={{ flex: "1 1 240px" }}>
          Buscar
          <input name="q" defaultValue={q} placeholder={ver === "stock" ? "Nombre o código del bien" : "Proveedor, área, documento o N°"} />
        </label>
        {ver === "stock" ? (
          <label className="campo">
            Mostrar
            <select name="filtro" defaultValue={filtro}>
              <option value="todos">Todos los bienes</option>
              <option value="con">Solo con stock</option>
              <option value="sin">Sin stock</option>
              <option value="minimo">Por reponer (bajo mínimo)</option>
            </select>
          </label>
        ) : (
          <label className="campo">
            Mes
            <input type="month" name="mes" defaultValue={mes} />
          </label>
        )}
        <button className="btn" type="submit">Filtrar</button>
        <a className="btn contorno" href={`/exportar/almacen?ver=${ver}&q=${encodeURIComponent(q)}&filtro=${filtro}&mes=${mes}`}>Descargar Excel</a>
      </form>

      {ver === "stock" ? (
        <div className="tabla-marco">
          <table className="tabla" style={{ minWidth: 860 }}>
            <thead>
              <tr>
                <th>Código</th>
                <th>Bien</th>
                <th>Unidad</th>
                <th className="num">Entró</th>
                <th className="num">Salió</th>
                <th className="num">Stock</th>
                <th className="num">Costo prom. S/</th>
                <th className="num">Valor S/</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {stock.length === 0 && (
                <tr><td colSpan={9} className="tenue">{todos.length === 0 ? "Aún no hay bienes. Entran con la primera NEA (de una compra con conformidad o una entrada manual)." : "Ningún bien con ese filtro."}</td></tr>
              )}
              {stock.map((b) => {
                const bajo = b.stock_minimo > 0 && Number(b.stock) <= Number(b.stock_minimo);
                return (
                  <tr key={b.bien_id}>
                    <td>{String(b.codigo).padStart(5, "0")}</td>
                    <td className="envolver"><Link href={`/almacen/bien/${b.bien_id}`}>{b.descripcion}</Link></td>
                    <td>{b.unidad}</td>
                    <td className="num">{cant(b.entradas)}</td>
                    <td className="num">{cant(b.salidas)}</td>
                    <td className="num" style={{ fontWeight: 700, color: bajo ? "var(--rojo)" : undefined }}>
                      {cant(b.stock)}
                      {bajo && <span className="estado anulado" style={{ marginLeft: 6 }}>Reponer</span>}
                    </td>
                    <td className="num">{soles(b.costo_promedio)}</td>
                    <td className="num">{soles(b.valor)}</td>
                    <td><Link className="btn chico contorno" href={`/almacen/bien/${b.bien_id}`}>Kardex</Link></td>
                  </tr>
                );
              })}
            </tbody>
            {stock.length > 0 && (
              <tfoot>
                <tr><th colSpan={7}>Valor total</th><th className="num">{soles(stock.reduce((s, b) => s + Number(b.valor), 0))}</th><th /></tr>
              </tfoot>
            )}
          </table>
        </div>
      ) : (
        <div className="tabla-marco">
          <table className="tabla" style={{ minWidth: 820 }}>
            <thead>
              <tr>
                <th>N°</th>
                <th>Fecha</th>
                <th>{ver === "entradas" ? "Proveedor / procedencia" : "Área y persona que recibe"}</th>
                <th>{ver === "entradas" ? "Tipo · documento" : "Para qué"}</th>
                <th className="num">Valor S/</th>
                <th>Estado</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {movimientos.length === 0 && <tr><td colSpan={7} className="tenue">No hay {ver === "entradas" ? "entradas" : "salidas"} en este mes.</td></tr>}
              {movimientos.map((m) => (
                <tr key={m.id} className={m.anulado ? "anulado" : undefined}>
                  <td style={{ fontWeight: 600 }}>{ver === "entradas" ? "NEA" : "PECOSA"} {num3(m.numero)}-{m.anio}</td>
                  <td>{fecha(m.fecha)}</td>
                  <td className="envolver">{m.quien}</td>
                  <td className="envolver">{m.detalle}</td>
                  <td className="num tachar">{soles(m.total)}</td>
                  <td><span className={`estado ${m.anulado ? "anulado" : "aprobado"}`}>{m.anulado ? "Anulado" : "Emitido"}</span></td>
                  <td><Link className="btn chico contorno" href={m.href}>Ver</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
