"use client";

import { useRef, useState } from "react";
import InputFecha from "@/components/InputFecha";
import FormatoSecretaria, { type DatosSec } from "@/components/formatos/FormatoSecretaria";
import { tipoSec } from "@/lib/secretaria";
import type { Mcp } from "@/lib/contexto";

const BOTONES: { t: string; c: string; a: string; titulo: string }[] = [
  { t: "N", c: "bold", a: "", titulo: "Negrita" },
  { t: "K", c: "italic", a: "", titulo: "Cursiva" },
  { t: "S", c: "underline", a: "", titulo: "Subrayado" },
  { t: "•", c: "insertUnorderedList", a: "", titulo: "Viñetas" },
  { t: "1.", c: "insertOrderedList", a: "", titulo: "Numeración" },
  { t: "⇤", c: "justifyLeft", a: "", titulo: "Alinear a la izquierda" },
  { t: "↔", c: "justifyCenter", a: "", titulo: "Centrar" },
  { t: "⇥", c: "justifyRight", a: "", titulo: "Alinear a la derecha" },
  { t: "☰", c: "justifyFull", a: "", titulo: "Justificar" },
];

/** Formulario del documento (a la izquierda) y la hoja A4 en vivo (a la derecha). */
export default function EditorSecretaria({
  accion,
  inicial,
  mcp,
  id,
  numeroBorrador,
}: {
  accion: (fd: FormData) => Promise<void>;
  inicial: DatosSec;
  mcp: Mcp;
  id: string;
  numeroBorrador?: string;
}) {
  const [d, setD] = useState<DatosSec>(inicial);
  const area = useRef<HTMLDivElement>(null);
  const t = tipoSec(d.tipo);
  const memo = t.diseno === "memo";
  const acuerdo = t.diseno === "acuerdo";
  const campo = (k: keyof DatosSec) => (e: React.ChangeEvent<HTMLInputElement>) => setD((x) => ({ ...x, [k]: e.target.value }));

  function orden(c: string) {
    area.current?.focus();
    document.execCommand(c);
    setD((x) => ({ ...x, cuerpo: area.current?.innerHTML ?? x.cuerpo }));
  }

  return (
    <form action={accion} className="sec-editor">
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="cuerpo" value={d.cuerpo} />
      <div className="sec-form">
        <div className="sec-fila">
          <label className="campo">Fecha<InputFecha name="fecha" defaultValue={d.fecha} required onChange={(v) => setD((x) => ({ ...x, fecha: v || x.fecha }))} /></label>
          {numeroBorrador && <span className="sec-num">{numeroBorrador}</span>}
        </div>
        {!acuerdo && (
          <div className="sec-fila">
            <label className="campo">{memo ? "Para (A)" : "Destinatario"}<input name="destinatario" value={d.destinatario ?? ""} onChange={campo("destinatario")} placeholder="Nombre de la persona o institución" /></label>
            <label className="campo">Cargo del destinatario<input name="destinatario_cargo" value={d.destinatario_cargo ?? ""} onChange={campo("destinatario_cargo")} placeholder="Ej.: Alcalde Distrital de Perené" /></label>
          </div>
        )}
        <label className="campo">{acuerdo ? "Título o sumilla" : "Asunto"}<input name="asunto" value={d.asunto ?? ""} onChange={campo("asunto")} required /></label>
        {!acuerdo && <label className="campo">Referencia (opcional)<input name="referencia" value={d.referencia ?? ""} onChange={campo("referencia")} placeholder="Ej.: Oficio N° 004-2026" /></label>}

        <div className="campo">
          <span>Contenido</span>
          <div className="sec-barra" role="toolbar" aria-label="Formato del texto">
            {BOTONES.map((b) => (
              <button key={b.c} type="button" title={b.titulo} aria-label={b.titulo} onMouseDown={(e) => e.preventDefault()} onClick={() => orden(b.c)}>{b.t}</button>
            ))}
          </div>
          <div
            ref={area}
            className="sec-area"
            contentEditable
            suppressContentEditableWarning
            role="textbox"
            aria-multiline="true"
            aria-label="Contenido del documento"
            dangerouslySetInnerHTML={{ __html: inicial.cuerpo }}
            onInput={(e) => setD((x) => ({ ...x, cuerpo: (e.currentTarget as HTMLDivElement).innerHTML }))}
            onPaste={(e) => {
              // Se pega solo el texto: así no entra el formato raro de Word
              e.preventDefault();
              const txt = e.clipboardData.getData("text/plain");
              document.execCommand("insertText", false, txt);
            }}
          />
          <small className="tenue">Los textos entre [CORCHETES] son los que debe completar. Se pega sin formato para que quede limpio.</small>
        </div>

        <div className="sec-fila">
          <label className="campo">{memo ? "De (firmante)" : "Firma de"}<input name="firmante" value={d.firmante ?? ""} onChange={campo("firmante")} /></label>
          <label className="campo">Cargo de quien firma<input name="firmante_cargo" value={d.firmante_cargo ?? ""} onChange={campo("firmante_cargo")} /></label>
        </div>
        <label className="campo">Con copia a (opcional)<input name="con_copia" value={d.con_copia ?? ""} onChange={campo("con_copia")} placeholder="Ej.: Tesorería, Archivo" /></label>

        <div className="sec-botones">
          <button type="submit" className="btn primario">Guardar borrador</button>
        </div>
      </div>
      <div className="sec-vista">
        <div className="mesa">
          <FormatoSecretaria d={d} mcp={mcp} />
        </div>
      </div>
    </form>
  );
}
