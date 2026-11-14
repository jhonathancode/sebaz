import type { Mcp } from "@/lib/contexto";
import { logoMcp } from "@/lib/formato";
import { codigoSec, fechaDocumento, lugarMcp, tipoSec } from "@/lib/secretaria";

export type DatosSec = {
  tipo: string;
  numero: number | null;
  anio: number;
  estado?: string;
  fecha: string;
  destinatario: string | null;
  destinatario_cargo: string | null;
  asunto: string | null;
  referencia: string | null;
  cuerpo: string;
  firmante: string | null;
  firmante_cargo: string | null;
  con_copia: string | null;
};

/** Oficio, carta, memorando, acuerdo, acta… tal como se imprime en una hoja A4. */
export type EditorCuerpo = { ref: React.Ref<HTMLDivElement>; onInput: (html: string) => void; onPaste: (e: React.ClipboardEvent<HTMLDivElement>) => void };

export default function FormatoSecretaria({ d, mcp, editor }: { d: DatosSec; mcp: Mcp; editor?: EditorCuerpo }) {
  const logo = logoMcp(mcp);
  const t = tipoSec(d.tipo);
  const lugar = lugarMcp(mcp.nombre);
  const sub = [mcp.distrito && `Distrito de ${mcp.distrito}`, mcp.provincia && `Provincia de ${mcp.provincia}`].filter(Boolean).join(" · ");
  const cuerpo = editor ? (
    <div
      ref={editor.ref}
      className="sec-cuerpo sec-editable"
      contentEditable
      suppressContentEditableWarning
      role="textbox"
      aria-multiline="true"
      aria-label="Contenido del documento"
      spellCheck
      onInput={(e) => editor.onInput((e.currentTarget as HTMLDivElement).innerHTML)}
      onPaste={editor.onPaste}
    />
  ) : (
    <div className="sec-cuerpo" dangerouslySetInnerHTML={{ __html: d.cuerpo }} />
  );
  const firma = (
    <div className="sec-firma">
      <span />
      <b>{(d.firmante ?? "").toUpperCase() || " "}</b>
      <small>{d.firmante_cargo ?? ""}</small>
    </div>
  );
  return (
    <div className="hoja sec-hoja">
      <header className="sec-membrete">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {logo && <img src={logo} alt="" className="sec-logo" />}
        <div>
          <div className="sec-mcp">{mcp.nombre}</div>
          {sub && <div className="sec-sub">{sub}</div>}
          {mcp.ruc && <div className="sec-sub">RUC {mcp.ruc}</div>}
        </div>
      </header>

      <h1 className="sec-titulo">{codigoSec(d.tipo, d.numero, d.anio, mcp.nombre)}</h1>

      {t.diseno === "carta" && (
        <>
          <p className="sec-lugar">{lugar}, {fechaDocumento(d.fecha)}</p>
          <div className="sec-dest">
            <span>Señor(a):</span>
            <b>{(d.destinatario ?? "").toUpperCase()}</b>
            {d.destinatario_cargo && <span>{d.destinatario_cargo}</span>}
            <span>Presente.-</span>
          </div>
          <dl className="sec-datos">
            <div><dt>ASUNTO</dt><dd>: {d.asunto}</dd></div>
            {d.referencia && <div><dt>REFERENCIA</dt><dd>: {d.referencia}</dd></div>}
          </dl>
          {cuerpo}
          <p className="sec-despedida">Atentamente,</p>
          {firma}
          {d.con_copia && <p className="sec-cc">c.c.: {d.con_copia}</p>}
        </>
      )}

      {t.diseno === "memo" && (
        <>
          <dl className="sec-datos sec-memo">
            <div><dt>A</dt><dd>: {(d.destinatario ?? "").toUpperCase()}{d.destinatario_cargo && <small> · {d.destinatario_cargo}</small>}</dd></div>
            <div><dt>DE</dt><dd>: {(d.firmante ?? "").toUpperCase()}{d.firmante_cargo && <small> · {d.firmante_cargo}</small>}</dd></div>
            <div><dt>ASUNTO</dt><dd>: {d.asunto}</dd></div>
            {d.referencia && <div><dt>REFERENCIA</dt><dd>: {d.referencia}</dd></div>}
            <div><dt>FECHA</dt><dd>: {lugar}, {fechaDocumento(d.fecha)}</dd></div>
          </dl>
          <hr className="sec-linea" />
          {cuerpo}
          <p className="sec-despedida">Atentamente,</p>
          {firma}
          {d.con_copia && <p className="sec-cc">c.c.: {d.con_copia}</p>}
        </>
      )}

      {t.diseno === "acuerdo" && (
        <>
          {d.asunto && <p className="sec-sumilla">{d.asunto}</p>}
          {cuerpo}
          <p className="sec-lugar sec-lugar-pie">{lugar}, {fechaDocumento(d.fecha)}</p>
          {firma}
          {d.con_copia && <p className="sec-cc">c.c.: {d.con_copia}</p>}
        </>
      )}
    </div>
  );
}
