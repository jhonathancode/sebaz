import Link from "next/link";

const PESTANAS = [
  { href: "/superadmin", t: "Clientes" },
  { href: "/superadmin/pagos", t: "Pagos" },
  { href: "/superadmin/planes", t: "Planes" },
  { href: "/superadmin/usuarios", t: "Usuarios" },
  { href: "/superadmin/equipo", t: "Equipo de soporte" },
];

export default function Pestanas({ activa }: { activa: string }) {
  return (
    <div className="filtros">
      <div className="grupo" role="tablist" aria-label="Superadmin">
        {PESTANAS.map((p) => (
          <Link key={p.href} role="tab" aria-selected={activa === p.href} className={`f-chip${activa === p.href ? " activo" : ""}`} href={p.href}>{p.t}</Link>
        ))}
      </div>
    </div>
  );
}
