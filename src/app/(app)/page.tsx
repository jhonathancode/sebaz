import { redirect } from "next/navigation";
import { obtenerContexto } from "@/lib/contexto";

export default async function Inicio() {
  const ctx = await obtenerContexto();
  if (ctx.mcp) redirect("/expedientes");
  if (ctx.esSoporte) redirect("/soporte");
  redirect("/sin-acceso");
}
