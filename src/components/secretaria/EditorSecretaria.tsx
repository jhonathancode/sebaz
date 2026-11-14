"use client";

import { useEffect, useRef, useState } from "react";
import InputFecha from "@/components/InputFecha";
import FormatoSecretaria, { type DatosSec } from "@/components/formatos/FormatoSecretaria";
import { tipoSec } from "@/lib/secretaria";
import type { Mcp } from "@/lib/contexto";

const FUENTES = ["Arial", "Times New Roman", "Calibri", "Cambria", "Georgia", "Verdana", "Tahoma", "Courier New"];
const TAMANOS = [9, 10, 11, 12, 13, 14, 16, 18, 20, 24, 28];
const INTERLINEADO = ["1", "1.15", "1.5", "2"];

/** Formulario del documento (izquierda) y la hoja A4 editable con su barra de formato tipo Word (derecha). */
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
  const rango = useRef<Range | null>(null);
  const t = tipoSec(d.tipo);
  const memo = t.diseno === "memo";
  const acuerdo = t.diseno === "acuerdo";
  const campo = (k: keyof DatosSec) => (e: React.ChangeEvent<HTMLInputElement>) => setD((x) => ({ ...x, [k]: e.target.value }));

  // El texto se carga una sola vez; después lo maneja el navegador (así React no borra el formato)
  useEffect(() => {
    if (area.current) area.current.innerHTML = inicial.cuerpo;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Se recuerda dónde estaba el cursor para poder aplicar formato desde las listas y colores
  useEffect(() => {
    const guardar = () => {
      const s = window.getSelection();
      if (s && s.rangeCount && area.current?.contains(s.anchorNode)) rango.current = s.getRangeAt(0).cloneRange();
    };
    document.addEventListener("selectionchange", guardar);
    return () => document.removeEventListener("selectionchange", guardar);
  }, []);

  function sincronizar() {
    setD((x) => ({ ...x, cuerpo: area.current?.innerHTML ?? x.cuerpo }));
  }
  function enfocar() {
    area.current?.focus();
    const s = window.getSelection();
    if (rango.current && s) {
      s.removeAllRanges();
      s.addRange(rango.current);
    }
  }
  function orden(c: string, valor?: string) {
    enfocar();
    document.execCommand("styleWithCSS", false, "true");
    document.execCommand(c, false, valor);
    sincronizar();
  }
  function tamano(pt: string) {
    if (!pt) return;
    enfocar();
    document.execCommand("styleWithCSS", false, "true");
    document.execCommand("fontSize", false, "7");
    const nuevos: HTMLElement[] = [];
    area.current?.querySelectorAll<HTMLElement>('font[size="7"], span[style*="xxx-large"]').forEach((el) => {
      if (el.tagName === "SPAN") {
        el.style.fontSize = `${pt}pt`; // conserva lo demás (negrita, letra…)
        nuevos.push(el);
        return;
      }
      const span = document.createElement("span");
      span.style.fontSize = `${pt}pt`;
      span.innerHTML = el.innerHTML;
      el.replaceWith(span);
      nuevos.push(span);
    });
    // Se vuelve a marcar lo mismo, para seguir dándole formato (como en Word)
    const s = window.getSelection();
    if (s && nuevos.length) {
      const r = document.createRange();
      r.setStartBefore(nuevos[0]);
      r.setEndAfter(nuevos[nuevos.length - 1]);
      s.removeAllRanges();
      s.addRange(r);
      rango.current = r.cloneRange();
    }
    sincronizar();
  }
  function interlineado(v: string) {
    if (!v || !area.current) return;
    enfocar();
    const s = window.getSelection();
    const bloques = Array.from(area.current.querySelectorAll<HTMLElement>("p, div, li, h1, h2, h3")).filter((el) => s?.containsNode(el, true));
    if (bloques.length === 0) area.current.style.lineHeight = v;
    else bloques.forEach((el) => (el.style.lineHeight = v));
    sincronizar();
  }
  function tabla() {
    const celdas = (n: number, tag: string) => Array.from({ length: n }, () => `<${tag}>&nbsp;</${tag}>`).join("");
    const html = `<table><tbody><tr>${celdas(3, "th")}</tr><tr>${celdas(3, "td")}</tr><tr>${celdas(3, "td")}</tr></tbody></table><p><br></p>`;
    orden("insertHTML", html);
  }
  const b = (titulo: string, contenido: React.ReactNode, c: string, valor?: string) => (
    <button type="button" title={titulo} aria-label={titulo} onMouseDown={(e) => e.preventDefault()} onClick={() => orden(c, valor)}>{contenido}</button>
  );

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
          <>
            <label className="campo">{memo ? "Para (A)" : "Destinatario"}<input name="destinatario" value={d.destinatario ?? ""} onChange={campo("destinatario")} placeholder="Nombre de la persona o institución" /></label>
            <label className="campo">Cargo del destinatario<input name="destinatario_cargo" value={d.destinatario_cargo ?? ""} onChange={campo("destinatario_cargo")} placeholder="Ej.: Alcalde Distrital de Perené" /></label>
          </>
        )}
        <label className="campo">{acuerdo ? "Título o sumilla" : "Asunto"}<input name="asunto" value={d.asunto ?? ""} onChange={campo("asunto")} required /></label>
        {!acuerdo && <label className="campo">Referencia (opcional)<input name="referencia" value={d.referencia ?? ""} onChange={campo("referencia")} placeholder="Ej.: Oficio N° 004-2026" /></label>}
        <label className="campo">{memo ? "De (firmante)" : "Firma de"}<input name="firmante" value={d.firmante ?? ""} onChange={campo("firmante")} /></label>
        <label className="campo">Cargo de quien firma<input name="firmante_cargo" value={d.firmante_cargo ?? ""} onChange={campo("firmante_cargo")} /></label>
        <label className="campo">Con copia a (opcional)<input name="con_copia" value={d.con_copia ?? ""} onChange={campo("con_copia")} placeholder="Ej.: Tesorería, Archivo" /></label>
        <p className="pequeno tenue" style={{ margin: 0 }}>El texto se escribe directo sobre la hoja, con la barra de formato de arriba. Lo que está entre [CORCHETES] es lo que debe completar.</p>
        <div className="sec-botones">
          <button type="submit" className="btn primario">Guardar borrador</button>
        </div>
      </div>

      <div className="sec-vista">
        <div className="sec-wordbar" role="toolbar" aria-label="Formato del texto">
          <div className="sw-grupo">
            {b("Deshacer", "↶", "undo")}
            {b("Rehacer", "↷", "redo")}
          </div>
          <div className="sw-grupo">
            <select aria-label="Tipo de letra" defaultValue="" onChange={(e) => { if (e.target.value) orden("fontName", e.target.value); e.target.value = ""; }}>
              <option value="">Letra</option>
              {FUENTES.map((f) => <option key={f} value={f} style={{ fontFamily: f }}>{f}</option>)}
            </select>
            <select aria-label="Tamaño de letra" defaultValue="" onChange={(e) => { tamano(e.target.value); e.target.value = ""; }}>
              <option value="">Tamaño</option>
              {TAMANOS.map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </div>
          <div className="sw-grupo">
            {b("Negrita", <b>N</b>, "bold")}
            {b("Cursiva", <i>K</i>, "italic")}
            {b("Subrayado", <u>S</u>, "underline")}
            {b("Tachado", <s>T</s>, "strikeThrough")}
            <label className="sw-color" title="Color de letra" onMouseDown={() => { /* conserva la selección */ }}>
              <span style={{ borderBottom: "3px solid #c00" }}>A</span>
              <input type="color" defaultValue="#cc0000" onChange={(e) => orden("foreColor", e.target.value)} aria-label="Color de letra" />
            </label>
            <label className="sw-color" title="Resaltado">
              <span style={{ background: "#fff176", padding: "0 3px" }}>ab</span>
              <input type="color" defaultValue="#fff176" onChange={(e) => orden("hiliteColor", e.target.value)} aria-label="Color de resaltado" />
            </label>
          </div>
          <div className="sw-grupo">
            {b("Alinear a la izquierda", "⇤", "justifyLeft")}
            {b("Centrar", "↔", "justifyCenter")}
            {b("Alinear a la derecha", "⇥", "justifyRight")}
            {b("Justificar", "☰", "justifyFull")}
          </div>
          <div className="sw-grupo">
            {b("Viñetas", "• ≡", "insertUnorderedList")}
            {b("Numeración", "1. ≡", "insertOrderedList")}
            {b("Disminuir sangría", "⇠", "outdent")}
            {b("Aumentar sangría", "⇢", "indent")}
            <select aria-label="Interlineado" defaultValue="" onChange={(e) => { interlineado(e.target.value); e.target.value = ""; }}>
              <option value="">Interlineado</option>
              {INTERLINEADO.map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </div>
          <div className="sw-grupo">
            <button type="button" title="Insertar tabla" aria-label="Insertar tabla" onMouseDown={(e) => e.preventDefault()} onClick={tabla}>▦ Tabla</button>
            {b("Quitar formato", "Tx", "removeFormat")}
          </div>
        </div>
        <div className="mesa">
          <FormatoSecretaria
            d={d}
            mcp={mcp}
            editor={{
              ref: area,
              onInput: (html) => setD((x) => ({ ...x, cuerpo: html })),
              onPaste: (e) => {
                // Se pega solo el texto: así no entra el formato raro de Word
                e.preventDefault();
                document.execCommand("insertText", false, e.clipboardData.getData("text/plain"));
              },
            }}
          />
        </div>
      </div>
    </form>
  );
}
