/** Marca de Sebaz: sello con visto de control, nombre y la frase «Sistema de control». */
export default function LogoSebaz({ tamano = 40, claro = true, frase = true }: { tamano?: number; claro?: boolean; frase?: boolean }) {
  return (
    <span className="logo-sebaz" style={{ ["--ls" as string]: `${tamano}px` }} data-claro={claro ? "1" : "0"}>
      <svg viewBox="0 0 48 48" width={tamano} height={tamano} aria-hidden="true">
        <rect x="2" y="2" width="44" height="44" rx="13" fill="currentColor" opacity="0.16" />
        <rect x="2" y="2" width="44" height="44" rx="13" fill="none" stroke="currentColor" strokeWidth="2.4" />
        <path d="M14 25.5 21 32.5 34.5 16" fill="none" stroke="currentColor" strokeWidth="4.2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <span className="ls-texto">
        <span className="ls-nombre">SEBAZ</span>
        {frase && <span className="ls-frase">Sistema de control</span>}
      </span>
    </span>
  );
}
