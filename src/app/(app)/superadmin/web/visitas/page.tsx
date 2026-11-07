import Link from "next/link";
import { obtenerContexto } from "@/lib/contexto";
import { supabaseServidor } from "@/lib/supabase/server";

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

function Barras({ filas }: { filas: { et: string; n: number }[] }) {
  const max = Math.max(1, ...filas.map((f) => f.n));
  if (!filas.length) return <div className="tenue">Aún no hay datos.</div>;
  return (
    <div className="barras">
      {filas.map((f) => (
        <div key={f.et} className="fila">
          <span>{f.et}</span>
          <span className="monto">{num(f.n)}</span>
          <div className="pista"><div style={{ width: `${(f.n / max) * 100}%` }} /></div>
        </div>
      ))}
    </div>
  );
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
  const pctMovil = s && s.total > 0 ? Math.round((s.moviles / s.total) * 100) : 0;
  const maxDia = Math.max(1, ...(s?.por_dia ?? []).map((d) => d.visitas));

  return (
    <>
      <div className="cab-vista">
        <div>
          <h1>Visitas del blog</h1>
          <div className="sub">Cuántas personas leen, qué leen, desde dónde y por qué canal llegan</div>
        </div>
        <span className="espacio" />
        <div className="grupo" role="group" aria-label="Periodo">
          {[7, 30, 90].map((d) => (
            <Link key={d} className={`f-chip${dias === d ? " activo" : ""}`} href={`/superadmin/web/visitas?dias=${d}`}>{d} días</Link>
          ))}
        </div>
        <Link className="btn contorno" href="/superadmin/web">Volver</Link>
      </div>

      {error && <div className="aviso error">Las visitas aún no están activas: falta ejecutar el último ACTUALIZAR_BASE.sql en Supabase.</div>}

      {s && (
        <>
          <div className="kpis">
            <div className="kpi azul"><span className="k-et">Visitas</span><span className="k-val">{num(s.total)}</span><span className="k-det">últimos {dias} días</span></div>
            <div className="kpi"><span className="k-et">Visitantes únicos</span><span className="k-val">{num(s.unicos)}</span><span className="k-det">contados por día</span></div>
            <div className="kpi"><span className="k-et">Artículo más leído</span><span className="k-val" style={{ fontSize: 16, lineHeight: 1.3 }}>{masLeido ? masLeido.titulo : "—"}</span><span className="k-det">{masLeido ? `${num(masLeido.visitas)} visitas` : "sin visitas todavía"}</span></div>
            <div className="kpi"><span className="k-et">Desde celular</span><span className="k-val">{pctMovil}%</span><span className="k-det">{num(s.moviles)} de {num(s.total)} visitas</span></div>
          </div>

          <div className="panel" style={{ marginTop: 14 }}>
            <div className="panel-cab">Visitas por día</div>
            <div className="panel-cuerpo">
              {s.por_dia.length === 0 ? (
                <div className="tenue">Aún no hay visitas en este periodo.</div>
              ) : (
                <div style={{ display: "flex", alignItems: "flex-end", gap: 3, height: 130, overflowX: "auto" }}>
                  {s.por_dia.map((d) => (
                    <div key={d.dia} title={`${d.dia}: ${d.visitas} visitas, ${d.unicos} únicos`} style={{ flex: "1 0 14px", minWidth: 14, display: "flex", flexDirection: "column", justifyContent: "flex-end", alignItems: "center", gap: 4, height: "100%" }}>
                      <span style={{ fontSize: 10.5, color: "var(--tenue)" }}>{d.visitas}</span>
                      <div style={{ width: "100%", height: `${Math.max(4, (d.visitas / maxDia) * 90)}px`, background: "var(--primario)", borderRadius: "4px 4px 0 0" }} />
                      <span style={{ fontSize: 10, color: "var(--tenue)" }}>{d.dia.slice(8, 10)}/{d.dia.slice(5, 7)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="panel" style={{ marginTop: 14 }}>
            <div className="panel-cab">Artículos <span className="tenue pequeno">· la portada del blog tuvo {num(s.portada)} visitas</span></div>
            <div className="tabla-marco" style={{ border: "none", borderRadius: 0 }}>
              <table className="tabla">
                <thead><tr><th>Artículo</th><th className="num">Visitas</th><th className="num">Únicos</th><th className="num">Celular</th></tr></thead>
                <tbody>
                  {s.articulos.length === 0 && <tr><td colSpan={4} className="tenue">Aún no hay visitas a artículos.</td></tr>}
                  {s.articulos.map((a) => (
                    <tr key={a.id}>
                      <td className="envolver"><Link href={`/superadmin/web/blog/${a.id}`}>{a.titulo}</Link><div className="tenue pequeno">/blog/{a.slug}</div></td>
                      <td className="num">{num(a.visitas)}</td>
                      <td className="num">{num(a.unicos)}</td>
                      <td className="num">{a.visitas > 0 ? Math.round((a.moviles / a.visitas) * 100) : 0}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 14, marginTop: 14 }}>
            <div className="panel"><div className="panel-cab">Países</div><div className="panel-cuerpo"><Barras filas={s.paises.map((p) => ({ et: nombrePais(p.pais), n: p.visitas }))} /></div></div>
            <div className="panel"><div className="panel-cab">Regiones</div><div className="panel-cuerpo"><Barras filas={s.regiones.map((r) => ({ et: nombreRegion(r.pais, r.region), n: r.visitas }))} /></div></div>
            <div className="panel"><div className="panel-cab">Ciudades</div><div className="panel-cuerpo"><Barras filas={s.ciudades.map((c) => ({ et: c.ciudad === "?" ? "Sin dato" : `${c.ciudad}${c.pais && c.pais !== "PE" && c.pais !== "?" ? ` (${nombrePais(c.pais)})` : ""}`, n: c.visitas }))} /></div></div>
            <div className="panel"><div className="panel-cab">Por qué canal llegan</div><div className="panel-cuerpo"><Barras filas={s.canales.map((c) => ({ et: CANALES[c.canal] ?? c.canal, n: c.visitas }))} /></div></div>
          </div>

          <div className="aviso info" style={{ marginTop: 14 }}>
            <b>Cómo leer esto.</b> La ubicación se calcula por la dirección de internet y es aproximada: en celulares, la ciudad puede ser la del proveedor (por ejemplo Lima) y no la de la persona. No se guarda la IP, solo un código que cambia cada día, por eso «únicos» cuenta personas por día. Los robots de Google y de vistas previas no se cuentan.
            <br />
            <b>Para no contar sus propias visitas:</b> abra una sola vez <code>{dominio}/?sin_conteo=1</code> en cada navegador o celular que use (con <code>?sin_conteo=0</code> vuelve a contar).
          </div>
        </>
      )}
    </>
  );
}
