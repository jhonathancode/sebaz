import Link from "next/link";
import Avisos, { type ParamsAviso } from "@/components/Avisos";
import InputFecha from "@/components/InputFecha";
import Motivo from "@/components/Motivo";
import VentanaFlotante from "@/components/VentanaFlotante";
import { contextoMcp, tiene } from "@/lib/contexto";
import { fecha, hoyISO, soles } from "@/lib/formato";
import { supabaseServidor } from "@/lib/supabase/server";
import { altaDesdeExpediente, anularPredio, bajaBien, crearInventario, guardarBien, guardarPredio } from "./acciones";

type Bien = { id: string; codigo: string | null; descripcion: string; marca: string | null; modelo: string | null; serie: string | null; color: string | null; estado_conservacion: string; ubicacion: string | null; responsable: string | null; fecha_adquisicion: string | null; valor: number; observacion: string | null; estado: string; baja_resolucion: string | null; baja_fecha: string | null; baja_motivo: string | null };
type Predio = { id: string; nombre: string; direccion: string | null; area_m2: number | null; partida: string | null; cus: string | null; uso: string | null; condicion: string; observacion: string | null; anulado: boolean; anulado_motivo: string | null };
const CONSERV = { bueno: "Bueno", regular: "Regular", malo: "Malo" } as const;
const CONDICION = { propiedad: "Propiedad", cesion: "Cesión en uso", posesion: "Posesión", otro: "Otro" } as const;

export default async function Patrimonio({ searchParams }: { searchParams: ParamsAviso & { vista?: string; q?: string; ver?: string } }) {
  const sp = await searchParams;
  const ctx = await contextoMcp();
  const supabase = await supabaseServidor();
  const puede = tiene(ctx, "admin", "tesorero");
  const vista = sp.vista === "inventario" ? "inventario" : sp.vista === "predios" ? "predios" : "bienes";
  const q = (sp.q ?? "").trim().toUpperCase();
  const verBajas = sp.ver === "bajas";

  const [{ data: bienesAll }, { data: inventarios }, { data: predios }] = await Promise.all([
    supabase.from("bienes_patrimonio").select("*").eq("mcp_id", ctx.mcp.id).order("creado_en", { ascending: false }),
    supabase.from("inventarios_patrimonio").select("*").eq("mcp_id", ctx.mcp.id).neq("estado", "anulado").order("anio", { ascending: false }),
    supabase.from("predios_mcp").select("*").eq("mcp_id", ctx.mcp.id).order("creado_en", { ascending: false }),
  ]);
  const todos = (bienesAll ?? []) as unknown as Bien[];
  const activos = todos.filter((b) => b.estado === "activo");
  const bienes = todos.filter((b) => (verBajas ? b.estado === "baja" : b.estado === "activo")).filter((b) => !q || [b.codigo, b.descripcion, b.marca, b.serie, b.ubicacion, b.responsable].some((x) => x?.toUpperCase().includes(q)));
  const valorTotal = activos.reduce((s, b) => s + Number(b.valor), 0);
  const responsables = [...new Set(activos.map((b) => b.responsable).filter(Boolean))] as string[];

  const campos = (b?: Bien) => (
    <>
      {b && <input type="hidden" name="id" value={b.id} />}
      <div className="rejilla-2">
        <label className="campo ancho">Descripción<input name="descripcion" required defaultValue={b?.descripcion ?? ""} placeholder="LAPTOP, ESCRITORIO, SILLA…" style={{ textTransform: "uppercase" }} /></label>
        <label className="campo">Código patrimonial (12 dígitos)<input name="codigo" inputMode="numeric" maxLength={12} defaultValue={b?.codigo ?? ""} placeholder="Si ya lo tiene" /></label>
        <label className="campo">Marca<input name="marca" defaultValue={b?.marca ?? ""} style={{ textTransform: "uppercase" }} /></label>
        <label className="campo">Modelo<input name="modelo" defaultValue={b?.modelo ?? ""} style={{ textTransform: "uppercase" }} /></label>
        <label className="campo">Serie<input name="serie" defaultValue={b?.serie ?? ""} style={{ textTransform: "uppercase" }} /></label>
        <label className="campo">Color<input name="color" defaultValue={b?.color ?? ""} style={{ textTransform: "uppercase" }} /></label>
        <label className="campo">Estado
          <select name="estado_conservacion" defaultValue={b?.estado_conservacion ?? "bueno"}><option value="bueno">Bueno</option><option value="regular">Regular</option><option value="malo">Malo</option></select>
        </label>
        <label className="campo">Ubicación<input name="ubicacion" defaultValue={b?.ubicacion ?? ""} placeholder="OFICINA DE ALCALDÍA" style={{ textTransform: "uppercase" }} /></label>
        <label className="campo">Responsable (usuario)<input name="responsable" defaultValue={b?.responsable ?? ""} style={{ textTransform: "uppercase" }} /></label>
        <label className="campo">Fecha de adquisición<InputFecha name="fecha_adquisicion" defaultValue={b?.fecha_adquisicion ?? ""} /></label>
        <label className="campo">Valor S/<input name="valor" inputMode="decimal" defaultValue={b ? Number(b.valor).toFixed(2) : ""} /></label>
        <label className="campo ancho">Observación<input name="observacion" defaultValue={b?.observacion ?? ""} style={{ textTransform: "uppercase" }} /></label>
      </div>
    </>
  );

  const campoPredio = (p?: Predio) => (
    <>
      {p && <input type="hidden" name="id" value={p.id} />}
      <div className="rejilla-2">
        <label className="campo ancho">Nombre del predio<input name="nombre" required defaultValue={p?.nombre ?? ""} placeholder="LOCAL COMUNAL, TERRENO DEL PUESTO DE SALUD…" style={{ textTransform: "uppercase" }} /></label>
        <label className="campo ancho">Dirección o ubicación<input name="direccion" defaultValue={p?.direccion ?? ""} style={{ textTransform: "uppercase" }} /></label>
        <label className="campo">Área m²<input name="area_m2" inputMode="decimal" defaultValue={p?.area_m2 ?? ""} /></label>
        <label className="campo">Condición
          <select name="condicion" defaultValue={p?.condicion ?? "propiedad"}>{Object.entries(CONDICION).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
        </label>
        <label className="campo">Partida registral<input name="partida" defaultValue={p?.partida ?? ""} style={{ textTransform: "uppercase" }} /></label>
        <label className="campo">Código CUS (SINABIP)<input name="cus" defaultValue={p?.cus ?? ""} style={{ textTransform: "uppercase" }} /></label>
        <label className="campo ancho">Uso<input name="uso" defaultValue={p?.uso ?? ""} style={{ textTransform: "uppercase" }} /></label>
        <label className="campo ancho">Observación<input name="observacion" defaultValue={p?.observacion ?? ""} style={{ textTransform: "uppercase" }} /></label>
      </div>
    </>
  );

  // Expedientes con ítems para dar de alta
  const { data: expedientes } = vista === "bienes" && puede
    ? await supabase.from("expedientes").select("id, numero, anio, descripcion, expediente_items(id, descripcion, cantidad, precio_unitario, anulado)").eq("mcp_id", ctx.mcp.id).eq("tipo", "compra").neq("estado", "anulado").order("fecha", { ascending: false }).limit(40)
    : { data: [] as never[] };

  const tab = (v: string, t: string) => <Link href={`/patrimonio?vista=${v}`} className={`cfg-tab${vista === v ? " activa" : ""}`}>{t}</Link>;
  const anioActual = Number(hoyISO().slice(0, 4));
  const invActual = (inventarios ?? []).find((i) => i.anio === anioActual);

  return (
    <>
      <div className="cab-vista">
        <div>
          <h1>Patrimonio</h1>
          <div className="sub">Bienes de la municipalidad, inventario anual y predios</div>
        </div>
        <span className="espacio" />
        {vista === "bienes" && <a className="btn contorno" href="/exportar/patrimonio" download>Descargar Excel</a>}
        {vista === "bienes" && responsables.length > 0 && <Link className="btn contorno" href="/patrimonio/asignacion">Hojas de asignación</Link>}
        {puede && vista === "bienes" && (
          <>
            <VentanaFlotante boton="Alta desde un expediente" titulo="Dar de alta bienes comprados" accion={altaDesdeExpediente} textoGuardar="Dar de alta" claseBoton="btn contorno" ancha>
              <p className="pequeno tenue" style={{ margin: "0 0 10px" }}>Elija el expediente de compra y marque los ítems que son bienes duraderos (muebles, equipos). Se crea un bien por cada unidad.</p>
              <div style={{ display: "grid", gap: 10, maxHeight: 280, overflow: "auto" }}>
                {(expedientes ?? []).map((e) => {
                  const its = ((e as { expediente_items: { id: string; descripcion: string; cantidad: number; precio_unitario: number; anulado: boolean }[] }).expediente_items ?? []).filter((i) => !i.anulado);
                  return (
                    <fieldset key={e.id} style={{ border: "1px solid var(--borde)", borderRadius: 10, padding: 8 }}>
                      <legend className="pequeno"><b>{String(e.numero).padStart(3, "0")}-{e.anio}</b> · {e.descripcion}</legend>
                      {its.length === 0 && <span className="tenue pequeno">Sin ítems.</span>}
                      {its.map((i) => (
                        <label key={i.id} style={{ display: "flex", gap: 8, alignItems: "center" }}>
                          <input type="checkbox" name="item" value={i.id} />
                          <span>{i.descripcion} · {Number(i.cantidad)} und · S/ {soles(i.precio_unitario)}</span>
                        </label>
                      ))}
                    </fieldset>
                  );
                })}
              </div>
              <div className="rejilla-2" style={{ marginTop: 10 }}>
                <label className="campo">Ubicación<input name="ubicacion" style={{ textTransform: "uppercase" }} /></label>
                <label className="campo">Responsable<input name="responsable" style={{ textTransform: "uppercase" }} /></label>
              </div>
            </VentanaFlotante>
            <VentanaFlotante boton="+ Nuevo bien" titulo="Registrar un bien" accion={guardarBien} textoGuardar="Guardar bien" claseBoton="btn primario grande" ancha>
              {campos()}
            </VentanaFlotante>
          </>
        )}
        {puede && vista === "predios" && (
          <VentanaFlotante boton="+ Nuevo predio" titulo="Registrar un predio" accion={guardarPredio} textoGuardar="Guardar predio" claseBoton="btn primario grande">{campoPredio()}</VentanaFlotante>
        )}
        {puede && vista === "inventario" && !invActual && (
          <VentanaFlotante boton={`+ Iniciar inventario ${anioActual}`} titulo="Iniciar el inventario anual" accion={crearInventario} textoGuardar="Iniciar inventario" claseBoton="btn primario grande">
            <p className="pequeno tenue" style={{ margin: "0 0 10px" }}>Se arma con todos los bienes activos. La comisión revisa cada uno y al final se imprime el informe final y el acta de conciliación.</p>
            <div className="rejilla-2">
              <label className="campo">Año del inventario<input name="anio" type="number" required defaultValue={anioActual} /></label>
              <label className="campo">Fecha de cierre<InputFecha name="fecha_cierre" defaultValue={`${anioActual}-12-31`} /></label>
              <label className="campo ancho">Resolución que designa la comisión<input name="resolucion" placeholder="RESOLUCIÓN DE ALCALDÍA N° 020-2026" style={{ textTransform: "uppercase" }} /></label>
              <label className="campo ancho">Integrantes de la comisión (uno por línea: NOMBRE - CARGO)
                <textarea name="comision" rows={4} required placeholder={"JUAN PÉREZ - PRESIDENTE\nMARÍA LÓPEZ - SECRETARIA\nLUIS RAMOS - VOCAL"} style={{ textTransform: "uppercase" }} />
              </label>
            </div>
          </VentanaFlotante>
        )}
      </div>
      <Avisos ok={sp.ok} error={sp.error} />
      <div className="cfg-tabs" role="tablist">{tab("bienes", "Bienes")}{tab("inventario", "Inventario anual")}{tab("predios", "Predios")}</div>

      {vista === "bienes" && (
        <>
          <div className="ing-franja" aria-label="Resumen de bienes">
            <span><small>Bienes activos</small><b>{activos.length}</b></span>
            <span><small>Valor total</small><b>S/ {soles(valorTotal)}</b></span>
            <span><small>Sin código patrimonial</small><b>{activos.filter((b) => !b.codigo).length}</b></span>
            <span><small>Dados de baja</small><b>{todos.length - activos.length}</b></span>
          </div>
          <form className="barra" method="get">
            <input type="hidden" name="vista" value="bienes" />
            <label className="campo">Buscar<input name="q" defaultValue={sp.q ?? ""} placeholder="Descripción, serie, ubicación, responsable…" /></label>
            <label className="campo">Ver<select name="ver" defaultValue={verBajas ? "bajas" : "activos"}><option value="activos">Activos</option><option value="bajas">Dados de baja</option></select></label>
            <button className="btn" type="submit">Filtrar</button>
          </form>
          <div className="cc-excel-marco">
            <table className="cc-excel">
              <thead><tr><th>Código</th><th>Descripción</th><th>Marca / modelo / serie</th><th>Estado</th><th>Ubicación</th><th>Responsable</th><th className="num">Valor S/</th><th></th></tr></thead>
              <tbody>
                {bienes.length === 0 && <tr><td colSpan={8} className="cc-vacio">{todos.length === 0 ? "Aún no hay bienes. Registre uno o dé de alta lo comprado desde un expediente." : "No hay bienes con ese filtro."}</td></tr>}
                {bienes.map((b) => (
                  <tr key={b.id}>
                    <td>{b.codigo ?? "—"}</td>
                    <td><b>{b.descripcion}</b>{b.estado === "baja" && <div className="pequeno tenue">BAJA {b.baja_fecha ? fecha(b.baja_fecha) : ""} · {b.baja_resolucion}</div>}</td>
                    <td className="pequeno">{[b.marca, b.modelo, b.serie].filter(Boolean).join(" · ") || "—"}</td>
                    <td>{CONSERV[b.estado_conservacion as keyof typeof CONSERV]}</td>
                    <td>{b.ubicacion ?? "—"}</td>
                    <td>{b.responsable ?? "—"}</td>
                    <td className="num">{soles(b.valor)}</td>
                    <td className="acc">
                      {puede && b.estado === "activo" && (
                        <div className="acciones-fila">
                          <VentanaFlotante boton="Editar" titulo="Corregir el bien" accion={guardarBien} textoGuardar="Guardar cambios" claseBoton="btn chico contorno" ancha>{campos(b)}</VentanaFlotante>
                          <VentanaFlotante boton="Dar de baja" titulo="Baja del bien" accion={bajaBien} textoGuardar="Dar de baja" claseBoton="btn chico contorno">
                            <input type="hidden" name="id" value={b.id} />
                            <div className="rejilla-2">
                              <label className="campo ancho">Resolución que aprueba la baja<input name="resolucion" required placeholder="RESOLUCIÓN DE ALCALDÍA N° …" style={{ textTransform: "uppercase" }} /></label>
                              <label className="campo">Fecha<InputFecha name="fecha" defaultValue={hoyISO()} /></label>
                              <label className="campo ancho">Motivo<input name="motivo" placeholder="Obsoleto, malogrado, robado…" /></label>
                            </div>
                          </VentanaFlotante>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {vista === "inventario" && (
        <section className="panel">
          <div className="panel-cab">Inventarios anuales <span className="tenue pequeno">cierre al 31 de diciembre · se registra hasta marzo del año siguiente</span></div>
          <div className="panel-cuerpo">
            {(inventarios ?? []).length === 0 ? (
              <p className="tenue" style={{ margin: 0 }}>Aún no hay inventarios. Cuando llegue fin de año, inicie el del año: se arma solo con los bienes activos y la comisión los verifica uno por uno.</p>
            ) : (
              <div className="filas">
                {(inventarios ?? []).map((i) => (
                  <div key={i.id} className="fila">
                    <Link href={`/patrimonio/inventario/${i.id}`}><b>Inventario {i.anio}</b></Link>
                    <span className="tenue pequeno">cierre {fecha(i.fecha_cierre)}{i.resolucion ? ` · ${i.resolucion}` : ""}</span>
                    <span className="espacio" />
                    <span className="etq">{i.estado === "cerrado" ? "✓ Cerrado" : "En curso"}</span>
                    <Link className="btn chico contorno" href={`/patrimonio/inventario/${i.id}`}>{i.estado === "cerrado" ? "Ver actas" : "Continuar"}</Link>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      )}

      {vista === "predios" && (
        <>
          <div className="aviso info">Los predios del Estado se consultan en <a href="https://catastro.sbn.gob.pe/scl/" target="_blank" rel="noreferrer">SINABIP Libre</a> (visor gratuito de la SBN). Aquí lleva el control interno: partida registral, código CUS y condición.</div>
          <div className="fu-grid">
            {((predios ?? []) as unknown as Predio[]).length === 0 && <div className="aviso info">Aún no hay predios registrados (local comunal, terrenos, puesto de salud, losa deportiva…).</div>}
            {((predios ?? []) as unknown as Predio[]).map((p) => (
              <article key={p.id} className="fu-card" style={p.anulado ? { opacity: 0.55 } : undefined}>
                <header className="fu-card-cab"><span className="fu-tipo">{CONDICION[p.condicion as keyof typeof CONDICION]}</span>{p.anulado && <span className="fu-pill no">ANULADO</span>}</header>
                <h3 style={{ margin: 0 }}>{p.nombre}</h3>
                <p className="tenue pequeno" style={{ margin: 0 }}>{p.direccion ?? "Sin dirección"}{p.area_m2 ? ` · ${p.area_m2} m²` : ""}</p>
                <p className="pequeno" style={{ margin: 0 }}>Partida: {p.partida ?? "—"} · CUS: {p.cus ?? "—"}</p>
                {p.uso && <p className="pequeno tenue" style={{ margin: 0 }}>Uso: {p.uso}</p>}
                {p.anulado && <p className="pequeno" style={{ margin: 0 }}>Anulado: {p.anulado_motivo}</p>}
                {puede && !p.anulado && (
                  <div className="acciones-fila">
                    <VentanaFlotante boton="Editar" titulo="Corregir el predio" accion={guardarPredio} textoGuardar="Guardar cambios" claseBoton="btn chico contorno">{campoPredio(p)}</VentanaFlotante>
                    <Motivo chico accion={anularPredio} boton="Anular" ayuda="Motivo" campos={{ id: p.id }} />
                  </div>
                )}
              </article>
            ))}
          </div>
        </>
      )}
    </>
  );
}
