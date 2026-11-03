import { soles } from "@/lib/formato";

export type FilaAcumulada = { fecha: string; monto: number; celdas: string[] };

/**
 * Cuadro acumulado de todo un año, como si fuera un solo libro: cada registro nuevo entra solo,
 * y el acumulado corriendo. Un solo total, al final.
 */
export default function CuadroAcumulado({ titulo, cabeceras, filas, nota, mesResaltado }: { titulo: string; cabeceras: string[]; filas: FilaAcumulada[]; nota?: string; mesResaltado?: string }) {
  const ordenadas = [...filas].sort((a, b) => a.fecha.localeCompare(b.fecha));
  let acumulado = 0;
  let n = 0;
  const total = ordenadas.reduce((s, f) => s + f.monto, 0);
  const columnas = cabeceras.length + 3;
  return (
    <div className="cc-excel-marco acum-marco">
      <table className="cc-excel">
        <caption>{titulo}</caption>
        <thead>
          <tr>
            <th>N°</th>
            {cabeceras.map((c) => (
              <th key={c}>{c}</th>
            ))}
            <th>Monto S/</th>
            <th>Acumulado S/</th>
          </tr>
        </thead>
        <tbody>
          {ordenadas.length === 0 && (
            <tr>
              <td colSpan={columnas} className="cc-vacio">Aún no hay registros este año. Aparecerán aquí solos conforme se vayan registrando.</td>
            </tr>
          )}
          {ordenadas.map((f) => {
            acumulado = Math.round((acumulado + f.monto) * 100) / 100;
            n += 1;
            return (
              <tr key={n} className={f.fecha.startsWith(mesResaltado ?? "no") ? "acum-mes-actual" : undefined}>
                <td className="c">{n}</td>
                {f.celdas.map((c, i) => (
                  <td key={i}>{c}</td>
                ))}
                <td className="m">{soles(f.monto)}</td>
                <td className="m acum-corre">{soles(acumulado)}</td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr>
            <td colSpan={columnas - 2}>TOTAL ACUMULADO · {ordenadas.length} registro{ordenadas.length === 1 ? "" : "s"}</td>
            <td className="m">{soles(total)}</td>
            <td className="m">{soles(total)}</td>
          </tr>
        </tfoot>
      </table>
      {nota && <p className="pequeno tenue acum-nota">{nota}</p>}
    </div>
  );
}
