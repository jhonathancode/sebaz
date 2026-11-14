import ExcelJS from "exceljs";
import { NextResponse } from "next/server";
import { contextoMcp } from "@/lib/contexto";
import { COLUMNAS_IMPORT } from "@/lib/registroCivil";

export const runtime = "nodejs";

/** Plantilla de Excel para cargar el padrón histórico. */
export async function GET() {
  await contextoMcp();
  const libro = new ExcelJS.Workbook();
  const hoja = libro.addWorksheet("Padrón");
  hoja.addRow([...COLUMNAS_IMPORT]);
  hoja.addRow(["NACIMIENTO", "PEREZ", "ALIAGA", "JUAN CARLOS", "12345678", "M", "15/03/1990", "PUERTO YURINAKI", "0125", "NAC-02", "148", "EXP-0125", "ESTANTE 1 - CAJA 3", "JOSE PEREZ LOPEZ", "ROSA ALIAGA RUIZ", "", "", "EJEMPLO: BORRE ESTA FILA"]);
  hoja.getRow(1).font = { bold: true };
  hoja.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFDCE6F2" } };
  COLUMNAS_IMPORT.forEach((_, i) => (hoja.getColumn(i + 1).width = i < 4 ? 20 : 16));
  hoja.views = [{ state: "frozen", ySplit: 1 }];
  const buf = await libro.xlsx.writeBuffer();
  return new NextResponse(buf as ArrayBuffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": 'attachment; filename="plantilla-padron-registro-civil.xlsx"',
    },
  });
}
