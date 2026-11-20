"use client";
import CampoDocumento from "@/components/CampoDocumento";

import { useState } from "react";
import AutoDocumento from "@/components/AutoDocumento";
import InputFecha from "@/components/InputFecha";
import CampoArchivoEstado from "@/components/formularios/CampoArchivoEstado";
import { DESCRIPCIONES_ARCHIVO, TIPOS_RC, type RegistroCivil } from "@/lib/registroCivil";

const MAY = { textTransform: "uppercase" } as const;
const ETIQUETA_FECHA: Record<string, string> = {
  nacimiento: "Fecha de nacimiento",
  matrimonio: "Fecha del matrimonio",
  defuncion: "Fecha de fallecimiento",
  otro: "Fecha del hecho",
};
const ICONO: Record<string, string> = { nacimiento: "👶", matrimonio: "💍", defuncion: "🕊️", otro: "📄" };

function Seccion({ titulo, ayuda, children }: { titulo: string; ayuda?: string; children: React.ReactNode }) {
  return (
    <fieldset className="rc-seccion">
      <legend>{titulo}</legend>
      {ayuda && <p className="rc-ayuda">{ayuda}</p>}
      <div className="rc-rejilla">{children}</div>
    </fieldset>
  );
}

/** Campos de un registro del padrón (alta y corrección), ordenados por secciones. Con conArchivo se adjunta la partida al crear. */
export default function CamposRegistro({ r, conArchivo }: { r?: RegistroCivil; conArchivo?: boolean }) {
  const [tipo, setTipo] = useState(r?.tipo ?? "nacimiento");
  return (
    <div className="rc-form">
      {r && <input type="hidden" name="id" value={r.id} />}

      <div className="rc-tipos-form" role="radiogroup" aria-label="Tipo de acta">
        {TIPOS_RC.map((t) => (
          <label key={t.codigo} className={`rc-tipo-op${tipo === t.codigo ? " sel" : ""}`}>
            <input type="radio" name="tipo" value={t.codigo} checked={tipo === t.codigo} onChange={() => setTipo(t.codigo)} />
            <span aria-hidden="true">{ICONO[t.codigo]}</span>
            {t.nombre}
          </label>
        ))}
      </div>

      <Seccion titulo={tipo === "matrimonio" ? "Contrayente" : tipo === "defuncion" ? "Persona fallecida" : "Persona inscrita"}>
        <label className="campo">Apellido paterno<input name="apellido_paterno" required defaultValue={r?.apellido_paterno ?? ""} style={MAY} autoComplete="off" autoFocus={!r} /></label>
        <label className="campo">Apellido materno<input name="apellido_materno" defaultValue={r?.apellido_materno ?? ""} style={MAY} autoComplete="off" /></label>
        <label className="campo">Nombres<input name="nombres" required defaultValue={r?.nombres ?? ""} style={MAY} autoComplete="off" /></label>
        <label className="campo">DNI<CampoDocumento name="dni" defaultValue={r?.dni ?? ""} inputMode="numeric" maxLength={8} pattern="[0-9]{8}" title="El DNI tiene 8 dígitos" placeholder="8 dígitos" autoComplete="off" /></label>
        <label className="campo">Sexo
          <select name="sexo" defaultValue={r?.sexo ?? ""}>
            <option value="">No indica</option>
            <option value="M">Masculino</option>
            <option value="F">Femenino</option>
          </select>
        </label>
        <label className="campo">{ETIQUETA_FECHA[tipo]}<InputFecha name="fecha_acto" defaultValue={r?.fecha_acto ?? ""} max={new Date().toLocaleDateString("en-CA", { timeZone: "America/Lima" })} /></label>
        <label className="campo rc-ancho2">Lugar<input name="lugar" defaultValue={r?.lugar ?? ""} style={MAY} placeholder="Centro poblado, anexo o comunidad" autoComplete="off" /></label>
      </Seccion>

      {tipo === "matrimonio" && (
        <Seccion titulo="Cónyuge" ayuda="Si escribe el DNI, el nombre se completa solo cuando la consulta está activada.">
          <label className="campo">DNI del cónyuge<CampoDocumento name="conyuge_dni" defaultValue={r?.conyuge_dni ?? ""} inputMode="numeric" maxLength={8} pattern="[0-9]{8}" title="El DNI tiene 8 dígitos" placeholder="8 dígitos" autoComplete="off" /></label>
          <label className="campo rc-ancho2">Apellidos y nombres del cónyuge<input name="conyuge_nombre" defaultValue={r?.conyuge_nombre ?? ""} style={MAY} autoComplete="off" /></label>
          <div className="rc-ancho3"><AutoDocumento doc="conyuge_dni" nombre="conyuge_nombre" /></div>
        </Seccion>
      )}
      {tipo !== "matrimonio" && (
        <>
          <input type="hidden" name="conyuge_dni" value="" />
          <input type="hidden" name="conyuge_nombre" value="" />
        </>
      )}

      <Seccion titulo="Filiación" ayuda={tipo === "defuncion" ? "Padres de la persona fallecida, si constan." : undefined}>
        <label className="campo rc-ancho"><span>Padre</span><input name="padre" defaultValue={r?.padre ?? ""} style={MAY} placeholder="Apellidos y nombres" autoComplete="off" /></label>
        <label className="campo rc-ancho"><span>Madre</span><input name="madre" defaultValue={r?.madre ?? ""} style={MAY} placeholder="Apellidos y nombres" autoComplete="off" /></label>
      </Seccion>

      <Seccion titulo="Dónde está el acta" ayuda="Estos datos permiten ubicar el documento en el libro o en el archivo físico.">
        <label className="campo">N° de acta<input name="numero_acta" defaultValue={r?.numero_acta ?? ""} style={MAY} autoComplete="off" /></label>
        <label className="campo">N° de expediente<input name="expediente" defaultValue={r?.expediente ?? ""} style={MAY} autoComplete="off" /></label>
        <label className="campo">Origen del dato
          <select name="origen" defaultValue={r?.origen ?? "fisico"}>
            <option value="fisico">Libro físico (hasta 2022)</option>
            <option value="digital">Sistema digital (desde 2022)</option>
          </select>
        </label>
        <label className="campo">Libro<input name="libro" defaultValue={r?.libro ?? ""} style={MAY} autoComplete="off" /></label>
        <label className="campo">Folio<input name="folio" defaultValue={r?.folio ?? ""} style={MAY} autoComplete="off" /></label>
        <label className="campo">Guardado en<input name="ubicacion" defaultValue={r?.ubicacion ?? ""} style={MAY} placeholder="Estante, caja o tomo" autoComplete="off" /></label>
        <label className="campo rc-ancho3">Observaciones<textarea name="observaciones" rows={2} defaultValue={r?.observaciones ?? ""} style={MAY} placeholder="Notas marginales, rectificaciones, etc." /></label>
      </Seccion>

      {conArchivo && (
        <Seccion titulo="Partida escaneada" ayuda="Opcional ahora: también se puede adjuntar después, desde la ficha.">
          <label className="campo">Qué documento es
            <select name="descripcion" defaultValue="Partida">
              {DESCRIPCIONES_ARCHIVO.map((d) => <option key={d}>{d}</option>)}
            </select>
          </label>
          <div className="rc-ancho2">
            <CampoArchivoEstado etiqueta="Foto o PDF" multiple={false} requerido={false} ayuda="PDF o foto (JPG, PNG, WEBP); máximo 4 MB. Las fotos grandes se reducen solas." />
          </div>
        </Seccion>
      )}
    </div>
  );
}
