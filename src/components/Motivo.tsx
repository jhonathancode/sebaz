"use client";

import CampoPin from "@/components/CampoPin";
import { useExigirPin, usePrimerNombre } from "@/components/UsuarioContexto";
import { useRef, useState } from "react";

const MOTIVOS_ANULAR = [
  "Error en la descripción del requerimiento",
  "Error en el monto o en los precios",
  "Se registró dos veces (duplicado)",
  "Proveedor equivocado",
  "Mes o periodo equivocado",
  "Fuente de dinero equivocada",
  "El gasto ya no se realizará",
  "Datos del comprobante o del sustento incorrectos",
];
const MOTIVOS_DEVOLVER = [
  "Falta corregir el monto o los precios",
  "Falta corregir la descripción",
  "Falta el sustento (factura o boleta)",
  "Datos del proveedor incorrectos",
  "Mes o periodo equivocado",
];

/**
 * Botón que abre una ventana para escribir el motivo antes de ejecutar la
 * acción (anular, devolver, reabrir). El motivo queda en el historial.
 */
export default function Motivo({
  accion,
  boton,
  ayuda,
  campos,
  peligro = true,
  titulo,
  pin = false,
  chico = false,
  motivos,
}: {
  accion: (fd: FormData) => Promise<void>;
  boton: string;
  ayuda: string;
  campos: Record<string, string>;
  peligro?: boolean;
  titulo?: string;
  /** Pide también el PIN personal. */
  pin?: boolean;
  /** Botón pequeño (para filas de listas). */
  chico?: boolean;
  /** Motivos frecuentes para elegir de una lista (si no se indican, según sea anular o devolver). */
  motivos?: string[];
}) {
  const nombre = usePrimerNombre();
  const pinActivo = useExigirPin();
  const ref = useRef<HTMLDialogElement>(null);
  const [texto, setTexto] = useState("");
  const corto = texto.trim().length < 10;
  const lista = motivos ?? (peligro ? MOTIVOS_ANULAR : /devolver/i.test(boton) ? MOTIVOS_DEVOLVER : []);

  return (
    <>
      <button type="button" className={`btn no-imprimir${chico ? " chico" : ""}${peligro ? " peligro" : ""}`} onClick={() => ref.current?.showModal()}>
        {boton}
      </button>
      <dialog ref={ref} className="dialogo" aria-label={titulo ?? boton} onClose={() => setTexto("")}>
        <form action={accion}>
          {Object.entries(campos).map(([k, v]) => (
            <input key={k} type="hidden" name={k} value={v} />
          ))}
          <div className="dialogo-cab">{titulo ?? boton}</div>
          <div className="dialogo-cuerpo">
            {peligro && (
              <p className="motivo-nota">
                No se borra: queda registrado como anulado, con su motivo, quién lo hizo y cuándo.
              </p>
            )}
            {lista.length > 0 && ayuda.length > 30 && (
              <p className="pequeno tenue" style={{ margin: 0 }}>{ayuda}</p>
            )}
            {lista.length > 0 && (
              <label className="campo">
                Elija un motivo frecuente
                <select value={lista.includes(texto) ? texto : ""} onChange={(e) => e.target.value && setTexto(e.target.value)}>
                  <option value="">— Elegir de la lista —</option>
                  {lista.map((m) => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
              </label>
            )}
            <label className="campo">
              {lista.length > 0 ? "O escriba el motivo (puede completar el elegido)" : ayuda}
              <textarea
                name="motivo"
                required
                minLength={10}
                autoFocus={lista.length === 0}
                value={texto}
                onChange={(e) => setTexto(e.target.value)}
                placeholder="Escriba el motivo (mínimo 10 caracteres)"
              />
            </label>
            <span className="pequeno tenue">{texto.trim().length} / 10 caracteres mínimo</span>
            {pin && pinActivo && (
              <CampoPin name="pin" etiqueta={nombre ? `PIN de ${nombre}` : "Su PIN personal"} required verificar />
            )}
          </div>
          <div className="dialogo-pie">
            <button type="button" className="btn" onClick={() => ref.current?.close()}>
              Cancelar
            </button>
            <button type="submit" className={`btn ${peligro ? "peligro" : "primario"}`} disabled={corto}>
              Confirmar: {boton.toLowerCase()}
            </button>
          </div>
        </form>
      </dialog>
    </>
  );
}
