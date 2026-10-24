/**
 * Ayuda para escribir bien cada cosa del requerimiento: propone el nombre
 * formal (como debe salir en la orden y en el almacén) y su unidad usual.
 * Son solo sugerencias: la persona las acepta con «Usar» o las ignora.
 */
export const UNIDADES = [
  "Unidad", "Docena", "Ciento", "Millar", "Paquete", "Caja", "Bolsa", "Resma", "Rollo", "Juego", "Par", "Frasco", "Galón", "Litro",
  "Kilo", "Gramo", "Metro", "Metro cuadrado", "Servicio", "Mes", "Día", "Hora", "Global", "Dieta", "Pasaje", "Cupón",
];

type Regla = { claves: RegExp; nombre: string; unidad?: string };

const REGLAS: Regla[] = [
  { claves: /papel bond|hojas? bond|bond a4|resma/, nombre: "PAPEL BOND A4 DE 75 G, PAQUETE DE 500 HOJAS", unidad: "Paquete" },
  { claves: /papel higien/, nombre: "PAPEL HIGIÉNICO DE HOJA SIMPLE, PAQUETE DE 40 ROLLOS", unidad: "Paquete" },
  { claves: /papel toalla/, nombre: "PAPEL TOALLA EN ROLLO", unidad: "Rollo" },
  { claves: /lapicer|boligraf/, nombre: "LAPICERO DE TINTA SECA, PUNTA MEDIANA, COLOR AZUL", unidad: "Unidad" },
  { claves: /lapiz|lapices/, nombre: "LÁPIZ DE GRAFITO N° 2", unidad: "Unidad" },
  { claves: /resaltador/, nombre: "RESALTADOR DE PUNTA BISELADA, COLOR AMARILLO", unidad: "Unidad" },
  { claves: /plumon/, nombre: "PLUMÓN PARA PAPEL, PUNTA GRUESA", unidad: "Unidad" },
  { claves: /corrector/, nombre: "CORRECTOR LÍQUIDO TIPO LAPICERO", unidad: "Unidad" },
  { claves: /folder|fólder/, nombre: "FÓLDER MANILA TAMAÑO A4", unidad: "Unidad" },
  { claves: /archivador/, nombre: "ARCHIVADOR DE PALANCA, TAMAÑO OFICIO", unidad: "Unidad" },
  { claves: /sobre manila|sobres/, nombre: "SOBRE MANILA TAMAÑO A4", unidad: "Unidad" },
  { claves: /grapa/, nombre: "GRAPAS 26/6, CAJA DE 5000 UNIDADES", unidad: "Caja" },
  { claves: /engrapador/, nombre: "ENGRAPADOR DE METAL, CAPACIDAD 20 HOJAS", unidad: "Unidad" },
  { claves: /perforador/, nombre: "PERFORADOR DE METAL DE 2 TALADROS", unidad: "Unidad" },
  { claves: /clip/, nombre: "CLIPS DE METAL N° 1, CAJA DE 100 UNIDADES", unidad: "Caja" },
  { claves: /cinta (adhesiva|embalaje)|scotch/, nombre: "CINTA ADHESIVA TRANSPARENTE", unidad: "Rollo" },
  { claves: /cuaderno/, nombre: "CUADERNO CUADRICULADO DE 100 HOJAS", unidad: "Unidad" },
  { claves: /tinta|toner|tóner/, nombre: "TINTA O TÓNER PARA IMPRESORA (INDIQUE MARCA, MODELO Y COLOR)", unidad: "Unidad" },
  { claves: /sello|tampon/, nombre: "SELLO AUTOENTINTABLE (INDIQUE EL TEXTO)", unidad: "Unidad" },
  { claves: /calculadora/, nombre: "CALCULADORA DE ESCRITORIO DE 12 DÍGITOS", unidad: "Unidad" },
  { claves: /lejia|lejía/, nombre: "LEJÍA, BIDÓN DE 4 LITROS", unidad: "Unidad" },
  { claves: /detergente/, nombre: "DETERGENTE EN POLVO, BOLSA DE 1 KG", unidad: "Bolsa" },
  { claves: /escoba/, nombre: "ESCOBA DE CERDAS CON MANGO", unidad: "Unidad" },
  { claves: /trapeador/, nombre: "TRAPEADOR DE ALGODÓN CON MANGO", unidad: "Unidad" },
  { claves: /bolsas? (de )?basura|bolsas? negra/, nombre: "BOLSAS PARA BASURA, COLOR NEGRO, PAQUETE X 10", unidad: "Paquete" },
  { claves: /gasolina|gasohol/, nombre: "COMBUSTIBLE GASOHOL 90 OCTANOS", unidad: "Galón" },
  { claves: /petroleo|diesel|diésel/, nombre: "COMBUSTIBLE DIÉSEL B5", unidad: "Galón" },
  { claves: /pasaje|movilidad/, nombre: "PASAJES Y MOVILIDAD LOCAL", unidad: "Servicio" },
];

const sinTildes = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

export type SugerenciaItem = { nombre?: string; unidad?: string; consejo?: string };

/** Qué proponer para lo que se escribió en «Qué se necesita». */
export function sugerirItem(texto: string): SugerenciaItem | null {
  const t = sinTildes(texto);
  if (t.length < 3) return null;
  const regla = REGLAS.find((r) => r.claves.test(t));
  if (regla) {
    if (sinTildes(regla.nombre) === t) return null;
    return { nombre: regla.nombre, unidad: regla.unidad };
  }
  // Una sola palabra y sin medidas: falta detalle
  if (t.split(/\s+/).length === 1 && !/\d/.test(t)) {
    return { consejo: "Sea más específico: agregue marca, medida, color o uso (por ejemplo: «PAPEL BOND A4 75 G»)." };
  }
  return null;
}
