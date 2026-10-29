"use client";

import { createContext, useContext } from "react";

const Contexto = createContext<{ nombre: string; exigirPin: boolean }>({ nombre: "", exigirPin: false });

/** Primer nombre de quien está usando el sistema, para saludarlo al pedirle el PIN. */
export function primerNombre(nombre: string): string {
  const p = nombre.trim().split(/\s+/)[0] ?? "";
  if (!p || p.includes("@")) return "";
  return p.charAt(0).toUpperCase() + p.slice(1).toLowerCase();
}

export function UsuarioProvider({ nombre, exigirPin = false, children }: { nombre: string; exigirPin?: boolean; children: React.ReactNode }) {
  return <Contexto.Provider value={{ nombre: primerNombre(nombre), exigirPin }}>{children}</Contexto.Provider>;
}

export function usePrimerNombre(): string {
  return useContext(Contexto).nombre;
}

/** true si la MCP activó el PIN en Configuración. */
export function useExigirPin(): boolean {
  return useContext(Contexto).exigirPin;
}
