"use client";

import { useEffect, useRef, useState } from "react";

/**
 * N° de cheque opcional: si ya se sabe qué cheque se emitirá, se anota aquí y el
 * comprobante de pago sale con ese número, sin volver a escribirlo. En los pagos
 * fijos se activa solo.
 */
export default function CampoCheque({ sugerido = "", inicial = "" }: { sugerido?: string; inicial?: string }) {
  const caja = useRef<HTMLDivElement>(null);
  const [activo, setActivo] = useState(!!inicial);
  const [cheque, setCheque] = useState(inicial || sugerido);

  useEffect(() => {
    const form = caja.current?.closest("form");
    if (!form) return;
    const alCambiar = () => {
      if (form.querySelector<HTMLInputElement>('input[name="tipo"][value="pago_fijo"]')?.checked) setActivo(true);
    };
    form.addEventListener("change", alCambiar);
    return () => form.removeEventListener("change", alCambiar);
  }, []);

  return (
    <div ref={caja} className="campo-cheque">
      <label className="cheque-marca">
        <input type="checkbox" checked={activo} onChange={(e) => setActivo(e.target.checked)} />
        <span>
          <b>Ya sé qué cheque se emitirá</b>
          <small>Opcional. El comprobante de pago saldrá con este cheque y se ahorra ese paso.</small>
        </span>
      </label>
      {activo && (
        <label className="campo" style={{ maxWidth: 260 }}>
          N° de cheque
          <input name="cheque_previsto" inputMode="numeric" pattern="\d{4,12}" value={cheque} onChange={(e) => setCheque(e.target.value)} placeholder="Siguiente de la chequera" />
          {sugerido && cheque !== sugerido && (
            <button type="button" className="btn chico contorno" onClick={() => setCheque(sugerido)}>Usar el siguiente de la chequera ({sugerido})</button>
          )}
        </label>
      )}
    </div>
  );
}
