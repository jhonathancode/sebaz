import Link from "next/link";
import { notFound } from "next/navigation";
import { contextoMcp } from "@/lib/contexto";
import { cargarTutoriales, MODULOS_TUT, videoIncrustado } from "@/lib/tutorialesDb";
import { supabaseServidor } from "@/lib/supabase/server";

/** Una guía en su propia página: el video (si lo hay) y los pasos. */
export default async function Tutorial({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  await contextoMcp();
  const supabase = await supabaseServidor();
  const { filas } = await cargarTutoriales(supabase);
  const t = filas.find((x) => x.slug === slug);
  if (!t) notFound();
  const modulo = MODULOS_TUT.find((m) => m.clave === t.modulo);
  const hermanos = filas.filter((x) => x.modulo === t.modulo);
  const pos = hermanos.findIndex((x) => x.slug === slug);
  const video = videoIncrustado(t.video_url);
  return (
    <>
      <div className="titulo-ventana">
        <Link className="btn" href={`/tutoriales?modulo=${t.modulo}`}>← {modulo?.texto ?? "Tutoriales"}</Link>
        <h1>{t.titulo}</h1>
      </div>
      <div className="tut-pag">
        {video ? (
          <div className="tut-video">
            {video.tipo === "iframe" ? (
              <iframe src={video.src} title={t.titulo} allow="accelerometer; encrypted-media; picture-in-picture; fullscreen" allowFullScreen loading="lazy" referrerPolicy="strict-origin-when-cross-origin" />
            ) : (
              <video src={video.src} controls preload="metadata" />
            )}
          </div>
        ) : (
          <div className="aviso info" style={{ margin: 0 }}>Esta guía aún no tiene video. Siga los pasos de abajo.</div>
        )}
        <section className="panel">
          <div className="panel-cab">Paso a paso</div>
          <div className="panel-cuerpo">
            <ol className="tut-pasos">{t.pasos.map((p) => <li key={p}>{p}</li>)}</ol>
            {t.consejo && <p className="tut-consejo"><b>Consejo:</b> {t.consejo}</p>}
          </div>
        </section>
        <div className="tut-nav">
          {hermanos[pos - 1] ? <Link className="btn contorno" href={`/tutoriales/${hermanos[pos - 1].slug}`}>← {hermanos[pos - 1].titulo}</Link> : <span />}
          {hermanos[pos + 1] ? <Link className="btn contorno" href={`/tutoriales/${hermanos[pos + 1].slug}`}>{hermanos[pos + 1].titulo} →</Link> : <span />}
        </div>
      </div>
    </>
  );
}
