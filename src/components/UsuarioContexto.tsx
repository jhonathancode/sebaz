"use client";

import { createContext, useContext } from "react";

const Contexto = createContext<string>("");

/** Primer nombre de quien está usando el sistema, para saludarlo al pedirle el PIN. */
export function primerNombre(nombre: string): string {
  const p = nombre.trim().split(/\s+/)[0] ?? "";
  if (!p || p.includes("@")) return "";
  return p.charAt(0).toUpperCase() + p.slice(1).toLowerCase();
}

export function UsuarioProvider({ nombre, children }: { nombre: string; children: React.ReactNode }) {
  return <Contexto.Provider value={primerNombre(nombre)}>{children}</Contexto.Provider>;
}

export function usePrimerNombre(): string {
  return useContext(Contexto);
}
