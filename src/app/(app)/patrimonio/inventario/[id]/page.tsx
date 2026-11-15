import Link from "next/link";
import { notFound } from "next/navigation";
import Avisos, { type ParamsAviso } from "@/components/Avisos";
import BotonConfirmar from "@/components/BotonConfirmar";
import BotonImprimir from "@/components/BotonImprimir";
import BotonPdf from "@/components/BotonPdf";
import Encabezado from "@/components/Encabezado";
import Firmas from "@/components/Firmas";
import Motivo from "@/components/Motivo";
import { contextoMcp, tiene } from "@/lib/contexto";
import { fecha, soles } from "@/lib/formato";
import { supabaseServidor } from "@/lib/supabase/server";
import { anularInventario, cerrarInventario, registrarResultado } from "../../acciones";

type Item = { id: string; resultado: string; estado_conservacion: string | null; observacion: string | null; bienes_patrimonio: { codigo: string | null; descripcion: string; marca: string | null; serie: string | null; ubicacion: string | null; responsable: string | null; valor: number } };

export default async function Inventario({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: ParamsAviso & { ver?: string } }) {
  const { id } = await params;
  const sp = await searchParams;
  const ctx = await contextoMcp();
  const supabase = await supabaseServidor();
  const { data: inv } = await supabase.from("inventarios_patrimonio").select("*").eq("id", id).single();
  if (!inv) notFound();
  const { data } = await supabase.from("inventario_patrimonio_items").select("id, resultado, estado_conservacion, observacion, bienes_patrimonio(codigo, descripcion, marca, serie, ubicacion, responsable, valor)").eq("inventario_id", id);
  const items = ((data ?? []) as unknown as Item[]).sort((a, b) => (a.bienes_patrimonio.ubicacion ?? "").localeCompare(b.bienes_patrimonio.ubicacion ?? "") || a.bienes_patrimonio.descripcion.localeCompare(b.bienes_patrimonio.descripcion));
  const puede = tiene(ctx, "admin", "tesorero");
  const enCurso = inv.estado === "en_curso";
  const cuenta = (r: string) => items.filter((i) => i.resultado === r).length;
  const valorEncontrado = items.filter((i) => i.resultado === "encontrado").reduce((s, i) => s + Number(i.bienes_patrimonio.valor), 0);
  const valorFaltante = items.filter((i) => i.resultado === "no_encontrado").reduce((s, i) => s + Number(i.bienes_patrimonio.valor), 0);
  const valorPatrimonial = valorEncontrado + valorFaltante;
  const saldo = inv.saldo_contable == null ? null : Number(inv.saldo_contable);
  const dif = saldo == null ? null : Math.round((valorPatrimonial - saldo) * 100) / 100;
  const comision = (inv.comision ?? []) as { nombre: string; cargo: string }[];
  const pendientes = items.filter((i) => i.resultado === "pendiente");
  const lista = enCurso ? items : items;
  const ver = sp.ver === "acta" ? "acta" : "informe";

  return (
    <>
      <div className="titulo-ventana no-imprimir">
        <Link className="btn" href="/patrimonio?vista=inventario">← Volver a patrimonio</Link>
        <span className="espacio" />
        {!enCurso && <Link className={`btn ${ver === "informe" ? "primario" : "contorno"}`} href={`/patrimonio/inventario/${id}`}>Informe final</Link>}
        {!enCurso && <Link className={`btn ${ver === "acta" ? "primario" : "contorno"}`} href={`/patrimonio/inventario/${id}?ver=acta`}>Acta de conciliación</Link>}
        {!enCurso && <BotonPdf nombre={`${ver === "acta" ? "Acta de conciliacion" : "Informe final de inventario"} ${inv.anio}`} />}
        {!enCurso && <BotonImprimir />}
        {enCurso && puede && <Motivo chico accion={anularInventario} boton="Anular inventario" ayuda="Motivo" campos={{ id }} />}
      </div>
      <Avisos ok={sp.ok} error={sp.error} />

      {enCurso && (
        <>
          <div className="ing-franja">
            <span><small>Por verificar</small><b>{cuenta("pendiente")}</b></span>
            <span><small>Encontrados</small><b>{cuenta("encontrado")}</b></span>
            <span><small>No encontrados</small><b>{cuenta("no_encontrado")}</b></span>
            <span><small>Inventario</small><b>{inv.anio}</b></span>
          </div>
          <div className="cc-excel-marco">
            <table className="cc-excel">
              <thead><tr><th>Ubicación</th><th>Bien</th><th>Código / serie</th><th>Responsable</th><th>Resultado</th></tr></thead>
              <tbody>
                {items.length === 0 && <tr><td colSpan={5} className="cc-vacio">No hay bienes activos para inventariar. Registre los bienes primero.</td></tr>}
                {lista.map((i) => (
                  <tr key={i.id}>
                    <td>{i.bienes_patrimonio.ubicacion ?? "—"}</td>
                    <td><b>{i.bienes_patrimonio.descripcion}</b>{i.bienes_patrimonio.marca ? <span className="tenue pequeno"> · {i.bienes_patrimonio.marca}</span> : null}</td>
                    <td className="pequeno">{[i.bienes_patrimonio.codigo, i.bienes_patrimonio.serie].filter(Boolean).join(" · ") || "—"}</td>
                    <td>{i.bienes_patrimonio.responsable ?? "—"}</td>
                    <td>
                      {puede ? (
                        <form action={registrarResultado} style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                          <input type="hidden" name="id" value={i.id} />
                          <input type="hidden" name="inventario_id" value={id} />
                          <select name="resultado" defaultValue={i.resultado} aria-label="Resultado">
                            <option value="pendiente">Por verificar</option><option value="encontrado">Encontrado</option><option value="no_encontrado">No encontrado</option>
                          </select>
                          <select name="estado_conservacion" defaultValue={i.estado_conservacion ?? "bueno"} aria-label="Estado"><option value="bueno">Bueno</option><option value="regular">Regular</option><option value="malo">Malo</option></select>
                          <input name="observacion" defaultValue={i.observacion ?? ""} placeholder="Observación" style={{ textTransform: "uppercase", minWidth: 120 }} />
                          <button className="btn chico contorno">Guardar</button>
                        </form>
                      ) : i.resultado}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {puede && (
            <section className="panel">
              <div className="panel-cab">Cerrar el inventario</div>
              <div className="panel-cuerpo">
                <form action={cerrarInventario} style={{ display: "grid", gap: 10 }}>
                  <input type="hidden" name="id" value={id} />
                  <div className="rejilla-2">
                    <label className="campo">Saldo contable de bienes muebles S/ (de Contabilidad)<input name="saldo_contable" inputMode="decimal" placeholder="Para el acta de conciliación" /></label>
                    <label className="campo ancho">Conclusiones del informe<input name="informe" placeholder="Se verificó la existencia y el estado de los bienes…" /></label>
                  </div>
                  <BotonConfirmar className="btn primario grande" disabled={pendientes.length > 0} pregunta="¿Cerrar el inventario?" detalle="Cerrado, ya no se cambian los resultados. Se generan el informe final y el acta de conciliación." textoConfirmar="Sí, cerrar inventario">
                    {pendientes.length ? `Faltan ${pendientes.length} por verificar` : "Cerrar inventario"}
                  </BotonConfirmar>
                </form>
              </div>
            </section>
          )}
        </>
      )}

      {!enCurso && ver === "informe" && (
        <div className="hoja">
          <Encabezado mcp={ctx.mcp} titulo="INFORME FINAL DE INVENTARIO DE BIENES MUEBLES" numero={`AÑO ${inv.anio}`} />
          <table className="formato">
            <tbody>
              <tr><th style={{ width: 220 }}>Fecha de cierre del inventario</th><td>{fecha(inv.fecha_cierre)}</td></tr>
              <tr><th>Resolución de la comisión</th><td>{inv.resolucion ?? "—"}</td></tr>
              <tr><th>Bienes verificados</th><td>{items.length} · encontrados {cuenta("encontrado")} · no encontrados {cuenta("no_encontrado")}</td></tr>
              <tr><th>Valor de lo encontrado</th><td>S/ {soles(valorEncontrado)}</td></tr>
              <tr><th>Valor de lo no encontrado</th><td>S/ {soles(valorFaltante)}</td></tr>
            </tbody>
          </table>
          <p className="pequeno" style={{ margin: "10px 0 4px" }}><b>Comisión de inventario</b></p>
          <table className="formato"><tbody>{comision.map((c, n) => <tr key={n}><td>{c.nombre}</td><td>{c.cargo}</td></tr>)}</tbody></table>
          <p className="pequeno" style={{ margin: "10px 0 4px" }}><b>Relación de bienes</b></p>
          <table className="formato">
            <thead><tr><th>N°</th><th>Código</th><th>Descripción</th><th>Serie</th><th>Ubicación</th><th>Resultado</th><th>Estado</th><th className="num">Valor</th></tr></thead>
            <tbody>
              {items.map((i, n) => (
                <tr key={i.id}><td>{n + 1}</td><td>{i.bienes_patrimonio.codigo ?? ""}</td><td>{i.bienes_patrimonio.descripcion}</td><td>{i.bienes_patrimonio.serie ?? ""}</td><td>{i.bienes_patrimonio.ubicacion ?? ""}</td><td>{i.resultado === "encontrado" ? "ENCONTRADO" : "NO ENCONTRADO"}</td><td>{i.estado_conservacion?.toUpperCase() ?? ""}{i.observacion ? ` · ${i.observacion}` : ""}</td><td className="num">{soles(i.bienes_patrimonio.valor)}</td></tr>
              ))}
              <tr><th colSpan={7}>TOTAL</th><th className="num">{soles(valorPatrimonial)}</th></tr>
            </tbody>
          </table>
          {inv.informe && <p className="pequeno" style={{ marginTop: 10 }}><b>Conclusiones:</b> {inv.informe}</p>}
          <Firmas nombres={comision.map((c) => c.nombre)} />
        </div>
      )}

      {!enCurso && ver === "acta" && (
        <div className="hoja">
          <Encabezado mcp={ctx.mcp} titulo="ACTA DE CONCILIACIÓN PATRIMONIO–CONTABLE" numero={`AÑO ${inv.anio}`} />
          <p className="pequeno">Reunidos los integrantes de la comisión de inventario designada mediante {inv.resolucion ?? "resolución"}, se compararon los registros patrimoniales con los contables al {fecha(inv.fecha_cierre)}, con el siguiente resultado:</p>
          <table className="formato">
            <tbody>
              <tr><td>Valor según el registro patrimonial (inventario)</td><td className="num">{soles(valorPatrimonial)}</td></tr>
              <tr><td>Saldo según contabilidad</td><td className="num">{saldo == null ? "—" : soles(saldo)}</td></tr>
              <tr><th>{dif == null ? "DIFERENCIA" : dif === 0 ? "RESULTADO: SIN DIFERENCIAS" : dif > 0 ? "DIFERENCIA (patrimonio mayor)" : "DIFERENCIA (contabilidad mayor)"}</th><th className="num">{dif == null ? "—" : soles(Math.abs(dif))}</th></tr>
            </tbody>
          </table>
          {dif != null && dif !== 0 && <p className="pequeno" style={{ marginTop: 10 }}>Se deja constancia de la diferencia para su saneamiento contable durante el año fiscal.</p>}
          <Firmas nombres={[...comision.map((c) => c.nombre), "CONTADOR(A)"]} />
        </div>
      )}
    </>
  );
}
