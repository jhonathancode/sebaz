"use client";

export default function BotonImprimir({ texto = "Imprimir" }: { texto?: string }) {
  return (
    <button type="button" className="btn primario no-imprimir" onClick={() => window.print()}>
      {texto}
    </button>
  );
}
