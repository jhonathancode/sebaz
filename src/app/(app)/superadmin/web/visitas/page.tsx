import Link from "next/link";
import { obtenerContexto } from "@/lib/contexto";
import { supabaseServidor } from "@/lib/supabase/server";
import "./visitas.css";

const REGIONES_PE: Record<string, string> = {
  AMA: "Amazonas", ANC: "Áncash", APU: "Apurímac", ARE: "Arequipa", AYA: "Ayacucho", CAJ: "Cajamarca", CAL: "Callao", CUS: "Cusco",
  HUV: "Huancavelica", HUC: "Huánuco", ICA: "Ica", JUN: "Junín", LAL: "La Libertad", LAM: "Lambayeque", LIM: "Lima", LMA: "Lima",
  LOR: "Loreto", MDD: "Madre de Dios", MOQ: "Moquegua", PAS: "Pasco", PIU: "Piura", PUN: "Puno", SAM: "San Martín", TAC: "Tacna",
  TUM: "Tumbes", UCA: "Ucayali",
};
const CANALES: Record<string, string> = { directo: "Directo (enlace pegado o escrito)", interno: "Dentro del propio blog", google: "Google", whatsapp: "WhatsApp", facebook: "Facebook", linkedin: "LinkedIn", x: "X (Twitter)", correo: "Correo", enlace: "Enlace copiado", nativo: "Menú «Compartir» del celular", youtube: "YouTube", tiktok: "TikTok", bing: "Bing" };

type Dia = { dia: string; visitas: number; unicos: number };
type Art = { id: string; titulo: string; slug: string; visitas: number; unicos: number; moviles: number };
type Stats = {
  total: number; unicos: number; portada: number; moviles: number;
  por_dia: Dia[]; articulos: Art[];
  paises: { pais: string; visitas: number }[];
  regiones: { pais: string; region: string; visitas: number }[];
  ciudades: { ciudad: string; pais: string; visitas: number }[];
  canales: { canal: string; visitas: number }[];
};

function nombrePais(c: string) {
  if (!c || c === "?") return "Sin dato";
  try {
    return new Intl.DisplayNames(["es"], { type: "region" }).of(c) ?? c;
  } catch {
    return c;
  }
}
const nombreRegion = (pais: string, r: string) => (r === "?" ? "Sin dato" : pais === "PE" ? REGIONES_PE[r] ?? r : `${r} (${nombrePais(pais)})`);
const num = (n: number) => Number(n).toLocaleString("es-PE");

const pct = (n: number, t: number) => (t > 0 ? Math.round((n / t) * 100) : 0);

function Lista({ filas, total }: { filas: { et: string; n: number }[]; total: number }) {
  if (!filas.length) return <div className="vis-vacio">Aún no hay datos.</div>;
  const max = Math.max(1, ...filas.map((f) => f.n));
  return (
    <div className="vis-lista">
      {filas.map((f) => (
        <div key={f.et} className="vis-fila">
          <span className="n" title={f.et}>{f.et}</span>
          <span className="c">{num(f.n)}<small>{pct(f.n, total)}%</small></span>
          <div className="pista"><div style={{ width: `${(f.n / max) * 100}%` }} /></div>
        </div>
      ))}
    </div>
  );
}

function diasRango(n: number): string[] {
  const hoy = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Lima" }));
  const out: string[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(hoy);
    d.setDate(d.getDate() - i);
    out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`);
  }
  return out;
}
function techo(max: number) {
  if (max <= 4) return 4;
  const bruto = max / 4;
  const p = Math.pow(10, Math.floor(Math.log10(bruto)));
  const paso = [1, 2, 5, 10].map((m) => m * p).find((x) => x >= bruto) ?? 10 * p;
  return paso * 4;
}

export default async function VisitasBlog({ searchParams }: { searchParams: Promise<{ dias?: string }> }) {
  const sp = await searchParams;
  const ctx = await obtenerContexto();
  if (!ctx.esSuperadmin) return <div className="aviso error">Esta pantalla es solo para el dueño del sistema.</div>;
  const dias = [7, 30, 90].includes(Number(sp.dias)) ? Number(sp.dias) : 30;
  const supabase = await supabaseServidor();
  const [{ data, error }, { data: aj }] = await Promise.all([
    supabase.rpc("blog_estadisticas", { p_dias: dias }),
    supabase.from("web_ajustes").select("dominio").eq("id", 1).maybeSingle(),
  ]);
  const s = (data ?? null) as Stats | null;
  const dominio = (aj?.dominio ?? "").trim().replace(/\/+$/, "") || "su-dominio";
  const masLeido = s?.articulos?.[0];
  const total = s?.total ?? 0;
  const pctMovil = pct(s?.moviles ?? 0, total);
  const mapa = new Map((s?.por_dia ?? []).map((d) => [d.dia.slice(0, 10), d]));
  const serie = diasRango(dias).map((d) => ({ dia: d, visitas: mapa.get(d)?.visitas ?? 0, unicos: mapa.get(d)?.unicos ?? 0 }));
  const tope = techo(Math.max(1, ...serie.map((d) => d.visitas)));
  const paso = dias <= 7 ? 1 : dias <= 30 ? 5 : 10;
  const promedio = dias > 0 ? Math.round((total / dias) * 10) / 10 : 0;
  const maxArt = Math.max(1, ...(s?.articulos ?? []).map((a) => a.visitas));

  return (
    <div className="vis">
      <div className="vis-cab">
        <div>
          <h1>Visitas del blog</h1>
          <div className="sub">Quién lee, qué lee, desde dónde y por qué canal llega</div>
        </div>
        <span className="espacio" style={{ flex: 1 }} />
        <nav className="vis-seg" aria-label="Periodo">
          {[7, 30, 90].map((d) => (
            <Link key={d} className={dias === d ? "on" : ""} href={`/superadmin/web/visitas?dias=${d}`}>{d} días</Link>
          ))}
        </nav>
        <Link className="btn contorno" href="/superadmin/web">Volver</Link>
      </div>

      {error && <div className="aviso error">Las visitas aún no están activas: falta ejecutar el SQL de visitas en Supabase (archivo ACTUALIZAR_BASE.sql).</div>}

      {s && (
        <>
          <div className="vis-kpis">
            <div className="vis-kpi principal"><span className="et">Visitas</span><span className="val">{num(s.total)}</span><span className="det">promedio {num(promedio)} por día</span></div>
            <div className="vis-kpi"><span className="et">Visitantes únicos</span><span className="val">{num(s.unicos)}</span><span className="det">personas distintas por día</span></div>
            <div className="vis-kpi"><span className="et">Más leído</span><span className={`val ${masLeido ? "txt" : ""}`}>{masLeido ? masLeido.titulo : "—"}</span><span className="det">{masLeido ? `${num(masLeido.visitas)} visitas` : "sin visitas todavía"}</span></div>
            <div className="vis-kpi"><span className="et">Desde celular</span><span className="val">{pctMovil}%</span><span className="det">{num(s.moviles)} de {num(s.total)} visitas</span></div>
          </div>

          <div className="vis-dos">
            <section className="vis-sec">
              <header><h2>Visitas por día</h2><span className="sub">últimos {dias} días</span></header>
              <div className="cuerpo">
                <div className="vis-leyenda"><span><i style={{ background: "color-mix(in srgb, var(--primario) 30%, transparent)" }} />Visitas</span><span><i style={{ background: "var(--primario)" }} />Visitantes únicos</span></div>
                <div className="vis-graf">
                  {[1, 0.75, 0.5, 0.25, 0].map((f) => (
                    <div key={f} className="lin" style={{ top: `calc((100% - 22px) * ${1 - f})` }}><span>{Math.round(tope * f)}</span></div>
                  ))}
                  <div className="vis-barras">
                    {serie.map((d, i) => (
                      <div key={d.dia} className="vis-col">
                        <div className="v" style={{ height: `${(d.visitas / tope) * 100}%` }}>
                          <div className="u" style={{ height: d.visitas ? `${(Math.min(d.unicos, d.visitas) / d.visitas) * 100}%` : 0 }} />
                        </div>
                        {(serie.length - 1 - i) % paso === 0 && <span className="eje">{d.dia.slice(8, 10)}/{d.dia.slice(5, 7)}</span>}
                        <span className="tip">{d.dia.slice(8, 10)}/{d.dia.slice(5, 7)} · {d.visitas} visitas · {d.unicos} únicos</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </section>

            <section className="vis-sec">
              <header><h2>Cómo llegan</h2><span className="sub">canal de origen</span></header>
              <div className="cuerpo"><Lista total={total} filas={s.canales.map((c) => ({ et: CANALES[c.canal] ?? c.canal, n: c.visitas }))} /></div>
            </section>
          </div>

          <section className="vis-sec">
            <header><h2>Artículos</h2><span className="sub">portada del blog: {num(s.portada)} visitas</span></header>
            <div className="vis-tabla-marco">
              <table className="vis-tabla">
                <thead><tr><th>#</th><th>Artículo</th><th className="num">Visitas</th><th className="num">Únicos</th><th className="num">Celular</th></tr></thead>
                <tbody>
                  {s.articulos.length === 0 && <tr><td colSpan={5} className="vis-vacio" style={{ padding: 16 }}>Aún no hay visitas a artículos. Comparte el primero y aparecerá aquí.</td></tr>}
                  {s.articulos.map((a, i) => (
                    <tr key={a.id}>
                      <td className="pos">{i + 1}</td>
                      <td><Link href={`/superadmin/web/blog/${a.id}`}>{a.titulo}</Link><div className="ruta">/{a.slug}</div></td>
                      <td className="num"><span className="vis-mini"><div style={{ width: `${(a.visitas / maxArt) * 100}%` }} /></span><b>{num(a.visitas)}</b></td>
                      <td className="num">{num(a.unicos)}</td>
                      <td className="num">{pct(a.moviles, a.visitas)}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="vis-sec">
            <header><h2>Ubicación</h2><span className="sub">aproximada, según la conexión de internet</span></header>
            <div className="vis-tres">
              <div><h3>Países</h3><Lista total={total} filas={s.paises.map((p) => ({ et: nombrePais(p.pais), n: p.visitas }))} /></div>
              <div><h3>Regiones</h3><Lista total={total} filas={s.regiones.map((r) => ({ et: nombreRegion(r.pais, r.region), n: r.visitas }))} /></div>
              <div><h3>Ciudades</h3><Lista total={total} filas={s.ciudades.map((c) => ({ et: c.ciudad === "?" ? "Sin dato" : `${c.ciudad}${c.pais && c.pais !== "PE" && c.pais !== "?" ? ` (${nombrePais(c.pais)})` : ""}`, n: c.visitas }))} /></div>
            </div>
          </section>

          <details className="vis-sec vis-ayuda">
            <summary>Cómo leer estos datos</summary>
            <ul>
              <li>La ubicación es aproximada: en celulares la ciudad puede ser la del proveedor (por ejemplo Lima) y no la de la persona.</li>
              <li>No se guarda la IP, solo un código que cambia cada día; por eso «únicos» cuenta personas por día.</li>
              <li>Los robots de Google y de vistas previas no se cuentan.</li>
              <li>Para no contar sus propias visitas, abra una vez <code>{dominio}/?sin_conteo=1</code> en cada navegador o celular que use. Con <code>?sin_conteo=0</code> vuelve a contar.</li>
            </ul>
          </details>
        </>
      )}
    </div>
  );
}
