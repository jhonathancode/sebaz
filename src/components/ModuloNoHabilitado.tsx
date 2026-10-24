/** Se muestra cuando el superadmin no habilitó este módulo para la MCP. */
export default function ModuloNoHabilitado({ nombre }: { nombre: string }) {
  return (
    <div className="kpi" style={{ maxWidth: 640, margin: "40px auto", gap: 10 }}>
      <span className="k-et">Módulo no habilitado</span>
      <span className="k-val">{nombre}</span>
      <span className="k-det">Este módulo no está incluido en el servicio de su municipalidad. Para habilitarlo, comuníquese con soporte.</span>
    </div>
  );
}
