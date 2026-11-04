import { NextResponse } from "next/server";
import { enviarPush, pushDisponible } from "@/lib/push";
import { supabaseServicio, supabaseServidor } from "@/lib/supabase/server";

/** Manda un aviso de prueba a los celulares de quien lo pide. */
export async function POST() {
  const sb = await supabaseServidor();
  const { data } = await sb.auth.getUser();
  if (!data.user) return NextResponse.json({ error: "Sin sesión" }, { status: 401 });
  if (!pushDisponible()) return NextResponse.json({ error: "Los avisos al celular aún no están configurados en el servidor." }, { status: 503 });
  const svc = supabaseServicio();
  const { data: subs } = await svc.from("push_suscripciones").select("endpoint, p256dh, auth").eq("user_id", data.user.id).eq("activa", true);
  if (!subs?.length) return NextResponse.json({ error: "Este celular aún no tiene los avisos activados." }, { status: 404 });
  let enviados = 0;
  for (const s of subs) {
    const r = await enviarPush(s, { title: "ZEBAZ", body: "Prueba: así le llegarán los avisos.", url: "/", tag: "prueba" });
    if (r === "ok") enviados++;
    if (r === "gone") await svc.from("push_suscripciones").update({ activa: false }).eq("endpoint", s.endpoint);
  }
  return enviados ? NextResponse.json({ ok: true, enviados }) : NextResponse.json({ error: "No se pudo enviar. Vuelva a activar los avisos." }, { status: 502 });
}
