/** Gastos por función, como los pide el informe de Chanchamayo. */
export const FUNCIONES: { funcion: string; categorias: string[] }[] = [
  {
    funcion: "Administrativa del Estado",
    categorias: [
      "Pago de dietas",
      "Remuneraciones, retribuciones y honorarios",
      "Pago de servicios básicos (agua, electricidad, teléfono, etc.)",
      "Asesorías (contabilidad, administración, legal)",
      "Gastos operativos diversos",
    ],
  },
  {
    funcion: "Organización, espacio físico y uso del suelo",
    categorias: ["Remuneraciones, retribuciones y honorarios", "Costo de trabajos comunales", "Apoyo comunal para mantenimiento de infraestructuras"],
  },
  {
    funcion: "Saneamiento, salubridad y salud",
    categorias: [
      "Remuneraciones, retribuciones y honorarios",
      "Costo de trabajos comunales",
      "Apoyo comunal en saneamiento, salubridad y salud",
      "Subvenciones de saneamiento, salubridad y salud",
    ],
  },
  {
    funcion: "Abastecimiento, comercialización de productos y servicios",
    categorias: ["Remuneraciones, retribuciones y honorarios", "Costo de trabajos en la materia", "Apoyo comunal en la materia"],
  },
  {
    funcion: "Educación, cultura, deporte y recreación",
    categorias: ["Remuneraciones, retribuciones y honorarios", "Costo de trabajos en la materia", "Apoyo comunal en la materia"],
  },
  {
    funcion: "Programas sociales, defensa y promoción de derechos",
    categorias: [
      "Remuneraciones, retribuciones y honorarios",
      "Costo de trabajos comunales en desarrollo social",
      "Apoyo comunal en desarrollo social",
      "Subvenciones sociales",
    ],
  },
];

export const CLASIFICADORES = [
  "2.1 Personal y obligaciones sociales",
  "2.3 Bienes y servicios",
  "2.5 Otros gastos",
  "2.6 Adquisición de activos no financieros",
];

export const SUSTENTOS: { codigo: string; nombre: string }[] = [
  { codigo: "DJ", nombre: "Declaración jurada" },
  { codigo: "BVE", nombre: "Boleta electrónica" },
  { codigo: "BV", nombre: "Boleta de venta" },
  { codigo: "FAC", nombre: "Factura" },
  { codigo: "RH", nombre: "Recibo por honorarios" },
  { codigo: "REC", nombre: "Recibo" },
  { codigo: "PM", nombre: "Planilla de movilidad" },
  { codigo: "TICKET", nombre: "Ticket" },
];

/** Sustentos de caja chica: primero la declaración jurada y luego solo los comprobantes permitidos por SUNAT. */
export const SUSTENTOS_CAJA: { codigo: string; nombre: string }[] = SUSTENTOS.filter((s) => ["DJ", "BVE", "BV", "FAC", "RH", "TICKET"].includes(s.codigo));

export const RUBROS_INGRESO: { codigo: string; nombre: string }[] = [
  { codigo: "servicio", nombre: "Prestación de servicios" },
  { codigo: "tasa", nombre: "Tasa o derecho" },
  { codigo: "venta", nombre: "Venta de bienes" },
  { codigo: "alquiler", nombre: "Alquileres" },
  { codigo: "otro", nombre: "Otros" },
];

/** Capítulo I del informe de gestión (Perené): se escribe una vez y se copia cada mes. */
export const CAMPOS_CAPITULO1 = [
  { clave: "fecha_creacion", titulo: "Fecha de creación del centro poblado" },
  { clave: "ubicacion", titulo: "Ubicación estimada" },
  { clave: "actividades", titulo: "Principales actividades económicas" },
  { clave: "necesidades", titulo: "Principales necesidades" },
];

export const CAMPOS_CAPITULO1_LARGOS = [
  { clave: "objetivos", titulo: "1.2 Objetivos alcanzados" },
  { clave: "limitaciones", titulo: "1.3 Limitaciones para alcanzar los objetivos" },
  { clave: "medidas", titulo: "1.4 Medidas tomadas para superar las limitaciones" },
];
