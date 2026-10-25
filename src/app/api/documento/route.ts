import { NextResponse, type NextRequest } from "next/server";
import { consultarDocumento } from "@/lib/consultaDocumento";
import { supabaseServidor } from "@/lib/supabase/server";

// Tope de consultas por persona (cuida el cupo del plan de la API): 40 por minuto
const consultas = new Map<string, number[]>();
function dentroDelTope(usuario: string) {
  const ahora = Date.now();
  const recientes = (consultas.get(usuario) ?? []).filter((t) => ahora - t < 60000);
  if (recientes.length >= 40) return false;
  consultas.set(usuario, [...recientes, ahora]);
  return true;
}

/** GET /api/documento?n=<DNI o RUC>: solo para quienes ingresaron al sistema. El token de la API nunca sale del servidor. */
export async function GET(request: NextRequest) {
  const supabase = await supabaseServidor();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims?.sub) return NextResponse.json({ ok: false, codigo: "sin_sesion", mensaje: "Inicie sesión." }, { status: 401 });
  if (!dentroDelTope(String(data.claims.sub))) return NextResponse.json({ ok: false, codigo: "no_disponible", mensaje: "Demasiadas consultas seguidas. Espere un momento." }, { status: 429 });
  const numero = request.nextUrl.searchParams.get("n") ?? "";
  const resultado = await consultarDocumento(numero);
  return NextResponse.json(resultado, { status: resultado.ok ? 200 : resultado.codigo === "no_existe" ? 404 : 200, headers: { "Cache-Control": "private, no-store" } });
}
