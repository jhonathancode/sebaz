import Link from "next/link";
import Estado from "@/components/Estado";
import { contextoMcp } from "@/lib/contexto";
import { cargarCierres, estadoGestion } from "@/lib/gestion";
import { codigoCP, fecha, hoyISO, nombrePeriodo, num3, soles } from "@/lib/formato";
import { supabaseServidor } from "@/lib/supabase/server";

const ORDEN_FASES = ["requerimiento", "cotizacion", "orden", "conformidad", "comprobante"];
const DOC_DE_FASE: Record<string, { clave: string; corto: string }> = {
  requerimiento: { clave: "requerimiento", corto: "Requerimiento" },
  cotizacion: { clave: "cotizaciones", corto: "Cotizaciones" },
  orden: { clave: "orden", corto: "Orden" },
  conformidad: { clave: "conformidad", corto: "Conformidad" },
  comprobante: { clave: "comprobante", corto: "Comprobante" },
};
const TIPOS: Record<string, string> = { compra: "Compra de bienes", servicio: "Servicio externo", pago_fijo: "Pago fijo", caja_chica: "Caja chica" };

type Lin = { cargo?: number | null; enlace?: { tipo?: string; id?: string; extra?: { id: string }[] } | null };
const r2 = (n: number) => Math.round(n * 100) / 100;

/** Los últimos 5 expedientes con el mismo formato de la lista de Expedientes (documentos, cheque, conciliado, caja chica). */
export default async function UltimosExpedientes() {
  const ctx = await contextoMcp();
  const supabase = await supabaseServidor();
  const { data: lista } = await supabase
    .from("expedientes")
    .select("id, anio, numero, fecha, tipo, descripcion, area_usuaria, fase, estado, flujo_completo, expediente_items(total, anulado)")
    .eq("mcp_id", ctx.mcp.id)
    .neq("estado", "anulado")
    .order("creado_en", { ascending: false })
    .limit(5);
  const exps = (lista ?? []).map((e) => ({
    ...e,
    monto: (e.expediente_items as { total: number; anulado: boolean }[]).filter((i) => !i.anulado).reduce((s, i) => s + Number(i.total), 0),
  }));
  if (exps.length === 0) return <div className="vacio">Todavía no hay expedientes. Empiece con un nuevo requerimiento.</div>;

  const ids = exps.map((e) => e.id);
  const [{ data: ords }, { data: confs }, { data: cots }, { data: cps }, { data: neas }, { data: cajas }, cierres] = await Promise.all([
    supabase.from("ordenes").select("expediente_id, tipo, numero, anio, anulado, creado_en").in("expediente_id", ids),
    supabase.from("conformidades").select("expediente_id, memorando_numero, anio, anulado, creado_en").in("expediente_id", ids),
    supabase.from("cotizaciones").select("expediente_id, anulado").in("expediente_id", ids),
    supabase.from("comprobantes_pago").select("id, expediente_id, numero, origen, cheque, estado, creado_en, importe, deducciones").in("expediente_id", ids),
    supabase.from("notas_entrada").select("id, expediente_id, numero, anio, anulado, creado_en").in("expediente_id", ids),
    supabase.from("cajas_chicas").select("id, expediente_id, periodo, fuente_id, numero, estado").in("expediente_id", ids).neq("estado", "anulada"),
    cargarCierres(supabase, ctx.mcp.id),
  ]);
  const cajaDe = new Map((cajas ?? []).map((c) => [c.expediente_id as string, c]));
  const elegir = <T extends { creado_en: string }>(xs: T[], vigente: (x: T) => boolean) => {
    const orden = [...xs].sort((a, b) => b.creado_en.localeCompare(a.creado_en));
    return orden.find(vigente) ?? orden[0] ?? null;
  };

  // ¿Conciliado con el banco? El cheque figura cobrado o su estado de cuenta enlaza comprobantes que suman lo cobrado
  const cpVigente = new Map<string, { id: string; cheque: string | null }>();
  [...(cps ?? [])].sort((a, b) => b.creado_en.localeCompare(a.creado_en)).forEach((c) => {
    if (c.estado !== "anulado" && !cpVigente.has(c.expediente_id)) cpVigente.set(c.expediente_id, { id: c.id, cheque: c.cheque });
  });
  const conciliadosCp = new Set<string>();
  const idsCp = Array.from(cpVigente.values()).map((c) => c.id);
  if (idsCp.length) {
    const { data: cob } = await supabase.from("cheques_cobrados").select("comprobante_id").eq("anulado", false).in("comprobante_id", idsCp);
    (cob ?? []).forEach((c) => conciliadosCp.add(c.comprobante_id));
    const { data: exts } = await supabase.from("extractos_transcritos").select("lineas");
    const montoDe = new Map((cps ?? []).map((c) => [c.id, r2(Number(c.importe) - Number(c.deducciones ?? 0))]));
    const todas = (exts ?? []).flatMap((e) => (e.lineas ?? []) as Lin[]);
    const faltan = Array.from(new Set(todas.flatMap((l) => (l.enlace?.tipo === "cp" && l.enlace.id ? [l.enlace.id, ...(l.enlace.extra ?? []).map((x) => x.id)] : [])))).filter((id) => !montoDe.has(id));
    if (faltan.length) {
      const { data: otros } = await supabase.from("comprobantes_pago").select("id, importe, deducciones").in("id", faltan);
      (otros ?? []).forEach((c) => montoDe.set(c.id as string, r2(Number(c.importe) - Number(c.deducciones ?? 0))));
    }
    for (const l of todas) {
      if (l.enlace?.tipo !== "cp" || !l.enlace.id || l.cargo == null) continue;
      const grupo = [l.enlace.id, ...(l.enlace.extra ?? []).map((x) => x.id)];
      if (!grupo.every((id) => montoDe.has(id))) continue;
      if (Math.abs(r2(grupo.reduce((t, id) => t + (montoDe.get(id) ?? 0), 0)) - Number(l.cargo)) < 0.005) grupo.forEach((id) => conciliadosCp.add(id));
    }
  }

  return (
    <div className="filas">
      {exps.map((e) => {
        const pasos =
          e.tipo !== "pago_fijo" ? ORDEN_FASES : e.flujo_completo ? ["requerimiento", "orden", "conformidad", "comprobante"] : ["requerimiento", "comprobante"];
        const hecho = e.estado === "rendido" ? pasos.length : Math.max(1, pasos.indexOf(e.fase) + 1);
        const mios = <T extends { expediente_id: string }>(xs: T[] | null) => (xs ?? []).filter((x) => x.expediente_id === e.id);
        const o = elegir(mios(ords), (x) => !x.anulado);
        const c = elegir(mios(confs), (x) => !x.anulado);
        const cp = elegir(mios(cps), (x) => x.estado !== "anulado");
        const n = elegir(mios(neas), (x) => !x.anulado);
        const nCots = mios(cots).filter((x) => !x.anulado).length;
        const numDe: Record<string, string | null> = {
          requerimiento: `${num3(e.numero)}-${e.anio}`,
          cotizacion: nCots > 0 ? `${nCots} cot.` : null,
          orden: o ? `${o.tipo === "compra" ? "OC" : "OS"} ${num3(o.numero)}-${o.anio}` : null,
          conformidad: c ? `MEMO ${num3(c.memorando_numero)}-${c.anio}` : null,
          comprobante: cp ? codigoCP(cp.numero, cp.origen) : null,
        };
        const conciliado = !!cpVigente.get(e.id) && conciliadosCp.has(cpVigente.get(e.id)!.id);
        const caja = cajaDe.get(e.id);
        const esCaja = e.tipo === "caja_chica" || /caja chica/i.test(e.descripcion);
        const g = estadoGestion(e.fecha, cierres, hoyISO());
        return (
          <div key={e.id} className={`fila${conciliado ? " conciliada" : ""}`}>
            <div className="f-num">
              {num3(e.numero)}-{e.anio}
              <small>{fecha(e.fecha)}</small>
            </div>
            <div className="f-desc">
              <Link href={`/expedientes/${e.id}`} title={e.descripcion}>{e.descripcion}</Link>
              <div className="f-meta">
                <span className="etq">{TIPOS[e.tipo] ?? e.tipo}</span>
                {e.area_usuaria && <span>{e.area_usuaria}</span>}
                {g && <span className={`etq ${g.estado === "bloqueado" ? "rojo" : "ambar"}`}>{g.estado === "bloqueado" ? "🔒 Gestión anterior" : "Gestión anterior · en gracia"}</span>}
              </div>
              <div className="doc-pasos" aria-label="Documentos del expediente">
                {pasos.map((p, i) => {
                  const d = DOC_DE_FASE[p];
                  const listo = i < hecho;
                  const siguiente = i === hecho && e.estado !== "rendido";
                  return (
                    <span key={p} className="doc-par">
                      {i > 0 && <i className={`doc-sep${listo ? " ok" : ""}`} aria-hidden="true" />}
                      {listo ? (
                        <Link className="doc-paso" href={`/expedientes/${e.id}?paso=${p}&ver=${d.clave}`} title={`Ver ${d.corto.toLowerCase()}`}>
                          <span className="ic" aria-hidden="true">✓</span>{d.corto}
                          {numDe[p] && <span className="doc-num">{numDe[p]}</span>}
                        </Link>
                      ) : siguiente ? (
                        <Link className="doc-paso pendiente siguiente" href={`/expedientes/${e.id}`} title="Es el que sigue: abrir para continuar">
                          <span className="ic" aria-hidden="true" />{d.corto}
                        </Link>
                      ) : (
                        <span className="doc-paso pendiente" title="Aún no se genera">
                          <span className="ic" aria-hidden="true" />{d.corto}
                        </span>
                      )}
                      {p === "conformidad" && n && (
                        <>
                          <i className="doc-sep ok" aria-hidden="true" />
                          <Link className="doc-paso" href={`/almacen/nea/${n.id}`} title="Ver la nota de entrada a almacén">
                            <span className="ic" aria-hidden="true">✓</span>Almacén<span className="doc-num">NEA {num3(n.numero)}-{n.anio}</span>
                          </Link>
                        </>
                      )}
                      {p === "comprobante" && cp && (
                        <span className={`doc-cheque${cp.cheque ? "" : " sin"}`} title={cp.cheque ? "Cheque con el que se pagó" : "Aún sin número de cheque"}>
                          {cp.cheque ? `Cheque ${cp.cheque}` : "Sin cheque"}
                        </span>
                      )}
                    </span>
                  );
                })}
              </div>
              {caja ? (
                <Link className={`caja-enlace${caja.estado === "liquidada" ? " cerrada" : ""}`} href={`/caja-chica?mes=${caja.periodo}&fuente=${caja.fuente_id}&caja=${caja.id}`} title="Abrir esta caja chica">
                  ▣ ENLAZADO A CAJA CHICA · {nombrePeriodo(caja.periodo).split(" ")[0].toUpperCase()} {caja.periodo.slice(0, 4)} · {caja.estado === "liquidada" ? "CERRADA" : "ABIERTA"}
                </Link>
              ) : esCaja ? (
                <span className="caja-enlace sin" title="Este expediente es de caja chica pero aún no abre ninguna caja">⚠ SIN ENLAZAR A CAJA CHICA</span>
              ) : null}
            </div>
            <div className="f-monto">
              S/ {soles(e.monto)}
              <small><Estado valor={e.estado} /></small>
            </div>
            <div className="f-acc">
              <Link className="btn chico primario" href={`/expedientes/${e.id}`}>Abrir</Link>
            </div>
          </div>
        );
      })}
    </div>
  );
}
