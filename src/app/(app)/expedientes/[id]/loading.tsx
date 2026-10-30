/** Se muestra al instante mientras el servidor prepara el expediente: la misma forma de la pantalla, sin saltos. */
export default function CargandoExpediente() {
  return (
    <div aria-busy="true" aria-label="Cargando el expediente" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div className="esqueleto" style={{ height: 30, width: 320 }} />
      <div className="esqueleto" style={{ height: 96, borderRadius: 14 }} />
      <div className="esqueleto" style={{ height: 420, borderRadius: 14 }} />
    </div>
  );
}
