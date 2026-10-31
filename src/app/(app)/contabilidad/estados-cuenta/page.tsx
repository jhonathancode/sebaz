import Link from "next/link";
import Avisos, { type ParamsAviso } from "@/components/Avisos";
import Motivo from "@/components/Motivo";
import VisorArchivo from "@/components/VisorArchivo";
import VentanaFlotante from "@/components/VentanaFlotante";
import CampoArchivoEstado from "@/components/formularios/CampoArchivoEstado";
import { contextoMcp, tiene } from "@/lib/contexto";
import { fechaHora, nombrePeriodo, periodoActual } from "@/lib/formato";
import { supabaseServidor } from "@/lib/supabase/server";
import { anularEstadoCuenta, subirEstadoCuenta } from "./acciones";

const MES_CORTO = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Set", "Oct", "Nov", "Dic"];
const kb = (n: number) => (n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

export default async function EstadosCuenta({ searchParams }: { searchParams: ParamsAviso }) {
  const sp = await searchParams;
  const ctx = await contextoMcp();
  const supabase = await supabaseServidor();
  const anio = /^\d{4}$/.test(sp.anio ?? "") ? sp.anio! : periodoActual().slice(0, 4);
  const hoy = periodoActual();
  const puede = tiene(ctx, "admin", "tesorero", "contador", "alcalde");

  const { data, error } = await supabase
    .from("estados_cuenta")
    .select("*, perfiles(nombre)")
    .eq("mcp_id", ctx.mcp.id)
    .gte("periodo", `${anio}-01`)
    .lte("periodo", `${anio}-12`)
    .order("periodo", { ascending: false })
    .order("creado_en", { ascending: false });
  const filas = data ?? [];
  const firmadas = filas.length
    ? await supabase.storage.from("sustentos").createSignedUrls(filas.map((f) => f.archivo_path), 900)
    : { data: [] as { path: string | null; signedUrl: string }[] };
  const url = new Map((firmadas.data ?? []).map((u) => [u.path, u.signedUrl]));
  const firmadasDescarga = filas.length
    ? await supabase.storage.from("sustentos").createSignedUrls(filas.map((f) => f.archivo_path), 900, { download: true })
    : { data: [] as { path: string | null; signedUrl: string }[] };
  const urlDescarga = new Map((firmadasDescarga.data ?? []).map((u) => [u.path, u.signedUrl]));
  const vigentes = filas.filter((f) => !f.anulado);
  const porMes = new Map<string, number>();
  vigentes.forEach((f) => porMes.set(f.periodo, (porMes.get(f.periodo) ?? 0) + 1));

  const hojasDe = (per: string) => filas.filter((f) => f.periodo === per).sort((a, b) => a.creado_en.localeCompare(b.creado_en));
  const meses = MES_CORTO.map((corto, i) => {
    const per = `${anio}-${String(i + 1).padStart(2, "0")}`;
    const todas = hojasDe(per);
    const vig = todas.filter((h) => !h.anulado);
    return { per, corto, todas, vig, futuro: per > hoy };
  });
  const mesesSubidos = meses.filter((m) => m.vig.length > 0).length;
  const mesesPasados = meses.filter((m) => !m.futuro).length;
  const formSubir = (per: string, boton: string, clase: string, fijo: boolean) => (
    <VentanaFlotante boton={boton} titulo={fijo ? `Subir hojas de ${nombrePeriodo(per)}` : "Subir estado de cuenta del banco"} accion={subirEstadoCuenta} textoGuardar="Guardar" claseBoton={clase}>
      <div className="rejilla">
        {fijo ? (
          <input type="hidden" name="periodo" value={per} />
        ) : (
          <label className="campo">
            Mes del estado de cuenta
            <input type="month" name="periodo" defaultValue={per} required />
          </label>
        )}
        <label className="campo ancho">
          Nota (opcional)
          <input name="nota" placeholder="Ej.: movimientos del 1 al 31" />
        </label>
        <CampoArchivoEstado />
      </div>
      <p className="pequeno tenue" style={{ margin: 0 }}>
        Es el estado de cuenta que saca del {ctx.mcp.banco_nombre}. Si tiene varias hojas, elíjalas juntas: quedan agrupadas en el mismo mes. Nada se borra: si se sube algo por error, se anula con motivo.
      </p>
    </VentanaFlotante>
  );

  return (
    <>
      <div className="cab-vista">
        <div>
          <h1>Estados de cuenta corriente</h1>
          <div className="sub">{ctx.mcp.banco_nombre}{ctx.mcp.banco_cuenta ? ` · cuenta ${ctx.mcp.banco_cuenta}` : ""}</div>
        </div>
        <span className="espacio" />
        {puede && formSubir(hoy, "+ Subir estado de cuenta", "btn primario grande", false)}
      </div>
      <Avisos ok={sp.ok} error={sp.error} />
      {error && <div className="aviso error">Los estados de cuenta aún no están activos: falta la actualización de la base de datos (ACTUALIZAR_BASE.sql). Avise a soporte.</div>}

      <section className="cc-selector" aria-label="Elegir el año y el mes">
        <div className="cc-fila">
          <div className="cc-anio">
            <Link className="cc-flecha" href={`/contabilidad/estados-cuenta?anio=${Number(anio) - 1}`} aria-label={`Año ${Number(anio) - 1}`}>‹</Link>
            <b>{anio}</b>
            <Link className="cc-flecha" href={`/contabilidad/estados-cuenta?anio=${Number(anio) + 1}`} aria-label={`Año ${Number(anio) + 1}`}>›</Link>
          </div>
          <div className="cc-meses" role="group" aria-label="Meses con estado de cuenta">
            {MES_CORTO.map((nombre, i) => {
              const per = `${anio}-${String(i + 1).padStart(2, "0")}`;
              const n = porMes.get(per) ?? 0;
              return (
                <a key={per} href={`#mes-${per}`} className={`cc-mes${n ? " liq" : " vacia"}${per === hoy ? " hoy" : ""}`} title={`${nombrePeriodo(per)} · ${n ? `${n} archivo(s)` : "sin estado de cuenta"}`}>
                  <span className="cc-mes-n">{nombre}</span>
                  <span className="cc-mes-d">{n ? `✓ ${n}` : "—"}</span>
                </a>
              );
            })}
          </div>
        </div>
      </section>

      <p className="pequeno tenue" style={{ margin: "0 0 8px" }}>
        {mesesSubidos} de {mesesPasados} meses con estado de cuenta subido en {anio}.
      </p>
      <div className="cc-excel-marco">
        <table className="cc-excel">
          <caption>Estados de cuenta {anio}</caption>
          <thead>
            <tr><th>Mes</th><th>Estado</th><th>Hojas</th><th>Subido</th><th className="cc-acc-th"><span className="sr-solo">Acciones</span></th></tr>
          </thead>
          <tbody>
            {meses.map((m) => {
              const primera = m.vig[0];
              const ultima = m.vig[m.vig.length - 1];
              return (
                <tr key={m.per} id={`mes-${m.per}`} className={m.vig.length === 0 && m.todas.length === 0 ? "sin-subir" : undefined}>
                  <td><b>{nombrePeriodo(m.per)}</b></td>
                  <td className="c">
                    {m.vig.length > 0 ? (
                      <span className="cc-subido">✓ Subido</span>
                    ) : m.futuro ? (
                      <span className="tenue" style={{ textTransform: "none" }}>—</span>
                    ) : (
                      <span className="cc-pendiente">Pendiente</span>
                    )}
                  </td>
                  <td style={{ textTransform: "none" }}>
                    {m.todas.length === 0 && <span className="tenue">{m.futuro ? "" : "Aún no se subió"}</span>}
                    {m.todas.map((h, i) => (
                      <div key={h.id} className={`cc-hoja${h.anulado ? " anulada" : ""}`}>
                        <span>
                          <b>Hoja {m.todas.slice(0, i + 1).filter((x) => !x.anulado).length || "·"}</b> · {h.archivo_tipo === "application/pdf" ? "PDF" : "Foto"} · {h.archivo_nombre} <span className="tenue">({kb(h.archivo_tamano)})</span>
                          {h.nota && <span className="tenue"> · {h.nota}</span>}
                          {h.anulado && <span className="cc-anulado-motivo"> · ANULADA: {h.anulado_motivo}</span>}
                        </span>
                        <span className="cc-hoja-acc">
                          {url.get(h.archivo_path) && !h.anulado && (
                            <VisorArchivo
                              url={url.get(h.archivo_path)!}
                              descarga={urlDescarga.get(h.archivo_path) ?? url.get(h.archivo_path)!}
                              nombre={h.archivo_nombre}
                              tipo={h.archivo_tipo}
                              titulo={`Estado de cuenta · ${nombrePeriodo(h.periodo)}`}
                            />
                          )}
                          {puede && !h.anulado && <Motivo chico accion={anularEstadoCuenta} boton="Anular" ayuda="Motivo" campos={{ id: h.id, anio }} />}
                        </span>
                      </div>
                    ))}
                  </td>
                  <td className="c" style={{ textTransform: "none" }}>
                    {primera ? (
                      <>
                        {fechaHora(primera.creado_en)}
                        {ultima && ultima.id !== primera.id && <span className="tenue pequeno" style={{ display: "block" }}>última hoja: {fechaHora(ultima.creado_en)}</span>}
                        <span className="tenue pequeno" style={{ display: "block" }}>{(primera.perfiles as unknown as { nombre: string } | null)?.nombre}</span>
                      </>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="acc">{puede && !m.futuro && formSubir(m.per, m.vig.length ? "+ Hoja" : "Subir", "btn chico contorno", true)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
