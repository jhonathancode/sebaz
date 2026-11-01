import { redirect } from "next/navigation";
import { obtenerContexto } from "@/lib/contexto";
import Inicio from "./inicio/page";

// El inicio del sistema vive en la raíz («/»), sin «/inicio» en la dirección
export default async function Raiz() {
  const ctx = await obtenerContexto();
  if (ctx.esSuperadmin) redirect("/superadmin/inicio");
  if (ctx.mcp) return <Inicio />;
  if (ctx.esSoporte) redirect("/soporte");
  redirect("/sin-acceso");
}
