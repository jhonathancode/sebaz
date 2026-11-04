import { NextResponse } from "next/server";
import { enviarPush, pushDisponible } from "@/lib/push";
import { supabaseServicio } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Lo llama Vercel cada minuto: manda al celular los avisos nuevos de la campanita. */
export async function GET(req: Request) {
  const secreto = process.env.CRON_SECRET;
  if (!secreto || req.headers.get("authorization") !== `Bearer ${secreto}`) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  if (!pushDisponible()) return NextResponse.json({ ok: false, motivo: "Faltan las claves de avisos" }, { status: 503 });

  const svc = supabaseServicio();
  const { data: pend, error } = await svc
    .from("notificaciones")
    .select("id, user_id, tipo, titulo, detalle, enlace, creado_en")
    .is("push_en", null)
    .order("creado_en")
    .limit(100);
  if (error) return NextResponse.json({ ok: false, motivo: "La base aún no tiene la actualización de avisos" }, { status: 500 });
  if (!pend?.length) return NextResponse.json({ ok: true, avisos: 0 });

  const limite = Date.now() - 60 * 60 * 1000; // lo de hace más de una hora ya no se manda: caducó
  const usuarios = [...new Set(pend.filter((n) => new Date(n.creado_en).getTime() >= limite).map((n) => n.user_id))];
  const { data: subs } = usuarios.length
    ? await svc.from("push_suscripciones").select("user_id, endpoint, p256dh, auth").eq("activa", true).in("user_id", usuarios)
    : { data: [] as { user_id: string; endpoint: string; p256dh: string; auth: string }[] };

  const caidos = new Set<string>();
  let enviados = 0;
  for (const n of pend) {
    if (new Date(n.creado_en).getTime() < limite) continue;
    for (const s of (subs ?? []).filter((x) => x.user_id === n.user_id)) {
      const r = await enviarPush(s, { title: n.titulo, body: n.detalle ?? "", url: n.enlace ?? "/", tag: n.id });
      if (r === "ok") enviados++;
      if (r === "gone") caidos.add(s.endpoint);
    }
  }
  await svc.from("notificaciones").update({ push_en: new Date().toISOString() }).in("id", pend.map((n) => n.id));
  if (caidos.size) await svc.from("push_suscripciones").update({ activa: false }).in("endpoint", [...caidos]);
  if (enviados) await svc.from("push_suscripciones").update({ ultimo_envio: new Date().toISOString() }).in("user_id", usuarios).eq("activa", true);
  return NextResponse.json({ ok: true, avisos: pend.length, enviados });
}
