import type { Metadata } from "next";
import ListaBlog from "./ListaBlog";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Blog", description: "Guías, normas y buenas prácticas para la gestión de su municipalidad de centro poblado." };

export default async function Blog({ searchParams }: { searchParams: Promise<{ q?: string; pag?: string }> }) {
  const sp = await searchParams;
  return <ListaBlog q={sp.q} pag={sp.pag} />;
}
