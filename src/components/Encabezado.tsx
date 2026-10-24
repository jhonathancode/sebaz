import type { Mcp } from "@/lib/contexto";
import { logoMcp } from "@/lib/formato";

/** Encabezado de los formatos impresos con los datos de la MCP. */
export default function Encabezado({ mcp, titulo, numero }: { mcp: Mcp; titulo: string; numero?: string }) {
  const logo = logoMcp(mcp);
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "flex-start" }}>
      <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {logo && <img src={logo} alt="" style={{ height: 48, width: "auto", maxWidth: 90, objectFit: "contain" }} />}
        <div>
        <div style={{ fontWeight: 600, fontSize: 15, textTransform: "uppercase" }}>{mcp.nombre}</div>
        <div className="pequeno tenue">
          {[mcp.distrito && `Distrito de ${mcp.distrito}`, mcp.provincia && `Provincia de ${mcp.provincia}`].filter(Boolean).join(" · ")}
          {mcp.ruc && ` · RUC ${mcp.ruc}`}
        </div>
        </div>
      </div>
      <div style={{ textAlign: "right" }}>
        <div style={{ fontWeight: 600, fontSize: 15 }}>{titulo}</div>
        {numero && <div className="pequeno">{numero}</div>}
      </div>
    </div>
  );
}
