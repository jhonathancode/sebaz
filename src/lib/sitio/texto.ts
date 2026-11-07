// Funciones de texto sin dependencias del servidor (se usan también en el navegador).
export function slugify(t: string) {
  return t
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 90);
}

export function tiempoLectura(markdown: string) {
  const palabras = markdown.replace(/[#*_`>\-\[\]()!]/g, " ").split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(palabras / 200));
}

export function fechaCorta(iso: string | null) {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("es-PE", { day: "numeric", month: "long", year: "numeric", timeZone: "America/Lima" });
}

export function limpiarTexto(t: string | null | undefined, max = 160) {
  const s = (t ?? "").replace(/\s+/g, " ").trim();
  return s.length > max ? `${s.slice(0, max - 1).trimEnd()}…` : s;
}

/**
 * Un texto pegado suele traer un solo salto de línea entre párrafos y Markdown los uniría en uno.
 * Aquí cada línea suelta pasa a ser su propio párrafo, salvo listas, tablas, citas, código y títulos.
 */
export function normalizarParrafos(md: string) {
  const lineas = (md ?? "").replace(/\r\n?/g, "\n").split("\n");
  const esBloque = (l: string) => /^\s*(#{1,6}\s|[-*+]\s|\d+[.)]\s|>|\||```|~~~|-{3,}\s*$|\*{3,}\s*$)/.test(l);
  const out: string[] = [];
  let codigo = false;
  for (let i = 0; i < lineas.length; i++) {
    const l = lineas[i];
    if (/^\s*(```|~~~)/.test(l)) codigo = !codigo;
    out.push(l);
    if (codigo || !l.trim()) continue;
    const sig = lineas[i + 1];
    if (sig === undefined || !sig.trim()) continue;
    if (esBloque(l) || esBloque(sig) || /^\s{2,}\S/.test(sig)) continue;
    out.push("");
  }
  return out.join("\n");
}
