import type { Metadata } from "next";
import { permanentRedirect } from "next/navigation";
import { SOLO_BLOG, rutaSitio } from "@/lib/sitio/datos";
import ListaBlog from "./ListaBlog";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Blog", description: "Guías, normas y buenas prácticas para la gestión de su municipalidad de centro poblado." };

export default async function Blog({ searchParams }: { searchParams: Promise<{ q?: string; pag?: string }> }) {
  const sp = await searchParams;
  if (SOLO_BLOG) {
    // La lista vive en la portada: una sola dirección por contenido, sin duplicados para Google.
    const params = new URLSearchParams();
    if (sp.q) params.set("q", sp.q);
    if (sp.pag) params.set("pag", sp.pag);
    const s = params.toString();
    permanentRedirect(`${await rutaSitio("/")}${s ? `?${s}` : ""}`);
  }
  return <ListaBlog q={sp.q} pag={sp.pag} />;
}
