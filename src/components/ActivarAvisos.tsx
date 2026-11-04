"use client";

import { useEffect, useState } from "react";

type Estado = "cargando" | "sin-clave" | "no-soportado" | "bloqueado" | "inactivo" | "activo";

const CLAVE = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";

function aBytes(base64: string) {
  const relleno = "=".repeat((4 - (base64.length % 4)) % 4);
  const bin = atob((base64 + relleno).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

/**
 * Activa los avisos en este celular (notificaciones push). Con «invitar» solo aparece mientras
 * estén desactivados, como una invitación corta; sin él, muestra el control completo (cuenta).
 */
export default function ActivarAvisos({ invitar = false }: { invitar?: boolean }) {
  const [estado, setEstado] = useState<Estado>("cargando");
  const [msg, setMsg] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  useEffect(() => {
    let vivo = true;
    (async () => {
      if (!CLAVE) return vivo && setEstado("sin-clave");
      if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) return vivo && setEstado("no-soportado");
      if (Notification.permission === "denied") return vivo && setEstado("bloqueado");
      const reg = await navigator.serviceWorker.getRegistration("/sw.js");
      const sub = await reg?.pushManager.getSubscription();
      if (vivo) setEstado(sub && Notification.permission === "granted" ? "activo" : "inactivo");
    })().catch(() => vivo && setEstado("no-soportado"));
    return () => {
      vivo = false;
    };
  }, []);

  async function activar() {
    setOcupado(true);
    setMsg(null);
    try {
      const permiso = await Notification.requestPermission();
      if (permiso !== "granted") {
        setEstado(permiso === "denied" ? "bloqueado" : "inactivo");
        return;
      }
      await navigator.serviceWorker.register("/sw.js");
      const reg = await navigator.serviceWorker.ready;
      const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: aBytes(CLAVE) }));
      const r = await fetch("/api/push/suscribir", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(sub.toJSON()) });
      if (!r.ok) throw new Error();
      setEstado("activo");
      setMsg("Listo. Le llegarán los avisos a este celular.");
    } catch {
      setMsg("No se pudo activar. Inténtelo de nuevo.");
    } finally {
      setOcupado(false);
    }
  }

  async function desactivar() {
    setOcupado(true);
    setMsg(null);
    try {
      const reg = await navigator.serviceWorker.getRegistration("/sw.js");
      const sub = await reg?.pushManager.getSubscription();
      if (sub) {
        await fetch("/api/push/suscribir", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ endpoint: sub.endpoint }) });
        await sub.unsubscribe();
      }
      setEstado("inactivo");
      setMsg("Avisos desactivados en este celular.");
    } catch {
      setMsg("No se pudo desactivar. Inténtelo de nuevo.");
    } finally {
      setOcupado(false);
    }
  }

  async function probar() {
    setOcupado(true);
    setMsg(null);
    try {
      const r = await fetch("/api/push/probar", { method: "POST" });
      const d = (await r.json().catch(() => ({}))) as { error?: string };
      setMsg(r.ok ? "Aviso de prueba enviado: debería llegarle en unos segundos." : (d.error ?? "No se pudo enviar la prueba."));
    } catch {
      setMsg("No se pudo enviar la prueba.");
    } finally {
      setOcupado(false);
    }
  }

  if (estado === "cargando" || estado === "sin-clave") return null;
  if (invitar && estado !== "inactivo") return null;

  const texto: Record<Exclude<Estado, "cargando" | "sin-clave">, string> = {
    activo: "Los avisos están activados en este celular: le suena cuando hay algo por aprobar.",
    inactivo: "Active los avisos para que le suene el celular cuando haya algo por aprobar.",
    bloqueado: "Los avisos están bloqueados. Permítalos en los ajustes del navegador para este sitio.",
    "no-soportado": "Este navegador no permite avisos. En iPhone, primero instale la app (Compartir → Agregar a inicio); en Android use Chrome.",
  };

  return (
    <div className={`push-caja${invitar ? " invitar" : ""}`}>
      <span className="push-ico" aria-hidden="true">
        <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9a6 6 0 0 1 12 0c0 6 2.5 7.5 2.5 7.5h-17S6 15 6 9Z" /><path d="M10 20a2 2 0 0 0 4 0" /></svg>
      </span>
      <span className="push-txt">
        <span>{msg ?? texto[estado]}</span>
      </span>
      <span className="push-acc">
        {estado === "inactivo" && <button type="button" className="btn primario" onClick={activar} disabled={ocupado}>{ocupado ? "Activando…" : "Activar avisos"}</button>}
        {estado === "activo" && !invitar && (
          <>
            <button type="button" className="btn" onClick={probar} disabled={ocupado}>Enviar prueba</button>
            <button type="button" className="btn contorno" onClick={desactivar} disabled={ocupado}>Desactivar</button>
          </>
        )}
      </span>
    </div>
  );
}
