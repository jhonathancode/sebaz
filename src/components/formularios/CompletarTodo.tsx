import { SUSTENTOS } from "@/lib/catalogos";
import CamposProveedor, { type ProveedorConocido } from "./CamposProveedor";

/**
 * Proveedor, conformidad y sustento dentro del mismo requerimiento. Si se llenan, al aprobarlo el
 * alcalde se emiten solos la orden, la conformidad y el comprobante de pago. Solo compras y servicios.
 */
export default function CompletarTodo({ proveedores }: { proveedores: ProveedorConocido[] }) {
  return (
    <details className="pregunta mas-datos solo-compra">
      <summary>Proveedor y comprobante <span className="legend-nota">(opcional: deja todo listo al aprobar)</span></summary>
      <div style={{ marginTop: 10 }}>
        <CamposProveedor proveedores={proveedores} prefijo="req" opcional />
        <div className="rejilla" style={{ marginTop: 10 }}>
          <label className="campo">
            Sustento
            <select name="sustento_tipo" defaultValue="FAC">
              {SUSTENTOS.map((s) => (
                <option key={s.codigo} value={s.codigo}>{s.nombre}</option>
              ))}
            </select>
          </label>
          <label className="campo">N° del sustento<input name="sustento_numero" placeholder="E001-12" /></label>
        </div>
        <label className="opcion-linea" style={{ marginTop: 10 }}>
          <input type="checkbox" name="con_conformidad" value="1" />
          <span>Ya se recibió conforme (se emite también el memorando de conformidad)</span>
        </label>
        <label className="opcion-linea" style={{ marginTop: 8 }}>
          <input type="checkbox" name="completar_todo" value="1" defaultChecked />
          <span>Completar todo apenas el alcalde apruebe: orden, conformidad y comprobante de pago</span>
        </label>
        <p className="pequeno tenue" style={{ margin: "6px 0 0" }}>El monto es el total del detalle. Las compras de bienes se detienen antes del comprobante hasta registrar su entrada al almacén (NEA).</p>
      </div>
    </details>
  );
}
