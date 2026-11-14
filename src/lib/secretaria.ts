import { MESES } from "@/lib/formato";

/** Cómo se arma cada tipo de documento al imprimirse. */
export type Diseno = "carta" | "memo" | "acuerdo";

export type TipoSec = { clave: string; nombre: string; plural: string; titulo: string; diseno: Diseno };

export const TIPOS_SEC: TipoSec[] = [
  { clave: "oficio", nombre: "Oficio", plural: "Oficios", titulo: "OFICIO", diseno: "carta" },
  { clave: "carta", nombre: "Carta", plural: "Cartas", titulo: "CARTA", diseno: "carta" },
  { clave: "memorando", nombre: "Memorando", plural: "Memorandos", titulo: "MEMORANDO", diseno: "memo" },
  { clave: "informe", nombre: "Informe", plural: "Informes", titulo: "INFORME", diseno: "memo" },
  { clave: "citacion", nombre: "Citación", plural: "Citaciones", titulo: "CITACIÓN", diseno: "carta" },
  { clave: "constancia", nombre: "Constancia", plural: "Constancias", titulo: "CONSTANCIA", diseno: "acuerdo" },
  { clave: "solicitud", nombre: "Solicitud", plural: "Solicitudes", titulo: "SOLICITUD", diseno: "carta" },
  { clave: "acuerdo", nombre: "Acuerdo de consejo", plural: "Acuerdos de consejo", titulo: "ACUERDO DE CONSEJO", diseno: "acuerdo" },
  { clave: "acta", nombre: "Acta de sesión", plural: "Actas de sesión", titulo: "ACTA DE SESIÓN", diseno: "acuerdo" },
  { clave: "resolucion", nombre: "Resolución de alcaldía", plural: "Resoluciones de alcaldía", titulo: "RESOLUCIÓN DE ALCALDÍA", diseno: "acuerdo" },
];

export const tipoSec = (clave: string) => TIPOS_SEC.find((t) => t.clave === clave) ?? TIPOS_SEC[0];

/** «MUNICIPALIDAD CENTRO POBLADO PUERTO YURINAKI» → «MCP-PY». */
export function siglaMcp(nombre: string): string {
  const n = nombre.toUpperCase().trim();
  const m = n.match(/CENTRO\s+POBLADO\s+(.+)$/);
  const resto = (m ? m[1] : n).split(/\s+/).filter((p) => p && !["DE", "DEL", "LA", "LAS", "LOS", "Y", "EL"].includes(p));
  const ini = resto.map((p) => p[0]).join("");
  return m ? `MCP-${ini}` : ini;
}

/** «OFICIO N° 012-2026-MCP-PY» (o «OFICIO N° (se asigna al emitir)» si aún es borrador). */
export function codigoSec(tipo: string, numero: number | null, anio: number, mcpNombre: string): string {
  const t = tipoSec(tipo);
  return numero ? `${t.titulo} N° ${String(numero).padStart(3, "0")}-${anio}-${siglaMcp(mcpNombre)}` : `${t.titulo} N° (se asigna al emitir)`;
}

export const fechaDocumento = (iso: string) => {
  const [a, m, d] = iso.split("-").map(Number);
  return `${d} de ${MESES[m - 1]} de ${a}`;
};

/** Cambia {{MUNICIPALIDAD}}, {{ALCALDE}}, {{LUGAR}}, {{FECHA}} y {{AÑO}} por sus valores. */
export function rellenar(texto: string, v: { municipalidad: string; alcalde: string; lugar: string; fecha: string }): string {
  return texto
    .replace(/\{\{MUNICIPALIDAD\}\}/g, v.municipalidad)
    .replace(/\{\{ALCALDE\}\}/g, v.alcalde || "[NOMBRE DEL ALCALDE]")
    .replace(/\{\{LUGAR\}\}/g, v.lugar)
    .replace(/\{\{FECHA\}\}/g, fechaDocumento(v.fecha))
    .replace(/\{\{AÑO\}\}/g, v.fecha.slice(0, 4));
}

export type ModeloBase = { id: string; tipo: string; nombre: string; detalle: string; asunto: string; cuerpo: string; cargoDestinatario?: string };

const p = (...t: string[]) => t.map((x) => `<p>${x}</p>`).join("");

/** Modelos que vienen con ZEBAZ. Cada MCP los clona y los edita; los suyos propios se guardan aparte. */
export const MODELOS_BASE: ModeloBase[] = [
  {
    id: "oficio-simple", tipo: "oficio", nombre: "Oficio simple", detalle: "Comunicación formal a otra entidad o persona",
    asunto: "[ASUNTO DEL OFICIO]",
    cuerpo: p("Es grato dirigirme a usted para saludarle cordialmente y, a la vez, comunicarle que [EXPONER EL MOTIVO DEL OFICIO].", "Sin otro particular, aprovecho la oportunidad para expresarle las muestras de mi especial consideración y estima."),
  },
  {
    id: "oficio-invitacion", tipo: "oficio", nombre: "Oficio de invitación", detalle: "Invitar a una actividad, sesión o ceremonia",
    asunto: "INVITACIÓN A [ACTIVIDAD]",
    cuerpo: p("Tengo el agrado de dirigirme a usted para expresarle mi cordial saludo y, a la vez, invitarle a participar en [ACTIVIDAD], a realizarse el día [FECHA] a las [HORA] en [LUGAR].", "Su presencia dará realce a esta actividad. Agradezco de antemano la atención al presente."),
  },
  {
    id: "oficio-solicitud-apoyo", tipo: "oficio", nombre: "Oficio solicitando apoyo", detalle: "Pedir apoyo, maquinaria o información a otra entidad",
    asunto: "SOLICITO APOYO CON [DETALLE]",
    cuerpo: p("Me dirijo a usted para saludarle cordialmente y, a la vez, solicitarle su valioso apoyo con [DETALLE DE LO QUE SE SOLICITA], con el fin de [FINALIDAD EN BENEFICIO DEL CENTRO POBLADO].", "Seguro de contar con su atención favorable, hago propicia la ocasión para reiterarle mi consideración."),
  },
  {
    id: "carta-simple", tipo: "carta", nombre: "Carta simple", detalle: "Carta a un particular, institución o comunidad",
    asunto: "[ASUNTO DE LA CARTA]",
    cuerpo: p("Reciba usted un cordial saludo en nombre de {{MUNICIPALIDAD}}.", "Por medio de la presente me dirijo a usted para [EXPONER EL MOTIVO DE LA CARTA].", "Agradeciendo la atención que brinde a la presente, me despido de usted."),
  },
  {
    id: "carta-requerimiento", tipo: "carta", nombre: "Carta de requerimiento", detalle: "Requerir un pago, documento o cumplimiento, con plazo",
    asunto: "REQUERIMIENTO DE [DOCUMENTO O PAGO]",
    cuerpo: p("Por la presente le requerimos que, en un plazo no mayor a [NÚMERO] días calendario contados desde la recepción de esta carta, cumpla con [DETALLE DEL REQUERIMIENTO].", "De no atender lo solicitado en el plazo indicado, esta municipalidad adoptará las acciones que correspondan conforme a ley."),
  },
  {
    id: "memo-simple", tipo: "memorando", nombre: "Memorando", detalle: "Disposición o comunicación interna",
    asunto: "[ASUNTO DEL MEMORANDO]",
    cuerpo: p("Mediante el presente le comunico que [DISPOSICIÓN O COMUNICACIÓN INTERNA].", "Lo que hago de su conocimiento para los fines pertinentes."),
  },
  {
    id: "informe-simple", tipo: "informe", nombre: "Informe", detalle: "Informe con antecedentes, análisis y conclusiones",
    asunto: "INFORME SOBRE [TEMA]",
    cuerpo: p("<b>I. ANTECEDENTES</b>") + p("[DESCRIBIR LOS ANTECEDENTES].") + p("<b>II. ANÁLISIS</b>") + p("[DESARROLLAR EL ANÁLISIS].") + p("<b>III. CONCLUSIONES Y RECOMENDACIONES</b>") + p("[CONCLUSIONES Y RECOMENDACIONES]."),
  },
  {
    id: "citacion-sesion", tipo: "citacion", nombre: "Citación a sesión de consejo", detalle: "Convocar a los regidores a sesión ordinaria o extraordinaria",
    asunto: "CITACIÓN A SESIÓN [ORDINARIA / EXTRAORDINARIA] DE CONSEJO",
    cuerpo: p("Por especial disposición del señor Alcalde, se le cita a la sesión [ORDINARIA / EXTRAORDINARIA] del Consejo Municipal, a realizarse el día [FECHA] a las [HORA], en [LUGAR].") + p("<b>AGENDA:</b>") + "<ol><li>[PUNTO 1]</li><li>[PUNTO 2]</li><li>[PUNTO 3]</li></ol>" + p("Se agradece su puntual asistencia."),
  },
  {
    id: "constancia-simple", tipo: "constancia", nombre: "Constancia", detalle: "Constancia de residencia, posesión, trabajo u otra",
    asunto: "CONSTANCIA DE [RESIDENCIA / POSESIÓN / OTRA]",
    cuerpo: p("EL ALCALDE DE {{MUNICIPALIDAD}}, que suscribe,") + p("<b>HACE CONSTAR:</b>") + p("Que el(la) señor(a) <b>[NOMBRES Y APELLIDOS]</b>, identificado(a) con DNI N° [NÚMERO], [DETALLE DE LO QUE SE CONSTATA].") + p("Se expide la presente a solicitud del interesado(a), para los fines que estime por conveniente."),
  },
  {
    id: "solicitud-simple", tipo: "solicitud", nombre: "Solicitud", detalle: "Solicitud presentada a la autoridad correspondiente",
    asunto: "SOLICITO [LO QUE SE SOLICITA]",
    cuerpo: p("Yo, [NOMBRES Y APELLIDOS], identificado(a) con DNI N° [NÚMERO], con domicilio en [DIRECCIÓN], ante usted me presento y expongo:", "Que, [EXPONER LOS HECHOS]. Por tal motivo, solicito a usted [DETALLE DE LO SOLICITADO].", "Por lo expuesto, ruego a usted acceder a mi petición."),
  },
  {
    id: "acuerdo-consejo", tipo: "acuerdo", nombre: "Acuerdo de consejo", detalle: "Acuerdo con considerandos y parte resolutiva",
    asunto: "ACUERDO QUE [APRUEBA / AUTORIZA / DISPONE] [MATERIA]",
    cuerpo: p("<b>EL CONSEJO MUNICIPAL DE {{MUNICIPALIDAD}}</b>") + p("<b>VISTO:</b>") + p("En Sesión [ORDINARIA / EXTRAORDINARIA] de fecha [FECHA], el tema de [MATERIA]; y,") + p("<b>CONSIDERANDO:</b>") + p("Que, [PRIMER CONSIDERANDO].") + p("Que, [SEGUNDO CONSIDERANDO].") + p("Estando a lo expuesto y con el voto [UNÁNIME / POR MAYORÍA] de los miembros del Consejo Municipal;") + p("<b>ACUERDA:</b>") + p("<b>ARTÍCULO PRIMERO.-</b> [PARTE RESOLUTIVA].") + p("<b>ARTÍCULO SEGUNDO.-</b> ENCARGAR a [ÁREA O PERSONA] el cumplimiento del presente acuerdo.") + p("<b>REGÍSTRESE, COMUNÍQUESE Y CÚMPLASE.</b>"),
  },
  {
    id: "acta-sesion", tipo: "acta", nombre: "Acta de sesión de consejo", detalle: "Acta con asistentes, agenda, desarrollo y acuerdos",
    asunto: "ACTA DE SESIÓN [ORDINARIA / EXTRAORDINARIA] DEL [FECHA]",
    cuerpo: p("En {{LUGAR}}, siendo las [HORA] del día [FECHA], se reunieron en el local de {{MUNICIPALIDAD}} los miembros del Consejo Municipal, bajo la presidencia del señor Alcalde {{ALCALDE}}, para llevar a cabo la sesión [ORDINARIA / EXTRAORDINARIA].") + p("<b>ASISTENTES:</b>") + "<ol><li>[NOMBRE Y CARGO]</li><li>[NOMBRE Y CARGO]</li></ol>" + p("<b>AGENDA:</b>") + "<ol><li>[PUNTO 1]</li><li>[PUNTO 2]</li></ol>" + p("<b>DESARROLLO:</b>") + p("[DESCRIBIR EL DESARROLLO DE LA SESIÓN].") + p("<b>ACUERDOS:</b>") + p("[LISTAR LOS ACUERDOS ADOPTADOS].") + p("No habiendo otro asunto que tratar, se levantó la sesión siendo las [HORA], firmando los presentes en señal de conformidad."),
  },
  {
    id: "resolucion-alcaldia", tipo: "resolucion", nombre: "Resolución de alcaldía", detalle: "Resolución con vistos, considerandos y artículos",
    asunto: "RESOLUCIÓN QUE [APRUEBA / DISPONE / DESIGNA] [MATERIA]",
    cuerpo: p("<b>EL ALCALDE DE {{MUNICIPALIDAD}}</b>") + p("<b>VISTO:</b>") + p("[DOCUMENTOS O HECHOS QUE ORIGINAN LA RESOLUCIÓN]; y,") + p("<b>CONSIDERANDO:</b>") + p("Que, [CONSIDERANDO].") + p("Estando a lo expuesto y en uso de las atribuciones conferidas;") + p("<b>SE RESUELVE:</b>") + p("<b>ARTÍCULO PRIMERO.-</b> [PARTE RESOLUTIVA].") + p("<b>ARTÍCULO SEGUNDO.-</b> [DISPOSICIÓN COMPLEMENTARIA].") + p("<b>REGÍSTRESE, COMUNÍQUESE Y CÚMPLASE.</b>"),
  },
];

/** «MUNICIPALIDAD CENTRO POBLADO PUERTO YURINAKI» → «Puerto Yurinaki». */
export function lugarMcp(nombre: string): string {
  const m = nombre.toUpperCase().match(/CENTRO\s+POBLADO\s+(.+)$/);
  const l = (m ? m[1] : nombre).toLowerCase();
  return l.replace(/(^|\s)(\p{L})/gu, (_, e, c) => e + c.toUpperCase());
}
