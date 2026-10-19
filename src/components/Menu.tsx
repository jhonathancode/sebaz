"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export type ItemMenu = { href: string; texto: string };

export default function Menu({ items }: { items: ItemMenu[] }) {
  const ruta = usePathname();
  return (
    <nav className="menu no-imprimir" aria-label="Menú del sistema">
      {items.map((i) => {
        const activo = ruta === i.href || ruta.startsWith(i.href + "/");
        return (
          <Link key={i.href} href={i.href} className={activo ? "activo" : undefined} aria-current={activo ? "page" : undefined}>
            {i.texto}
          </Link>
        );
      })}
    </nav>
  );
}
