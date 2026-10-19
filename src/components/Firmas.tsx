/** Líneas de firma al pie de los formatos impresos. */
export default function Firmas({ nombres }: { nombres: string[] }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-around", gap: 24, marginTop: 56, flexWrap: "wrap" }}>
      {nombres.map((n) => (
        <div key={n} style={{ textAlign: "center", minWidth: 180 }}>
          <div style={{ borderTop: "1px solid #1b2329", paddingTop: 4 }} className="pequeno">
            {n}
          </div>
        </div>
      ))}
    </div>
  );
}
