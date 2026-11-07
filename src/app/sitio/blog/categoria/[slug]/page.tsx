import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { origenSitio, supabasePublico } from "@/lib/sitio/datos";
import ListaBlog from "../../ListaBlog";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ q?: string; pag?: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const sp = await searchParams;
  const { data } = await supabasePublico().from("blog_categorias").select("nombre, descripcion").eq("slug", slug).maybeSingle();
  if (!data) return {};
  const origen = await origenSitio();
  const pag = Math.max(1, Math.floor(Number(sp.pag)) || 1);
  return {
    title: `${data.nombre}${pag > 1 ? ` · Página ${pag}` : ""} · Blog`,
    description: data.descripcion ?? undefined,
    alternates: { canonical: `${origen}/blog/categoria/${slug}${pag > 1 ? `?pag=${pag}` : ""}` },
    robots: sp.q ? { index: false, follow: true } : undefined,
  };
}

export default async function Categoria({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ q?: string; pag?: string }> }) {
  const { slug } = await params;
  const sp = await searchParams;
  const { data } = await supabasePublico().from("blog_categorias").select("id").eq("slug", slug).maybeSingle();
  if (!data) notFound();
  return <ListaBlog categoriaSlug={slug} q={sp.q} pag={sp.pag} />;
}
