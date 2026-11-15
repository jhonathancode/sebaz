import Avisos, { type ParamsAviso } from "@/components/Avisos";
import VentanaFlotante from "@/components/VentanaFlotante";
import { obtenerContexto } from "@/lib/contexto";
import { cargarTutoriales, MODULOS_TUT, type TutorialFila } from "@/lib/tutorialesDb";
import { supabaseServidor } from "@/lib/supabase/server";
import { guardarTutorial } from "./acciones";

function Campos({ t, modulo }: { t?: TutorialFila; modulo?: string }) {
  return (
    <div className="rejilla-2">
      {t?.id && <input type="hidden" name="id" value={t.id} />}
      <label className="campo ancho">Título<input name="titulo" required defaultValue={t?.titulo ?? ""} placeholder="Ej.: Crear un requerimiento nuevo" /></label>
      <label className="campo">
        Módulo
        <select name="modulo" defaultValue={t?.modulo ?? modulo ?? MODULOS_TUT[0].clave}>
          {MODULOS_TUT.map((m) => <option key={m.clave} value={m.clave}>{m.texto}</option>)}
        </select>
      </label>
      <label className="campo">Orden en el módulo<input name="orden" type="number" min={1} defaultValue={t?.orden ?? ""} placeholder="1, 2, 3…" /></label>
      <label className="campo ancho">
        Pasos (uno por línea)
        <textarea name="pasos" rows={7} required defaultValue={(t?.pasos ?? []).join("\n")} placeholder={"Abra Expedientes.\nPulse «Nuevo requerimiento».\n…"} />
      </label>
      <label className="campo ancho">Consejo (opcional)<input name="consejo" defaultValue={t?.consejo ?? ""} /></label>
      <label className="campo ancho">
        Enlace del video (opcional)
        <input name="video_url" defaultValue={t?.video_url ?? ""} placeholder="Pegue el enlace de YouTube, Vimeo o Google Drive" />
        <span className="pequeno tenue">En YouTube puede subirlo como «No listado»: solo lo ve quien tenga el enlace. En Google Drive, compártalo con «Cualquier persona con el enlace».</span>
      </label>
      <label className="cheque-marca ancho">
        <input type="checkbox" name="publicado" value="1" defaultChecked={t ? t.publicado : true} />
        <span><b>Visible para las municipalidades</b><small>Si lo desmarca, la guía se oculta pero no se borra.</small></span>
      </label>
    </div>
  );
}

/** Superadmin: administra las guías y videos que ven todas las municipalidades. */
export default async function SuperTutoriales({ searchParams }: { searchParams: ParamsAviso }) {
  const sp = await searchParams;
  const ctx = await obtenerContexto();
  if (!ctx.esSuperadmin) return <div className="aviso error">Esta pantalla es solo para el dueño del sistema.</div>;
  const supabase = await supabaseServidor();
  const { filas, enBase } = await cargarTutoriales(supabase, false);
  return (
    <>
      <div className="cab-vista">
        <div>
          <h1>Tutoriales</h1>
          <div className="sub">Las guías y videos que ven todas las municipalidades, incluidas las nuevas. Lo que cambie aquí se ve de inmediato.</div>
        </div>
        <span className="espacio" />
        {enBase && (
          <VentanaFlotante boton="+ Nueva guía" titulo="Nueva guía" accion={guardarTutorial} textoGuardar="Crear guía" claseBoton="btn primario grande" ancha>
            <Campos />
          </VentanaFlotante>
        )}
      </div>
      <Avisos ok={sp.ok} error={sp.error} />
      {!enBase && <div className="aviso error">Falta la actualización de la base de datos (TUTORIALES.sql) para administrar los tutoriales desde aquí. Mientras tanto, las municipalidades ven las guías de fábrica.</div>}
      {enBase && MODULOS_TUT.map((m) => {
        const lista = filas.filter((f) => f.modulo === m.clave);
        return (
          <section key={m.clave} className="rep-grupo" style={{ marginBottom: 14 }}>
            <h2 className="rep-grupo-tit"><span aria-hidden="true">{m.icono}</span> {m.texto} · {lista.length}</h2>
            {lista.length === 0 && <div className="rep-fila"><span className="tenue pequeno">Sin guías en este módulo.</span></div>}
            {lista.map((t) => (
              <div key={t.slug} className="rep-fila" style={{ opacity: t.publicado ? 1 : 0.55 }}>
                <span className="rep-fila-texto">
                  <b>{t.titulo}</b>
                  <small>{t.pasos.length} pasos · {t.video_url ? "▶ con video" : "sin video"}{t.publicado ? "" : " · oculta"}</small>
                </span>
                <VentanaFlotante boton="Editar" titulo={`Editar: ${t.titulo}`} accion={guardarTutorial} textoGuardar="Guardar cambios" claseBoton="btn chico contorno" ancha>
                  <Campos t={t} />
                </VentanaFlotante>
              </div>
            ))}
          </section>
        );
      })}
    </>
  );
}
