import webpush from "web-push";

export type SuscripcionPush = { endpoint: string; p256dh: string; auth: string };
export type CargaPush = { title: string; body: string; url: string; tag?: string };

let listo = false;
/** Prepara las claves VAPID. Devuelve false si faltan en las variables de entorno. */
export function pushDisponible(): boolean {
  const pub = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  if (!pub || !priv) return false;
  if (!listo) {
    webpush.setVapidDetails(process.env.VAPID_SUBJECT || process.env.APP_URL || "https://sebaz-five.vercel.app", pub, priv);
    listo = true;
  }
  return true;
}

/** Manda un aviso a un dispositivo. Devuelve «gone» si el dispositivo ya no existe (hay que darlo de baja). */
export async function enviarPush(s: SuscripcionPush, carga: CargaPush): Promise<"ok" | "gone" | "error"> {
  try {
    await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify(carga), { TTL: 3600, urgency: "high" });
    return "ok";
  } catch (e) {
    const code = (e as { statusCode?: number }).statusCode;
    return code === 404 || code === 410 ? "gone" : "error";
  }
}
