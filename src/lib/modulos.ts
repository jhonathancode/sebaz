/**
 * Módulos que el superadmin habilita por cliente. Cada módulo agrupa sus menús y se marca cuáles ve el cliente.
 * «Expedientes» es el núcleo y siempre está. Se guarda una lista plana de claves en `mcps.modulos`.
 */
export const GRUPOS_MODULOS = [
  {
    clave: "tesoreria", texto: "Tesorería",
    menus: [
      { clave: "rendicion", texto: "Rendición", href: "/rendicion" },
      { clave: "ingresos", texto: "Ingresos", href: "/ingresos" },
      { clave: "caja_chica", texto: "Caja chica", href: "/caja-chica" },
      { clave: "almacen", texto: "Almacén (NEA, PECOSA, kardex)", href: "/almacen" },
    ],
  },
  {
    clave: "registro_civil_mod", texto: "Registro Civil",
    menus: [{ clave: "registro_civil", texto: "Padrón (actas y partidas)", href: "/registro-civil" }],
  },
  {
    clave: "secretaria_mod", texto: "Secretaría",
    menus: [{ clave: "secretaria", texto: "Documentación (oficios, cartas, acuerdos)", href: "/secretaria" }],
  },
  {
    clave: "contable", texto: "Contabilidad",
    menus: [
      { clave: "estados_cuenta", texto: "Estados de cuenta corriente", href: "/contabilidad/estados-cuenta" },
      { clave: "contabilidad", texto: "Libros y resumen", href: "/contabilidad" },
      { clave: "balance_anual", texto: "Balance anual", href: "/contabilidad/balance-anual" },
      { clave: "patrimonio", texto: "Patrimonio (bienes, inventario anual, predios)", href: "/patrimonio" },
    ],
  },
] as const;

/** Lista plana de menús (compatibilidad). */
export const MODULOS = GRUPOS_MODULOS.flatMap((g) => g.menus.map((m) => ({ ...m, grupo: g.clave })));

export type ClaveModulo = (typeof MODULOS)[number]["clave"];
export const TODOS_LOS_MODULOS: ClaveModulo[] = MODULOS.map((m) => m.clave);

/** Marca que indica que la lista ya se guardó por menús (si falta, es un cliente anterior). */
const MARCA = "menus_v2";

type ConModulos = { modulos?: string[] | null } | null | undefined;

/** Si la MCP aún no tiene la columna (base sin actualizar), se asume que tiene todos. */
export function modulosDe(mcp: ConModulos): string[] {
  const lista = mcp?.modulos;
  if (!lista) return TODOS_LOS_MODULOS;
  // Clientes anteriores: con Contabilidad tenían también Balance anual y Estados de cuenta.
  if (!lista.includes(MARCA) && lista.includes("contabilidad")) return [...lista, "balance_anual", "estados_cuenta"];
  return lista;
}

export function tieneModulo(mcp: ConModulos, clave: ClaveModulo) {
  return modulosDe(mcp).includes(clave);
}

/** Módulos opcionales: solo se ven si están marcados de forma expresa. */
export function tieneOpcional(mcp: ConModulos, clave: "registro_civil" | "secretaria") {
  return !!mcp?.modulos?.includes(clave);
}

/** Menús habilitados de un grupo. */
export function menusDeGrupo(mcp: ConModulos, grupo: (typeof GRUPOS_MODULOS)[number]) {
  return grupo.menus.filter((m) => (m.clave === "registro_civil" || m.clave === "secretaria" ? tieneOpcional(mcp, m.clave) : tieneModulo(mcp, m.clave)));
}

/** Lee los menús marcados de un formulario (solo valores válidos) y agrega la marca. */
export function modulosDeFormulario(fd: FormData): string[] {
  const marcados = fd.getAll("modulos").map(String);
  return [...TODOS_LOS_MODULOS.filter((c) => marcados.includes(c)), MARCA];
}
