import PantallaLogin, { type DatosLoginMcp } from "@/components/PantallaLogin";
import { supabaseServidor } from "@/lib/supabase/server";

/** Ingreso propio de una municipalidad: /login/<su RUC>. */
export default async function LoginMcp({ params, searchParams }: { params: Promise<{ ruc: string }>; searchParams: Promise<{ error?: string }> }) {
  const [{ ruc }, { error }] = await Promise.all([params, searchParams]);
  const limpio = ruc.replace(/\D/g, "").slice(0, 11);
  let mcp: DatosLoginMcp = null;
  if (limpio) {
    const supabase = await supabaseServidor();
    const { data } = await supabase.rpc("mcp_para_login", { p_ruc: limpio });
    mcp = (Array.isArray(data) ? data[0] : data) ?? null;
  }
  return <PantallaLogin error={error} mcp={mcp} desde={`/login/${limpio}`} />;
}
