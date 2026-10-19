import type { Mcp } from "@/lib/contexto";

/** Encabezado de los formatos impresos con los datos de la MCP. */
export default function Encabezado({ mcp, titulo, numero }: { mcp: Mcp; titulo: string; numero?: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "flex-start" }}>
      <div>
        <div style={{ fontWeight: 600, fontSize: 15, textTransform: "uppercase" }}>{mcp.nombre}</div>
        <div className="pequeno tenue">
          {[mcp.distrito && `Distrito de ${mcp.distrito}`, mcp.provincia && `Provincia de ${mcp.provincia}`].filter(Boolean).join(" · ")}
          {mcp.ruc && ` · RUC ${mcp.ruc}`}
        </div>
      </div>
      <div style={{ textAlign: "right" }}>
        <div style={{ fontWeight: 600, fontSize: 15 }}>{titulo}</div>
        {numero && <div className="pequeno">{numero}</div>}
      </div>
    </div>
  );
}
