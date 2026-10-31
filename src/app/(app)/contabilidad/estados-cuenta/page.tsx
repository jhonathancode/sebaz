import Link from "next/link";
import Avisos, { type ParamsAviso } from "@/components/Avisos";
import Motivo from "@/components/Motivo";
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
  const vigentes = filas.filter((f) => !f.anulado);
  const porMes = new Map<string, number>();
  vigentes.forEach((f) => porMes.set(f.periodo, (porMes.get(f.periodo) ?? 0) + 1));

  return (
    <>
      <div className="cab-vista">
        <div>
          <h1>Estados de cuenta corriente</h1>
          <div className="sub">{ctx.mcp.banco_nombre}{ctx.mcp.banco_cuenta ? ` · cuenta ${ctx.mcp.banco_cuenta}` : ""}</div>
        </div>
        <span className="espacio" />
        {puede && (
          <VentanaFlotante boton="+ Subir estado de cuenta" titulo="Subir estado de cuenta del banco" accion={subirEstadoCuenta} textoGuardar="Guardar" claseBoton="btn primario grande">
            <div className="rejilla">
              <label className="campo">
                Mes del estado de cuenta
                <input type="month" name="periodo" defaultValue={hoy} required />
              </label>
              <label className="campo ancho">
                Nota (opcional)
                <input name="nota" placeholder="Ej.: movimientos del 1 al 31, hoja 1 de 2" />
              </label>
              <CampoArchivoEstado />
            </div>
            <p className="pequeno tenue" style={{ margin: 0 }}>
              Es el estado de cuenta que saca del {ctx.mcp.banco_nombre}. Si tiene varias hojas o fotos, súbalas una por una con el mismo mes. Nada se borra: si se sube algo por error, se anula con motivo.
            </p>
          </VentanaFlotante>
        )}
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

      <div className="cc-excel-marco">
        <table className="cc-excel">
          <caption>Estados de cuenta {anio}</caption>
          <thead>
            <tr><th>Mes</th><th>Archivo</th><th>Nota</th><th>Subido</th><th className="cc-acc-th"><span className="sr-solo">Acciones</span></th></tr>
          </thead>
          <tbody>
            {filas.length === 0 && <tr><td colSpan={5} className="cc-vacio">Aún no hay estados de cuenta de {anio}. Suba el primero con «+ Subir estado de cuenta».</td></tr>}
            {filas.map((f) => (
              <tr key={f.id} id={`mes-${f.periodo}`} className={f.anulado ? "anulada" : undefined}>
                <td><b>{nombrePeriodo(f.periodo)}</b></td>
                <td>
                  {f.archivo_tipo === "application/pdf" ? "PDF" : "FOTO"} · {f.archivo_nombre}
                  <span className="tenue pequeno" style={{ display: "block", textTransform: "none" }}>{kb(f.archivo_tamano)}</span>
                  {f.anulado && <span className="cc-anulado-motivo">ANULADO: {f.anulado_motivo}</span>}
                </td>
                <td style={{ textTransform: "none" }}>{f.nota ?? "—"}</td>
                <td className="c" style={{ textTransform: "none" }}>
                  {fechaHora(f.creado_en)}
                  <span className="tenue pequeno" style={{ display: "block" }}>{(f.perfiles as unknown as { nombre: string } | null)?.nombre}</span>
                </td>
                <td className="acc">
                  <div className="acciones-fila">
                    {url.get(f.archivo_path) && <a className="btn chico contorno" href={url.get(f.archivo_path) ?? undefined} target="_blank" rel="noreferrer">Ver</a>}
                    {puede && !f.anulado && <Motivo chico accion={anularEstadoCuenta} boton="Anular" ayuda="Motivo" campos={{ id: f.id, anio }} />}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
