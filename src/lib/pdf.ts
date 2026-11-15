/**
 * Arma un PDF A4 con las hojas (".hoja") que se ven en pantalla.
 * Cada hoja empieza en una página nueva; si es larga, sigue en la siguiente.
 * Solo para el navegador.
 */
export async function crearPdf(selector: string, horizontal = false) {
  const hojas = Array.from(document.querySelectorAll<HTMLElement>(selector));
  if (hojas.length === 0) return null;
  // Para el PDF las hojas se capturan a tamaño real, sin la reducción de la vista previa
  document.documentElement.classList.add("pdf-captura");
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  try {
    const [{ default: html2canvas }, { jsPDF }] = await Promise.all([import("html2canvas-pro"), import("jspdf")]);
    let pdf: InstanceType<typeof jsPDF> | null = null;
    const margen = 10;

    for (const hoja of hojas) {
      const lienzo = await html2canvas(hoja, { scale: 2, backgroundColor: "#ffffff", useCORS: true, logging: false });
      // Cada hoja va en su orientación: las anchas en A4 horizontal, el resto vertical
      const horiz = horizontal || lienzo.width > lienzo.height;
      const orientacion = horiz ? "landscape" : "portrait";
      const ancho = (horiz ? 297 : 210) - margen * 2;
      const alto = (horiz ? 210 : 297) - margen * 2;
      const pxPorPagina = Math.floor((lienzo.width * alto) / ancho);
      for (let y = 0; y < lienzo.height; y += pxPorPagina) {
        const trozo = document.createElement("canvas");
        trozo.width = lienzo.width;
        trozo.height = Math.min(pxPorPagina, lienzo.height - y);
        const ctx = trozo.getContext("2d")!;
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, trozo.width, trozo.height);
        ctx.drawImage(lienzo, 0, y, lienzo.width, trozo.height, 0, 0, lienzo.width, trozo.height);
        if (!pdf) pdf = new jsPDF({ unit: "mm", format: "a4", orientation: orientacion });
        else pdf.addPage("a4", orientacion);
        pdf.addImage(trozo.toDataURL("image/jpeg", 0.92), "JPEG", margen, margen, ancho, (trozo.height * ancho) / trozo.width);
      }
    }
    return pdf;
  } finally {
    document.documentElement.classList.remove("pdf-captura");
  }
}

type Pdf = InstanceType<typeof import("jspdf").jsPDF>;

/** Agrega al PDF una imagen completa, centrada y ajustada a una página A4 (vertical u horizontal según la imagen). */
function agregarImagenPagina(pdf: Pdf | null, jsPDF: typeof import("jspdf").jsPDF, lienzo: HTMLCanvasElement): Pdf {
  const horiz = lienzo.width > lienzo.height;
  const orientacion = horiz ? "landscape" : "portrait";
  const margen = 8;
  const maxA = (horiz ? 297 : 210) - margen * 2;
  const maxH = (horiz ? 210 : 297) - margen * 2;
  const escala = Math.min(maxA / lienzo.width, maxH / lienzo.height);
  const w = lienzo.width * escala;
  const h = lienzo.height * escala;
  const doc = pdf ?? new jsPDF({ unit: "mm", format: "a4", orientation: orientacion });
  if (pdf) doc.addPage("a4", orientacion);
  doc.addImage(lienzo.toDataURL("image/jpeg", 0.9), "JPEG", (((horiz ? 297 : 210) - w) / 2), (((horiz ? 210 : 297) - h) / 2), w, h);
  return doc;
}

/**
 * Arma un solo PDF con todo lo que hay en pantalla, en el orden en que aparece:
 * cada ".hoja" (informe, documentos del expediente), cada foto adjunta (".anexo-img")
 * y cada PDF adjunto ("[data-anexo-pdf]", todas sus páginas). Solo para el navegador.
 */
export async function crearPaquete(selector: string, progreso?: (hecho: number, total: number) => void) {
  const nodos = Array.from(document.querySelectorAll<HTMLElement>(selector));
  if (nodos.length === 0) return null;
  document.documentElement.classList.add("pdf-captura");
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  try {
    const [{ default: html2canvas }, { jsPDF }] = await Promise.all([import("html2canvas-pro"), import("jspdf")]);
    let pdf: Pdf | null = null;
    const margen = 10;
    let hecho = 0;
    for (const nodo of nodos) {
      progreso?.(hecho++, nodos.length);
      if (nodo.dataset.anexoPdf) {
        const resp = await fetch(nodo.dataset.anexoPdf);
        const pdfjs = await import("pdfjs-dist");
        pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();
        const doc = await pdfjs.getDocument({ data: new Uint8Array(await resp.arrayBuffer()) }).promise;
        for (let n = 1; n <= doc.numPages; n++) {
          const pagina = await doc.getPage(n);
          const vista = pagina.getViewport({ scale: 1.8 });
          const lienzo = document.createElement("canvas");
          lienzo.width = Math.floor(vista.width);
          lienzo.height = Math.floor(vista.height);
          const c = lienzo.getContext("2d")!;
          c.fillStyle = "#ffffff";
          c.fillRect(0, 0, lienzo.width, lienzo.height);
          await pagina.render({ canvasContext: c, viewport: vista, canvas: lienzo }).promise;
          pdf = agregarImagenPagina(pdf, jsPDF, lienzo);
        }
      } else if (nodo instanceof HTMLImageElement) {
        const resp = await fetch(nodo.src);
        const mapa = await createImageBitmap(await resp.blob());
        const lienzo = document.createElement("canvas");
        lienzo.width = mapa.width;
        lienzo.height = mapa.height;
        const c = lienzo.getContext("2d")!;
        c.fillStyle = "#ffffff";
        c.fillRect(0, 0, lienzo.width, lienzo.height);
        c.drawImage(mapa, 0, 0);
        pdf = agregarImagenPagina(pdf, jsPDF, lienzo);
      } else {
        const lienzo = await html2canvas(nodo, { scale: 2, backgroundColor: "#ffffff", useCORS: true, logging: false });
        const horiz = lienzo.width > lienzo.height;
        const orientacion = horiz ? "landscape" : "portrait";
        const ancho = (horiz ? 297 : 210) - margen * 2;
        const alto = (horiz ? 210 : 297) - margen * 2;
        const pxPorPagina = Math.floor((lienzo.width * alto) / ancho);
        for (let y = 0; y < lienzo.height; y += pxPorPagina) {
          const trozo = document.createElement("canvas");
          trozo.width = lienzo.width;
          trozo.height = Math.min(pxPorPagina, lienzo.height - y);
          const c = trozo.getContext("2d")!;
          c.fillStyle = "#ffffff";
          c.fillRect(0, 0, trozo.width, trozo.height);
          c.drawImage(lienzo, 0, y, lienzo.width, trozo.height, 0, 0, lienzo.width, trozo.height);
          if (!pdf) pdf = new jsPDF({ unit: "mm", format: "a4", orientation: orientacion });
          else pdf.addPage("a4", orientacion);
          pdf.addImage(trozo.toDataURL("image/jpeg", 0.92), "JPEG", margen, margen, ancho, (trozo.height * ancho) / trozo.width);
        }
      }
    }
    progreso?.(nodos.length, nodos.length);
    return pdf;
  } finally {
    document.documentElement.classList.remove("pdf-captura");
  }
}
