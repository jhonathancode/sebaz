import { NextResponse } from "next/server";
import { supabaseServicio, supabaseServidor } from "@/lib/supabase/server";

async function usuario() {
  const sb = await supabaseServidor();
  const { data } = await sb.auth.getUser();
  return data.user;
}

/** Registra este celular para recibir avisos. */
export async function POST(req: Request) {
  const user = await usuario();
  if (!user) return NextResponse.json({ error: "Sin sesión" }, { status: 401 });
  const b = (await req.json().catch(() => null)) as { endpoint?: string; keys?: { p256dh?: string; auth?: string } } | null;
  if (!b?.endpoint?.startsWith("https://") || !b.keys?.p256dh || !b.keys.auth) return NextResponse.json({ error: "Datos incompletos" }, { status: 400 });
  const { error } = await supabaseServicio().from("push_suscripciones").upsert(
    { user_id: user.id, endpoint: b.endpoint, p256dh: b.keys.p256dh, auth: b.keys.auth, agente: (req.headers.get("user-agent") ?? "").slice(0, 200), activa: true },
    { onConflict: "endpoint" },
  );
  if (error) return NextResponse.json({ error: "No se pudo guardar" }, { status: 500 });
  return NextResponse.json({ ok: true });
}

/** Deja de avisar a este celular. */
export async function DELETE(req: Request) {
  const user = await usuario();
  if (!user) return NextResponse.json({ error: "Sin sesión" }, { status: 401 });
  const b = (await req.json().catch(() => null)) as { endpoint?: string } | null;
  if (!b?.endpoint) return NextResponse.json({ error: "Datos incompletos" }, { status: 400 });
  await supabaseServicio().from("push_suscripciones").update({ activa: false }).eq("endpoint", b.endpoint).eq("user_id", user.id);
  return NextResponse.json({ ok: true });
}
