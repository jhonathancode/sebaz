import Link from "next/link";
import Avisos, { type ParamsAviso } from "@/components/Avisos";
import { obtenerContexto } from "@/lib/contexto";
import { fecha, hoyISO, soles } from "@/lib/formato";
import { diaLima, ES_FECHA, estadoCliente, lunesDe, mensual, sumarDias } from "@/lib/superadmin";
import { supabaseServidor } from "@/lib/supabase/server";

const DIAS = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];
const diaSemana = (d: string) => DIAS[new Date(`${d}T00:00:00Z`).getUTCDay()];

/** Inicio del dueño del sistema: cuántos clientes se captaron hoy, esta semana, este mes o en las fechas que elija. */
export default async function InicioSuperadmin({ searchParams }: { searchParams: ParamsAviso & { desde?: string; hasta?: string } }) {
  const sp = await searchParams;
  const ctx = await obtenerContexto();
  if (!ctx.esSuperadmin) return <div className="aviso error">Esta pantalla es solo para el dueño del sistema.</div>;
  const supabase = await supabaseServidor();

  const hoy = hoyISO();
  const lunes = lunesDe(hoy);
  const primeroMes = `${hoy.slice(0, 7)}-01`;
  let hasta = sp.hasta && ES_FECHA.test(sp.hasta) ? sp.hasta : hoy;
  let desde = sp.desde && ES_FECHA.test(sp.desde) ? sp.desde : sumarDias(hasta, -29);
  if (desde > hasta) [desde, hasta] = [hasta, desde];

  const [{ data: mcps }, { data: susc }, { data: pagos }, { data: planes }] = await Promise.all([
    supabase.from("mcps").select("id, nombre, ruc, distrito, provincia, estado, creado_en").order("creado_en", { ascending: false }),
    supabase.from("suscripciones").select("*"),
    supabase.from("pagos_clientes").select("mcp_id, fecha, monto").eq("anulado", false),
    supabase.from("planes").select("id, nombre"),
  ]);

  const clientes = (mcps ?? []).map((m) => {
    const s = (susc ?? []).find((x) => x.mcp_id === m.id);
    return {
      ...m,
      dia: diaLima(m.creado_en),
      s,
      plan: (planes ?? []).find((p) => p.id === s?.plan_id)?.nombre ?? "—",
      est: estadoCliente(m.estado, s?.vence_el ?? null, s?.dias_gracia ?? 10),
      pago: (pagos ?? []).some((p) => p.mcp_id === m.id),
    };
  });
  const entre = (a: string, b: string) => clientes.filter((c) => c.dia >= a && c.dia <= b);
  const deHoy = entre(hoy, hoy);
  const deSemana = entre(lunes, hoy);
  const deMes = entre(primeroMes, hoy);
  const enRango = entre(desde, hasta);
  const convertidos = enRango.filter((c) => c.pago).length;

  // Captados por día; si el rango es largo, por semana.
  const dias = Math.round((Date.parse(hasta) - Date.parse(desde)) / 86400000) + 1;
  const porSemana = dias > 45;
  const cubetas: { clave: string; etiqueta: string; n: number }[] = [];
  if (porSemana) {
    for (let l = lunesDe(desde); l <= hasta; l = sumarDias(l, 7)) {
      const fin = sumarDias(l, 6);
      cubetas.push({ clave: l, etiqueta: `${fecha(l).slice(0, 5)} – ${fecha(fin).slice(0, 5)}`, n: clientes.filter((c) => c.dia >= l && c.dia <= fin && c.dia >= desde && c.dia <= hasta).length });
    }
  } else {
    for (let d = desde; d <= hasta; d = sumarDias(d, 1)) {
      cubetas.push({ clave: d, etiqueta: `${diaSemana(d)} ${fecha(d).slice(0, 5)}`, n: clientes.filter((c) => c.dia === d).length });
    }
  }
  const maximo = Math.max(1, ...cubetas.map((c) => c.n));

  // Lo que pasa hoy con los clientes que ya están
  const activos = clientes.filter((c) => ["al_dia", "por_vencer", "gracia"].includes(c.est.clave));
  const mrr = activos.reduce((t, c) => t + (c.s ? mensual(Number(c.s.precio), c.s.ciclo) : 0), 0);
  const enPrueba = clientes.filter((c) => c.est.clave === "prueba");
  const pruebaPorTerminar = enPrueba.filter((c) => (c.est.dias ?? 99) <= 15).length;
  const porCobrar = clientes.filter((c) => ["por_vencer", "gracia", "vencida"].includes(c.est.clave)).length;

  const atajo = (t: string, d: string, h: string) => (
    <Link key={t} className={`f-chip${desde === d && hasta === h ? " activo" : ""}`} href={`/superadmin/inicio?desde=${d}&hasta=${h}`}>{t}</Link>
  );

  return (
    <>
      <div className="cab-vista">
        <div>
          <h1>Inicio</h1>
          <div className="sub">Cómo va la captación de clientes y el estado de los que ya usan Sebaz.</div>
        </div>
        <span className="espacio" />
        <Link className="btn primario grande" href="/superadmin/clientes">Ver clientes</Link>
      </div>
      <Avisos ok={sp.ok} error={sp.error} />

      <div className="kpis">
        <div className="kpi azul"><span className="k-et">Captados hoy</span><span className="k-val">{deHoy.length}</span><span className="k-det">{fecha(hoy)}</span></div>
        <div className="kpi"><span className="k-et">Esta semana</span><span className="k-val">{deSemana.length}</span><span className="k-det">desde el lunes {fecha(lunes).slice(0, 5)}</span></div>
        <div className="kpi"><span className="k-et">Este mes</span><span className="k-val">{deMes.length}</span><span className="k-det">desde el {fecha(primeroMes).slice(0, 5)}</span></div>
        <div className="kpi"><span className="k-et">Clientes en total</span><span className="k-val">{clientes.length}</span><span className="k-det">{activos.length} pagando · {enPrueba.length} en prueba</span></div>
      </div>

      <section className="panel">
        <div className="panel-cab">Clientes captados por fechas</div>
        <div className="panel-cuerpo">
          <form method="get" className="barra" style={{ margin: 0 }}>
            <label className="campo">Desde<input type="date" name="desde" defaultValue={desde} max={hoy} /></label>
            <label className="campo">Hasta<input type="date" name="hasta" defaultValue={hasta} max={hoy} /></label>
            <button className="btn primario" type="submit">Ver</button>
            <span className="espacio" />
            <div className="grupo">
              {atajo("Hoy", hoy, hoy)}
              {atajo("Esta semana", lunes, hoy)}
              {atajo("7 días", sumarDias(hoy, -6), hoy)}
              {atajo("Este mes", primeroMes, hoy)}
              {atajo("30 días", sumarDias(hoy, -29), hoy)}
              {atajo("Este año", `${hoy.slice(0, 4)}-01-01`, hoy)}
            </div>
          </form>

          <div className="kpis">
            <div className="kpi azul"><span className="k-et">Captados en el rango</span><span className="k-val">{enRango.length}</span><span className="k-det">{fecha(desde)} al {fecha(hasta)}</span></div>
            <div className="kpi"><span className="k-et">Ya pagaron</span><span className="k-val">{convertidos}</span><span className="k-det">{enRango.length ? Math.round((convertidos / enRango.length) * 100) : 0}% de los captados</span></div>
            <div className="kpi"><span className="k-et">Promedio</span><span className="k-val">{(enRango.length / (porSemana ? Math.max(1, dias / 7) : dias)).toFixed(1)}</span><span className="k-det">por {porSemana ? "semana" : "día"}</span></div>
          </div>

          <div className="barras">
            <div className="pequeno tenue">Captados {porSemana ? "por semana (el rango es largo)" : "por día"}</div>
            {cubetas.map((c) => (
              <div key={c.clave} className="fila">
                <span className="pequeno">{c.etiqueta}</span>
                <span className="monto">{c.n}</span>
                <div className="pista"><div style={{ width: `${(c.n / maximo) * 100}%`, opacity: c.n ? 1 : 0.25 }} /></div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <div className="dos-columnas">
        <div className="columna">
          <section className="panel">
            <div className="panel-cab">Clientes captados en el rango ({enRango.length})</div>
            <div className="filas" style={{ border: "none", borderRadius: 0 }}>
              {enRango.length === 0 && <div className="vacio">Ningún cliente se captó en estas fechas.</div>}
              {enRango.map((c) => (
                <div key={c.id} className="fila" style={{ gridTemplateColumns: "90px minmax(0,1fr) auto" }}>
                  <div className="f-num" style={{ fontSize: 13 }}>{fecha(c.dia)}<small>{diaSemana(c.dia)}</small></div>
                  <div className="f-desc">
                    <Link href={`/superadmin/clientes/${c.id}`}>{c.nombre}</Link>
                    <div className="f-meta">
                      <span className="etq">{c.plan}</span>
                      <span>{[c.distrito, c.provincia].filter(Boolean).join(" · ")}</span>
                      {c.pago && <span>Ya pagó</span>}
                    </div>
                  </div>
                  <span className={`estado ${c.est.clase}`}>{c.est.texto}</span>
                </div>
              ))}
            </div>
          </section>
        </div>

        <div className="columna">
          <section className="panel">
            <div className="panel-cab">Estado del negocio</div>
            <div className="panel-cuerpo">
              <div className="kpis">
                <div className="kpi azul"><span className="k-et">Ingreso mensual</span><span className="k-val">S/ {soles(mrr)}</span><span className="k-det">{activos.length} cliente(s) pagando</span></div>
                <Link className={`kpi${porCobrar ? " rojo" : ""}`} href="/superadmin/clientes?estado=vencida"><span className="k-et">Por cobrar</span><span className="k-val">{porCobrar}</span><span className="k-det">Por vencer, en gracia o vencidos</span></Link>
                <Link className={`kpi${pruebaPorTerminar ? " alerta" : ""}`} href="/superadmin/clientes?estado=prueba"><span className="k-et">Pruebas por terminar</span><span className="k-val">{pruebaPorTerminar}</span><span className="k-det">Quedan 15 días o menos</span></Link>
              </div>
              <Link className="btn contorno" href="/superadmin/pagos">Ver pagos del mes</Link>
            </div>
          </section>
        </div>
      </div>
    </>
  );
}
