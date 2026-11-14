"use client";

import { useEffect } from "react";

/** En celular los meses van en una sola fila deslizable: se deja a la vista el mes elegido. */
export default function ScrollMesActivo() {
  useEffect(() => {
    const sel = document.querySelector<HTMLElement>(".cc-meses .cc-mes.sel");
    const fila = sel?.parentElement;
    if (sel && fila) fila.scrollLeft = sel.offsetLeft - (fila.clientWidth - sel.offsetWidth) / 2;
  }, []);
  return null;
}
