"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";

function Interior() {
  const params = useSearchParams();
  const error = params.get("error");
  const ok = params.get("ok");
  if (!error && !ok) return null;
  return <div className={`aviso ${error ? "error" : "info"}`}>{error ?? ok}</div>;
}

/** Muestra el aviso (?error= u ?ok=) de la dirección, para pantallas que no reciben los parámetros. */
export default function AvisoUrl() {
  return (
    <Suspense fallback={null}>
      <Interior />
    </Suspense>
  );
}
