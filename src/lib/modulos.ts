/** Módulos que el superadmin puede habilitar o quitar por cliente. «Expedientes» es el núcleo y siempre está. */
export const MODULOS = [
  { clave: "caja_chica", texto: "Caja chica", href: "/caja-chica" },
  { clave: "ingresos", texto: "Ingresos", href: "/ingresos" },
  { clave: "almacen", texto: "Almacén (NEA, PECOSA, kardex)", href: "/almacen" },
  { clave: "rendicion", texto: "Rendición", href: "/rendicion" },
  { clave: "contabilidad", texto: "Contabilidad", href: "/contabilidad" },
] as const;

export type ClaveModulo = (typeof MODULOS)[number]["clave"];
export const TODOS_LOS_MODULOS: ClaveModulo[] = MODULOS.map((m) => m.clave);

/** Si la MCP aún no tiene la columna (base sin actualizar), se asume que tiene todos. */
export function modulosDe(mcp: { modulos?: string[] | null } | null | undefined): string[] {
  return mcp?.modulos ?? TODOS_LOS_MODULOS;
}

export function tieneModulo(mcp: { modulos?: string[] | null } | null | undefined, clave: ClaveModulo) {
  return modulosDe(mcp).includes(clave);
}

/** Lee los módulos marcados de un formulario (solo valores válidos). */
export function modulosDeFormulario(fd: FormData): ClaveModulo[] {
  const marcados = fd.getAll("modulos").map(String);
  return TODOS_LOS_MODULOS.filter((c) => marcados.includes(c));
}
