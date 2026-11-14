export const TIPOS_RC = [
  { codigo: "nacimiento", nombre: "Nacimiento", corto: "Nac." },
  { codigo: "matrimonio", nombre: "Matrimonio", corto: "Mat." },
  { codigo: "defuncion", nombre: "Defunción", corto: "Def." },
  { codigo: "otro", nombre: "Otro", corto: "Otro" },
] as const;

export const NOMBRE_TIPO_RC: Record<string, string> = Object.fromEntries(TIPOS_RC.map((t) => [t.codigo, t.nombre]));

export const DESCRIPCIONES_ARCHIVO = ["Partida", "Constancia", "Acta", "Otro documento"];

/** Quita tildes y pasa a minúsculas, igual que la búsqueda de la base. */
export const normalizar = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export type RegistroCivil = {
  id: string;
  tipo: string;
  numero_acta: string | null;
  libro: string | null;
  folio: string | null;
  expediente: string | null;
  ubicacion: string | null;
  fecha_acto: string | null;
  lugar: string | null;
  apellido_paterno: string;
  apellido_materno: string | null;
  nombres: string;
  dni: string | null;
  sexo: string | null;
  padre: string | null;
  madre: string | null;
  conyuge_nombre: string | null;
  conyuge_dni: string | null;
  observaciones: string | null;
  origen: string;
  estado: string;
  anulado_motivo: string | null;
};

export const nombreCompleto = (r: Pick<RegistroCivil, "apellido_paterno" | "apellido_materno" | "nombres">) =>
  `${r.apellido_paterno} ${r.apellido_materno ?? ""}, ${r.nombres}`.replace(/\s+,/, ",");

export const COLUMNAS_IMPORT = [
  "TIPO", "APELLIDO PATERNO", "APELLIDO MATERNO", "NOMBRES", "DNI", "SEXO", "FECHA", "LUGAR",
  "N° ACTA", "LIBRO", "FOLIO", "N° EXPEDIENTE", "UBICACIÓN", "PADRE", "MADRE", "CÓNYUGE", "DNI CÓNYUGE", "OBSERVACIONES",
] as const;
