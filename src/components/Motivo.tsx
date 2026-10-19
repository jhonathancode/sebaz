/**
 * Botón que despliega un campo de motivo antes de ejecutar la acción
 * (anular, devolver, reabrir). Funciona sin JavaScript.
 */
export default function Motivo({
  accion,
  boton,
  ayuda,
  campos,
  peligro = true,
}: {
  accion: (fd: FormData) => Promise<void>;
  boton: string;
  ayuda: string;
  campos: Record<string, string>;
  peligro?: boolean;
}) {
  return (
    <details className="no-imprimir" style={{ display: "inline-block" }}>
      <summary className={`btn${peligro ? " peligro" : ""}`} style={{ listStyle: "none" }}>
        {boton}
      </summary>
      <form action={accion} className="panel" style={{ marginTop: 6, padding: 10, display: "flex", flexDirection: "column", gap: 8, maxWidth: 420, background: "#fff" }}>
        {Object.entries(campos).map(([k, v]) => (
          <input key={k} type="hidden" name={k} value={v} />
        ))}
        <label className="campo">
          {ayuda}
          <textarea name="motivo" required minLength={10} placeholder="Mínimo 10 caracteres" />
        </label>
        <button className={`btn${peligro ? " peligro" : " primario"}`} type="submit">
          Confirmar: {boton.toLowerCase()}
        </button>
      </form>
    </details>
  );
}
