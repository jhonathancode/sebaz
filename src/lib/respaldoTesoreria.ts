import ExcelJS from "exceljs";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { contextoMcp } from "@/lib/contexto";
import { codigoCP, num3 } from "@/lib/formato";
import { construirHoja, fechaPe, type Columna } from "@/lib/reportes";

type Ctx = Awaited<ReturnType<typeof contextoMcp>>;
type Fila = (string | number | null)[];

const AZUL = "FF2B6FE6";
const celda = (v: unknown) => (v === null || v === undefined ? "" : typeof v === "object" ? JSON.stringify(v) : (v as string | number | boolean));

async function todo<T = Record<string, unknown>>(supabase: SupabaseClient, tabla: string, columnas: string, mcpId: string, orden?: string): Promise<T[]> {
  const filas: T[] = [];
  for (let desde = 0; desde < 100000; desde += 1000) {
    let q = supabase.from(tabla).select(columnas).eq("mcp_id", mcpId);
    if (orden) q = q.order(orden);
    const { data, error } = await q.range(desde, desde + 999);
    if (error) return filas;
    filas.push(...((data ?? []) as T[]));
    if (!data || data.length < 1000) break;
  }
  return filas;
}

function hoja(libro: ExcelJS.Workbook, nombre: string, titulo: string, columnas: Columna[], filas: Fila[], indice: [string, string, number][], mcp: string) {
  const ws = libro.addWorksheet(nombre.slice(0, 31), { views: [{ state: "frozen", ySplit: 4 }] });
  ws.columns = columnas.map((c) => ({ width: c.ancho }));
  ws.getCell(1, 1).value = mcp.toUpperCase();
  ws.getCell(1, 1).font = { bold: true, size: 13 };
  ws.getCell(2, 1).value = titulo;
  ws.getCell(2, 1).font = { color: { argb: "FF444444" } };
  const cab = ws.getRow(4);
  columnas.forEach((c, i) => {
    const x = cab.getCell(i + 1);
    x.value = c.titulo;
    x.font = { bold: true, color: { argb: "FFFFFFFF" } };
    x.fill = { type: "pattern", pattern: "solid", fgColor: { argb: AZUL } };
    x.alignment = { vertical: "middle", horizontal: c.tipo === "monto" || c.tipo === "cantidad" ? "right" : "left", wrapText: true };
  });
  for (const f of filas) {
    const r = ws.addRow(f.map(celda));
    columnas.forEach((c, i) => {
      if (c.tipo === "monto") r.getCell(i + 1).numFmt = "#,##0.00";
    });
  }
  ws.autoFilter = { from: { row: 4, column: 1 }, to: { row: 4, column: columnas.length } };
  indice.push([nombre.slice(0, 31), titulo, filas.length]);
}

/** Todo lo de tesorería de una MCP en un solo Excel: hojas legibles y ordenadas, y al final las tablas tal cual. */
export async function armarRespaldoTesoreria(supabase: SupabaseClient, ctx: Ctx, mcpFila: Record<string, unknown>) {
  const mcp = ctx.mcp;
  const id = mcp.id;
  const libro = new ExcelJS.Workbook();
  libro.creator = "Sistema MCP";
  const indice: [string, string, number][] = [];
  const portada = libro.addWorksheet("ÍNDICE");

  // 1. Datos generales y responsables
  const [fuentes, cuentas, miembros] = await Promise.all([
    todo<{ tipo: string; municipalidad: string; monto_mensual: number; frecuencia: string | null; dia_limite: number | null; activo: boolean }>(supabase, "fuentes", "tipo, municipalidad, monto_mensual, frecuencia, dia_limite, activo", id),
    todo<{ banco: string; numero: string; alias: string | null; activo: boolean }>(supabase, "cuentas_bancarias", "banco, numero, alias, activo", id),
    todo<{ rol: string; cargo: string | null; desde: string | null; hasta: string | null; activo: boolean; perfiles: { nombre: string } | null }>(supabase, "miembros", "rol, cargo, desde, hasta, activo, perfiles(nombre)", id),
  ]);
  const datos: Fila[] = [
    ["Nombre", mcp.nombre, ""], ["RUC", mcp.ruc ?? "", ""], ["Dirección", String(mcpFila.direccion ?? ""), ""],
    ["Distrito / Provincia / Departamento", [mcpFila.distrito, mcpFila.provincia, mcpFila.departamento].filter(Boolean).join(" / "), ""],
    ["Cuenta principal", `${mcpFila.banco_nombre ?? ""} ${mcpFila.banco_cuenta ?? ""}`.trim(), ""],
    ...cuentas.map((c): Fila => ["Cuenta bancaria", `${c.banco} ${c.numero}`, `${c.alias ?? ""}${c.activo ? "" : " (inactiva)"}`]),
    ...fuentes.map((f): Fila => [`Fuente de ingresos (${f.tipo})`, f.municipalidad, `S/ ${Number(f.monto_mensual).toFixed(2)} ${f.frecuencia ?? ""}${f.activo ? "" : " (inactiva)"}`]),
    ...miembros.map((m): Fila => [`Usuario · ${m.rol}`, m.perfiles?.nombre ?? "", `${m.cargo ?? ""} ${m.desde ?? ""} → ${m.hasta ?? "actual"}${m.activo ? "" : " (inactivo)"}`]),
  ];
  hoja(libro, "1 Datos", "Datos de la municipalidad, cuentas, fuentes y responsables", [{ titulo: "Dato", ancho: 36 }, { titulo: "Valor", ancho: 50 }, { titulo: "Detalle", ancho: 50 }], datos, indice, mcp.nombre);

  // 2. Hojas que ya existen en Reportes, de toda la historia
  const sp = new URLSearchParams({ desde: "2000-01-01", hasta: "2100-12-31" });
  const reportes: [string, string, string][] = [["expedientes", "2 Requerimientos", "Todos los requerimientos de gasto"], ["comprobantes", "4 Comprobantes de pago", "Todos los comprobantes de pago"], ["ingresos", "7 Ingresos propios", "Todos los recibos de ingreso"]];
  const hojas = new Map<string, Awaited<ReturnType<typeof construirHoja>>>();
  for (const [lista] of reportes) hojas.set(lista, await construirHoja(lista, ctx, supabase, sp));
  const poner = (lista: string) => {
    const h = hojas.get(lista);
    const r = reportes.find((x) => x[0] === lista)!;
    if (h && !("error" in h)) hoja(libro, r[1], r[2], h.columnas, [...h.filas, ...(h.totales ? [h.totales] : [])], indice, mcp.nombre);
  };
  poner("expedientes");

  // 3. Detalle de ítems con el número de su requerimiento
  const [exps, items] = await Promise.all([
    todo<{ id: string; numero: number; anio: number }>(supabase, "expedientes", "id, numero, anio", id),
    todo<{ expediente_id: string; item: number; cantidad: number; unidad: string; descripcion: string; precio_unitario: number; total: number; anulado: boolean }>(supabase, "expediente_items", "expediente_id, item, cantidad, unidad, descripcion, precio_unitario, total, anulado", id),
  ]);
  const numExp = new Map(exps.map((e) => [e.id, `${num3(e.numero)}-${e.anio}`]));
  hoja(
    libro, "3 Detalle de ítems", "Ítems de cada requerimiento",
    [{ titulo: "Requerimiento", ancho: 14 }, { titulo: "Ítem", ancho: 6 }, { titulo: "Cantidad", ancho: 10, tipo: "cantidad" }, { titulo: "Unidad", ancho: 9 }, { titulo: "Descripción", ancho: 60 }, { titulo: "P. unitario S/", ancho: 14, tipo: "monto" }, { titulo: "Total S/", ancho: 14, tipo: "monto" }, { titulo: "Anulado", ancho: 9 }],
    items.map((i): Fila => [numExp.get(i.expediente_id) ?? "", i.item, Number(i.cantidad), i.unidad, i.descripcion, Number(i.precio_unitario), Number(i.total), i.anulado ? "SÍ" : ""]).sort((a, b) => String(a[0]).localeCompare(String(b[0])) || Number(a[1]) - Number(b[1])),
    indice, mcp.nombre,
  );
  poner("comprobantes");

  // 5. Rendiciones con los comprobantes que incluyen
  const rends = await todo<{ numero: number | null; anio: number; periodo: string; transferencia: number; estado: string; anulado_motivo: string | null; fuentes: { municipalidad: string } | null; rendicion_items: { activo: boolean; comprobantes_pago: { numero: number; origen: string; fecha: string; cheque: string | null; beneficiario: string; concepto: string; importe: number } | null }[] }>(
    supabase, "rendiciones", "numero, anio, periodo, transferencia, estado, anulado_motivo, fuentes(municipalidad), rendicion_items(activo, comprobantes_pago(numero, origen, fecha, cheque, beneficiario, concepto, importe))", id, "periodo",
  );
  const filasR: Fila[] = [];
  for (const r of rends) {
    const cab: Fila = [`${String(r.numero ?? "").padStart(3, "0")}-${r.anio}`, r.periodo, r.fuentes?.municipalidad ?? "", r.estado + (r.anulado_motivo ? ` (${r.anulado_motivo})` : ""), Number(r.transferencia)];
    const its = r.rendicion_items.filter((x) => x.activo && x.comprobantes_pago);
    if (its.length === 0) filasR.push([...cab, "", "", "", "", "", null]);
    for (const x of its) {
      const c = x.comprobantes_pago!;
      filasR.push([...cab, codigoCP(c.numero, c.origen), fechaPe(c.fecha), c.cheque ?? "", c.beneficiario, c.concepto, Number(c.importe)]);
    }
  }
  hoja(
    libro, "5 Rendiciones", "Rendiciones y los comprobantes que incluye cada una",
    [{ titulo: "Rendición", ancho: 11 }, { titulo: "Mes", ancho: 9 }, { titulo: "Fuente", ancho: 34 }, { titulo: "Estado", ancho: 22 }, { titulo: "Transferencia S/", ancho: 15, tipo: "monto" }, { titulo: "N° CP", ancho: 11 }, { titulo: "Fecha", ancho: 11 }, { titulo: "Cheque", ancho: 12 }, { titulo: "Beneficiario", ancho: 32 }, { titulo: "Concepto", ancho: 50 }, { titulo: "Importe S/", ancho: 13, tipo: "monto" }],
    filasR, indice, mcp.nombre,
  );

  // 6. Caja chica de todos los meses
  const cajas = await todo<{ id: string; periodo: string; numero: number | null; monto_fondo: number; numero_cheque: string | null; estado: string }>(supabase, "cajas_chicas", "id, periodo, numero, monto_fondo, numero_cheque, estado", id, "periodo");
  const gastos = await todo<{ caja_id: string; fecha: string; concepto: string; sustento_tipo: string; sustento_numero: string | null; razon_social: string; monto: number; anulado: boolean }>(supabase, "caja_chica_gastos", "caja_id, fecha, concepto, sustento_tipo, sustento_numero, razon_social, monto, anulado", id, "fecha");
  const cajaPor = new Map(cajas.map((c) => [c.id, c]));
  hoja(
    libro, "6 Caja chica", "Gastos de caja chica de todos los meses",
    [{ titulo: "Mes", ancho: 9 }, { titulo: "Fondo S/", ancho: 12, tipo: "monto" }, { titulo: "Cheque", ancho: 12 }, { titulo: "Fecha", ancho: 11 }, { titulo: "Sustento", ancho: 16 }, { titulo: "Razón social", ancho: 32 }, { titulo: "Concepto", ancho: 50 }, { titulo: "Monto S/", ancho: 13, tipo: "monto" }, { titulo: "Anulado", ancho: 9 }],
    gastos.map((g): Fila => { const c = cajaPor.get(g.caja_id); return [c?.periodo ?? "", c ? Number(c.monto_fondo) : null, c?.numero_cheque ?? "", fechaPe(g.fecha), `${g.sustento_tipo} ${g.sustento_numero ?? ""}`.trim(), g.razon_social, g.concepto, Number(g.monto), g.anulado ? "SÍ" : ""]; }).sort((a, b) => String(a[0]).localeCompare(String(b[0])) || String(a[3]).localeCompare(String(b[3]))),
    indice, mcp.nombre,
  );
  poner("ingresos");

  // 8. Pagos fijos, proveedores y almacén
  const [pf, prov] = await Promise.all([
    todo<{ concepto: string; beneficiario: string | null; beneficiario_doc: string | null; monto: number; unidad: string; activo: boolean }>(supabase, "pagos_fijos", "concepto, beneficiario, beneficiario_doc, monto, unidad, activo", id, "concepto"),
    todo<{ tipo_doc: string; num_doc: string; razon_social: string; direccion: string | null; telefono: string | null }>(supabase, "proveedores", "tipo_doc, num_doc, razon_social, direccion, telefono", id, "razon_social"),
  ]);
  hoja(libro, "8 Pagos fijos", "Pagos fijos configurados", [{ titulo: "Concepto", ancho: 40 }, { titulo: "Beneficiario", ancho: 34 }, { titulo: "Documento", ancho: 14 }, { titulo: "Monto S/", ancho: 13, tipo: "monto" }, { titulo: "Unidad", ancho: 10 }, { titulo: "Vigente", ancho: 9 }], pf.map((p): Fila => [p.concepto, p.beneficiario ?? "", p.beneficiario_doc ?? "", Number(p.monto), p.unidad, p.activo ? "SÍ" : "NO"]), indice, mcp.nombre);
  hoja(libro, "9 Proveedores", "Proveedores registrados", [{ titulo: "Tipo", ancho: 7 }, { titulo: "N° documento", ancho: 14 }, { titulo: "Razón social", ancho: 44 }, { titulo: "Dirección", ancho: 44 }, { titulo: "Teléfono", ancho: 14 }], prov.map((p): Fila => [p.tipo_doc, p.num_doc, p.razon_social, p.direccion ?? "", p.telefono ?? ""]), indice, mcp.nombre);
  const alm = await construirHoja("almacen", ctx, supabase, new URLSearchParams({ ver: "stock", filtro: "todos" }));
  if (!("error" in alm)) hoja(libro, "10 Almacén", "Existencias de almacén", alm.columnas, alm.filas, indice, mcp.nombre);

  // 11. Archivos adjuntos (lista; los archivos se guardan en el sistema)
  const adj = await todo<{ expediente_id: string; tipo: string; archivo_path: string; archivo_tipo: string | null; anulado: boolean; creado_en: string }>(supabase, "expediente_adjuntos", "expediente_id, tipo, archivo_path, archivo_tipo, anulado, creado_en", id, "creado_en");
  hoja(libro, "11 Archivos adjuntos", "Lista de archivos adjuntos a los requerimientos", [{ titulo: "Requerimiento", ancho: 14 }, { titulo: "Tipo", ancho: 20 }, { titulo: "Archivo", ancho: 70 }, { titulo: "Formato", ancho: 18 }, { titulo: "Subido", ancho: 12 }, { titulo: "Anulado", ancho: 9 }], adj.map((a): Fila => [numExp.get(a.expediente_id) ?? "", a.tipo, a.archivo_path.split("/").pop() ?? a.archivo_path, a.archivo_tipo ?? "", a.creado_en.slice(0, 10), a.anulado ? "SÍ" : ""]), indice, mcp.nombre);

  // 12. Historial de cambios
  const aud = await todo<{ en: string; user_id: string | null; tabla: string; accion: string; registro_id: string | null }>(supabase, "auditoria", "en, user_id, tabla, accion, registro_id", id, "en");
  const { data: perf } = await supabase.from("perfiles").select("id, nombre").in("id", Array.from(new Set(aud.map((a) => a.user_id).filter(Boolean))) as string[]);
  const nom = new Map((perf ?? []).map((p) => [p.id, p.nombre as string]));
  hoja(libro, "12 Historial", "Quién hizo qué y cuándo", [{ titulo: "Fecha y hora", ancho: 20 }, { titulo: "Usuario", ancho: 30 }, { titulo: "Acción", ancho: 12 }, { titulo: "Tabla", ancho: 24 }, { titulo: "Registro", ancho: 38 }], aud.map((a): Fila => [new Date(a.en).toLocaleString("es-PE", { timeZone: "America/Lima" }), nom.get(a.user_id ?? "") ?? "", a.accion, a.tabla, a.registro_id ?? ""]), indice, mcp.nombre);

  // Índice
  portada.getCell(1, 1).value = mcp.nombre.toUpperCase();
  portada.getCell(1, 1).font = { bold: true, size: 14 };
  portada.getCell(2, 1).value = `${mcp.ruc ? `RUC ${mcp.ruc} · ` : ""}Respaldo de tesorería generado el ${new Date().toLocaleString("es-PE", { timeZone: "America/Lima" })}`;
  portada.addRow([]);
  const cabI = portada.addRow(["Hoja", "Contenido", "Filas"]);
  cabI.eachCell((x) => { x.font = { bold: true, color: { argb: "FFFFFFFF" } }; x.fill = { type: "pattern", pattern: "solid", fgColor: { argb: AZUL } }; });
  indice.forEach(([n, t, f], i) => {
    const r = portada.addRow([n, t, f]);
    r.getCell(1).value = { text: n, hyperlink: `#'${n}'!A1` };
    r.getCell(1).font = { color: { argb: "FF1F5BC7" }, underline: true };
    void i;
  });
  portada.columns = [{ width: 26 }, { width: 60 }, { width: 10 }];
  portada.addRow([]);
  portada.addRow(["Los archivos adjuntos (fotos y PDF) no van dentro del Excel: se piden aparte al administrador del sistema."]);
  return libro;
}
