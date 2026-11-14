import InputFecha from "@/components/InputFecha";
import CampoArchivoEstado from "@/components/formularios/CampoArchivoEstado";
import { DESCRIPCIONES_ARCHIVO, TIPOS_RC, type RegistroCivil } from "@/lib/registroCivil";

const MAY = { textTransform: "uppercase" } as const;

/** Campos de un registro del padrón (alta y edición). Con conArchivo se puede adjuntar la partida al crearlo. */
export default function CamposRegistro({ r, conArchivo }: { r?: RegistroCivil; conArchivo?: boolean }) {
  return (
    <>
      {r && <input type="hidden" name="id" value={r.id} />}
      <div className="rejilla-2">
        <label className="campo">Tipo de acta
          <select name="tipo" defaultValue={r?.tipo ?? "nacimiento"}>
            {TIPOS_RC.map((t) => <option key={t.codigo} value={t.codigo}>{t.nombre}</option>)}
          </select>
        </label>
        <label className="campo">Fecha del hecho (nacimiento, matrimonio o defunción)<InputFecha name="fecha_acto" defaultValue={r?.fecha_acto ?? ""} /></label>
        <label className="campo">Apellido paterno<input name="apellido_paterno" required defaultValue={r?.apellido_paterno ?? ""} style={MAY} autoComplete="off" /></label>
        <label className="campo">Apellido materno<input name="apellido_materno" defaultValue={r?.apellido_materno ?? ""} style={MAY} autoComplete="off" /></label>
        <label className="campo">Nombres<input name="nombres" required defaultValue={r?.nombres ?? ""} style={MAY} autoComplete="off" /></label>
        <label className="campo">DNI<input name="dni" defaultValue={r?.dni ?? ""} inputMode="numeric" maxLength={8} placeholder="8 dígitos (si lo tiene)" autoComplete="off" /></label>
        <label className="campo">Sexo
          <select name="sexo" defaultValue={r?.sexo ?? ""}>
            <option value="">—</option>
            <option value="M">Masculino</option>
            <option value="F">Femenino</option>
          </select>
        </label>
        <label className="campo">Lugar<input name="lugar" defaultValue={r?.lugar ?? ""} style={MAY} placeholder="Centro poblado o anexo" autoComplete="off" /></label>
        <label className="campo">Padre<input name="padre" defaultValue={r?.padre ?? ""} style={MAY} autoComplete="off" /></label>
        <label className="campo">Madre<input name="madre" defaultValue={r?.madre ?? ""} style={MAY} autoComplete="off" /></label>
        <label className="campo">Cónyuge (si es matrimonio)<input name="conyuge_nombre" defaultValue={r?.conyuge_nombre ?? ""} style={MAY} autoComplete="off" /></label>
        <label className="campo">DNI del cónyuge<input name="conyuge_dni" defaultValue={r?.conyuge_dni ?? ""} inputMode="numeric" maxLength={8} autoComplete="off" /></label>
      </div>
      <div className="rejilla-2" style={{ marginTop: 12 }}>
        <label className="campo">N° de acta<input name="numero_acta" defaultValue={r?.numero_acta ?? ""} style={MAY} autoComplete="off" /></label>
        <label className="campo">N° de expediente (el que está en físico)<input name="expediente" defaultValue={r?.expediente ?? ""} style={MAY} autoComplete="off" /></label>
        <label className="campo">Libro<input name="libro" defaultValue={r?.libro ?? ""} style={MAY} autoComplete="off" /></label>
        <label className="campo">Folio<input name="folio" defaultValue={r?.folio ?? ""} style={MAY} autoComplete="off" /></label>
        <label className="campo">Dónde está guardado<input name="ubicacion" defaultValue={r?.ubicacion ?? ""} style={MAY} placeholder="Estante, caja o tomo" autoComplete="off" /></label>
        <label className="campo">Origen del dato
          <select name="origen" defaultValue={r?.origen ?? "fisico"}>
            <option value="fisico">Libro físico (hasta 2022)</option>
            <option value="digital">Sistema digital (desde 2022)</option>
          </select>
        </label>
      </div>
      <label className="campo" style={{ marginTop: 12 }}>Observaciones<textarea name="observaciones" rows={2} defaultValue={r?.observaciones ?? ""} style={MAY} /></label>
      {conArchivo && (
        <div style={{ marginTop: 12 }}>
          <label className="campo">Qué documento es
            <select name="descripcion" defaultValue="Partida">
              {DESCRIPCIONES_ARCHIVO.map((d) => <option key={d}>{d}</option>)}
            </select>
          </label>
          <CampoArchivoEstado etiqueta="Partida o constancia escaneada (opcional)" multiple={false} requerido={false} ayuda="PDF o foto (JPG, PNG, WEBP); máximo 4 MB. También puede adjuntarla después, desde la ficha." />
        </div>
      )}
    </>
  );
}
