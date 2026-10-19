/** Se muestra al instante mientras el servidor prepara la pantalla. */
export default function Cargando() {
  return (
    <div aria-busy="true" aria-label="Cargando" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div className="esqueleto" style={{ height: 22, width: 260 }} />
      <div className="esqueleto" style={{ height: 56 }} />
      <div className="esqueleto" style={{ height: 36 }} />
      <div className="esqueleto" style={{ height: 36 }} />
      <div className="esqueleto" style={{ height: 36 }} />
      <div className="esqueleto" style={{ height: 36, width: "70%" }} />
    </div>
  );
}
