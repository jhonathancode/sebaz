"use client";

import { useEffect, useRef, useState } from "react";
import BotonConfirmar from "@/components/BotonConfirmar";
import InputFecha from "@/components/InputFecha";
import { type DatosSec } from "@/components/formatos/FormatoSecretaria";
import { esLibre, hojaLibreHtml, membreteHtml, sinMarca, textoFecha } from "@/lib/secretaria";
import type { Mcp } from "@/lib/contexto";

const FUENTES = ["Arial", "Times New Roman", "Calibri", "Cambria", "Georgia", "Verdana", "Tahoma", "Courier New"];
const TAMANOS = [9, 10, 11, 12, 13, 14, 16, 18, 20, 24, 28];
const INTERLINEADO = ["1", "1.15", "1.5", "2"];

/** Formulario del documento (izquierda) y la hoja A4 editable con su barra de formato tipo Word (derecha). */
export default function EditorSecretaria({
  accion,
  emitir,
  inicial,
  mcp,
  id,
}: {
  accion: (fd: FormData) => Promise<void>;
  emitir: (fd: FormData) => Promise<void>;
  inicial: DatosSec;
  mcp: Mcp;
  id: string;
  numeroBorrador?: string;
}) {
  const [meta, setMeta] = useState({ cuerpo: "", asunto: inicial.asunto ?? "", destinatario: inicial.destinatario ?? "" });
  const [fecha, setFecha] = useState(inicial.fecha);
  const area = useRef<HTMLDivElement>(null);
  const rango = useRef<Range | null>(null);
  const imagen = useRef<HTMLImageElement | null>(null);
  const archivoImg = useRef<HTMLInputElement>(null);

  // La hoja completa se carga una sola vez; después la maneja el navegador (así React no borra el formato)
  useEffect(() => {
    const el = area.current;
    if (!el) return;
    el.innerHTML = esLibre(inicial.cuerpo) ? sinMarca(inicial.cuerpo) : hojaLibreHtml(inicial, mcp);
    el.querySelectorAll('[data-num="1"]').forEach((n) => n.setAttribute("contenteditable", "false"));
    const f = el.querySelector('[data-campo="fecha"]');
    if (f) f.textContent = textoFecha(inicial.fecha, mcp.nombre);
    sincronizar();
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
    const el = area.current;
    if (!el) return;
    const txt = (sel: string) => el.querySelector(sel)?.textContent?.replace(/\s+/g, " ").trim() ?? "";
    setMeta({ cuerpo: el.innerHTML, asunto: txt('[data-campo="asunto"]').replace(/^:\s*/, ""), destinatario: txt('[data-campo="destinatario"]') });
  }
  function cambiarFecha(v: string) {
    if (!v) return;
    setFecha(v);
    const f = area.current?.querySelector('[data-campo="fecha"]');
    if (f) f.textContent = textoFecha(v, mcp.nombre);
    sincronizar();
  }
  function insertarMembrete() {
    area.current?.insertAdjacentHTML("afterbegin", membreteHtml(mcp));
    sincronizar();
  }
  function elegirImagen(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f || !f.type.startsWith("image/")) return;
    const lector = new FileReader();
    lector.onload = () => {
      const im = new Image();
      im.onload = () => {
        const k = Math.min(1, 800 / im.width);
        const c = document.createElement("canvas");
        c.width = Math.round(im.width * k);
        c.height = Math.round(im.height * k);
        c.getContext("2d")?.drawImage(im, 0, 0, c.width, c.height);
        const png = f.type === "image/png";
        orden("insertImage", c.toDataURL(png ? "image/png" : "image/jpeg", 0.85));
      };
      im.src = String(lector.result);
    };
    lector.readAsDataURL(f);
  }
  function tamanoImagen(factor: number) {
    const im = imagen.current;
    if (!im) return;
    im.style.width = `${Math.max(24, Math.round(im.getBoundingClientRect().width * factor))}px`;
    im.style.height = "auto";
    sincronizar();
  }
  function marcarImagen(e: React.MouseEvent<HTMLDivElement>) {
    imagen.current?.removeAttribute("data-sel");
    const t = e.target as HTMLElement;
    if (t.tagName === "IMG") {
      imagen.current = t as HTMLImageElement;
      t.setAttribute("data-sel", "1");
    } else imagen.current = null;
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
    <form action={accion} className="sec-editor1">
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="cuerpo" value={meta.cuerpo} />
      <input type="hidden" name="asunto" value={meta.asunto} />
      <input type="hidden" name="destinatario" value={meta.destinatario} />
      <div className="sec-barra-sup">
        <label className="campo">Fecha del documento<InputFecha name="fecha" defaultValue={fecha} required onChange={cambiarFecha} /></label>
        <p className="pequeno tenue">Escriba y cambie todo directamente sobre la hoja: membrete, destinatario, asunto, texto y firma. El número se asigna al emitir. Lo que está entre [CORCHETES] es lo que debe completar.</p>
        <button type="submit" className="btn">Guardar borrador</button>
        <BotonConfirmar formAction={emitir} className="btn primario" pregunta="¿Ya terminó el documento?" detalle="Se guardará tal como está y recibirá su número correlativo. Después ya no se puede editar." textoConfirmar="Sí, emitir">Ya terminé · Emitir</BotonConfirmar>
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
            {b("Línea horizontal", "—", "insertHorizontalRule")}
            {b("Quitar formato", "Tx", "removeFormat")}
          </div>
          <div className="sw-grupo">
            <button type="button" title="Insertar imagen o logo" onMouseDown={(e) => e.preventDefault()} onClick={() => archivoImg.current?.click()}>🖼 Imagen</button>
            <button type="button" title="Achicar la imagen marcada" onMouseDown={(e) => e.preventDefault()} onClick={() => tamanoImagen(0.85)}>Img −</button>
            <button type="button" title="Agrandar la imagen marcada" onMouseDown={(e) => e.preventDefault()} onClick={() => tamanoImagen(1.15)}>Img +</button>
            <button type="button" title="Volver a poner el membrete arriba" onMouseDown={(e) => e.preventDefault()} onClick={insertarMembrete}>Membrete</button>
            <input ref={archivoImg} type="file" accept="image/*" hidden onChange={elegirImagen} />
          </div>
        </div>
        <div className="mesa">
          <div
            ref={area}
            className="hoja sec-hoja sec-libre sec-editable"
            contentEditable
            suppressContentEditableWarning
            role="textbox"
            aria-multiline="true"
            aria-label="Documento"
            spellCheck
            onInput={sincronizar}
            onClick={marcarImagen}
            onPaste={(e) => {
              // Se pega solo el texto: así no entra el formato raro de Word
              e.preventDefault();
              document.execCommand("insertText", false, e.clipboardData.getData("text/plain"));
            }}
          />
        </div>
      </div>
    </form>
  );
}
