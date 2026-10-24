import Link from "next/link";
import Avisos, { type ParamsAviso } from "@/components/Avisos";
import VentanaFlotante from "@/components/VentanaFlotante";
import { obtenerContexto } from "@/lib/contexto";
import { fecha, periodoActual, soles } from "@/lib/formato";
import { estadoCliente, mensual } from "@/lib/superadmin";
import { supabaseServidor } from "@/lib/supabase/server";
import { crearMcp } from "../soporte/acciones";

const FILTROS = [
  { v: "", t: "Todos" },
  { v: "prueba", t: "En prueba" },
  { v: "al_dia", t: "Al día" },
  { v: "por_vencer", t: "Por vencer" },
  { v: "gracia", t: "En gracia" },
  { v: "vencida", t: "Vencidos" },
  { v: "suspendida", t: "Suspendidos" },
];

/** Superadmin: todos los clientes, su plan, su vencimiento y lo que pagan. */
export default async function Superadmin({ searchParams }: { searchParams: ParamsAviso }) {
  const sp = await searchParams;
  const ctx = await obtenerContexto();
  if (!ctx.esSuperadmin) return <div className="aviso error">Esta pantalla es solo para el dueño del sistema.</div>;
  const supabase = await supabaseServidor();
  const mes = periodoActual();

  const [{ data: mcps }, { data: susc, error: errS }, { data: planes }, { data: pagos }, { data: miembros }] = await Promise.all([
    supabase.from("mcps").select("id, nombre, ruc, distrito, provincia, estado, creado_en").order("nombre"),
    supabase.from("suscripciones").select("*"),
    supabase.from("planes").select("id, nombre"),
    supabase.from("pagos_clientes").select("mcp_id, fecha, monto, anulado").eq("anulado", false).order("fecha", { ascending: false }),
    supabase.from("miembros").select("mcp_id, activo").eq("activo", true),
  ]);
  if (errS) {
    return (
      <>
        <div className="cab-vista"><h1>Superadmin</h1></div>
        <div className="aviso error">Falta la actualización de la base de datos (SUPERADMIN.sql) para activar el superadmin.</div>
      </>
    );
  }
  const plan = new Map((planes ?? []).map((p) => [p.id, p.nombre]));
  const filas = (mcps ?? []).map((m) => {
    const s = (susc ?? []).find((x) => x.mcp_id === m.id);
    const ultimo = (pagos ?? []).find((p) => p.mcp_id === m.id);
    return {
      ...m,
      s,
      plan: s?.plan_id ? plan.get(s.plan_id) ?? "—" : "—",
      est: estadoCliente(m.estado, s?.vence_el ?? null, s?.dias_gracia ?? 10),
      ultimo,
      usuarios: (miembros ?? []).filter((x) => x.mcp_id === m.id).length,
      mensual: s ? mensual(Number(s.precio), s.ciclo) : 0,
    };
  });
  const filtro = sp.estado ?? "";
  const vista = filtro ? filas.filter((f) => f.est.clave === filtro) : filas;
  const activos = filas.filter((f) => ["al_dia", "por_vencer", "gracia"].includes(f.est.clave));
  const mrr = activos.reduce((s, f) => s + f.mensual, 0);
  const cobradoMes = (pagos ?? []).filter((p) => p.fecha.startsWith(mes)).reduce((s, p) => s + Number(p.monto), 0);
  const porCobrar = filas.filter((f) => ["por_vencer", "gracia", "vencida"].includes(f.est.clave));

  return (
    <>
      <div className="cab-vista">
        <div>
          <h1>Clientes</h1>
          <div className="sub">Las municipalidades que usan el sistema: su plan, su vencimiento y sus pagos. Aquí no se ven sus gastos ni sus rendiciones.</div>
        </div>
        <span className="espacio" />
        <VentanaFlotante boton="+ Nuevo cliente" titulo="Nuevo cliente (MCP)" accion={crearMcp} textoGuardar="Dar de alta" claseBoton="btn primario grande" ancha>
          <div className="aviso info" style={{ margin: 0 }}>La MCP empieza con 3 meses de prueba. Después de darla de alta, cree sus usuarios en el panel de soporte.</div>
          <div className="rejilla-2">
            <label className="campo">Nombre<input name="nombre" required placeholder="Municipalidad del Centro Poblado ..." /></label>
            <label className="campo">RUC<input name="ruc" inputMode="numeric" maxLength={11} /></label>
            <label className="campo">Distrito<input name="distrito" defaultValue="Perené" /></label>
            <label className="campo">Provincia<input name="provincia" defaultValue="Chanchamayo" /></label>
            <label className="campo">Departamento<input name="departamento" defaultValue="Junín" /></label>
            <label className="campo">Municipalidad distrital<input name="muni_distrito" defaultValue="Municipalidad Distrital de Perené" /></label>
            <label className="campo">Monto mensual del distrito S/<input name="monto_distrito" inputMode="decimal" defaultValue="7080" /></label>
            <label className="campo">
              Formato del distrito
              <select name="formato_distrito" defaultValue="perene">
                <option value="perene">Perené</option>
                <option value="chanchamayo">Chanchamayo</option>
                <option value="general">General</option>
              </select>
            </label>
            <label className="campo">Municipalidad provincial<input name="muni_provincia" defaultValue="Municipalidad Provincial de Chanchamayo" /></label>
            <label className="campo">Monto mensual de la provincia S/<input name="monto_provincia" inputMode="decimal" defaultValue="2675" /></label>
            <label className="campo">
              Formato de la provincia
              <select name="formato_provincia" defaultValue="chanchamayo">
                <option value="perene">Perené</option>
                <option value="chanchamayo">Chanchamayo</option>
                <option value="general">General</option>
              </select>
            </label>
          </div>
        </VentanaFlotante>
      </div>
      <Avisos ok={sp.ok} error={sp.error} />

      <div className="kpis">
        <div className="kpi azul"><span className="k-et">Ingreso mensual</span><span className="k-val">S/ {soles(mrr)}</span><span className="k-det">{activos.length} cliente(s) pagando</span></div>
        <div className="kpi"><span className="k-et">Cobrado este mes</span><span className="k-val">S/ {soles(cobradoMes)}</span><span className="k-det"><Link href="/superadmin/pagos">Ver pagos</Link></span></div>
        <div className="kpi"><span className="k-et">En prueba</span><span className="k-val">{filas.filter((f) => f.est.clave === "prueba").length}</span><span className="k-det">{filas.length} cliente(s) en total</span></div>
        <Link className={`kpi${porCobrar.length ? " rojo" : ""}`} href="/superadmin?estado=vencida"><span className="k-et">Por cobrar</span><span className="k-val">{porCobrar.length}</span><span className="k-det">Por vencer, en gracia o vencidos</span></Link>
      </div>

      <div className="filtros">
        <div className="grupo">
          {FILTROS.map((f) => (
            <Link key={f.v} className={`f-chip${filtro === f.v ? " activo" : ""}${f.v === "vencida" || f.v === "suspendida" ? " rojo" : ""}`} href={f.v ? `/superadmin?estado=${f.v}` : "/superadmin"}>
              {f.t} <span className="n">{f.v ? filas.filter((x) => x.est.clave === f.v).length : filas.length}</span>
            </Link>
          ))}
        </div>
      </div>

      <div className="filas">
        {vista.length === 0 && <div className="vacio">Ningún cliente con este filtro.</div>}
        {vista.map((f) => (
          <div key={f.id} className="fila">
            <div className="f-num" style={{ fontSize: 13 }}>
              {f.ruc ?? "Sin RUC"}
              <small>desde {fecha(f.creado_en.slice(0, 10))}</small>
            </div>
            <div className="f-desc">
              <Link href={`/superadmin/clientes/${f.id}`}>{f.nombre}</Link>
              <div className="f-meta">
                <span className="etq">{f.plan}</span>
                <span>{[f.distrito, f.provincia].filter(Boolean).join(" · ")}</span>
                <span>{f.usuarios} usuario(s)</span>
                <span>Vence {fecha(f.s?.vence_el)}</span>
                {f.ultimo && <span>Último pago {fecha(f.ultimo.fecha)} · S/ {soles(f.ultimo.monto)}</span>}
              </div>
            </div>
            <div className="f-monto">
              S/ {soles(f.mensual)}<span className="tenue pequeno" style={{ fontWeight: 400 }}> /mes</span>
              <small><span className={`estado ${f.est.clase}`}>{f.est.texto}</span></small>
            </div>
            <div className="f-acc">
              <Link className="btn chico primario" href={`/superadmin/clientes/${f.id}`}>Ver cliente</Link>
              <Link className="btn chico contorno" href={`/soporte?mcp=${f.id}`}>Usuarios</Link>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
