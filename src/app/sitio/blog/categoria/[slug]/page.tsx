import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { supabasePublico } from "@/lib/sitio/datos";
import ListaBlog from "../../ListaBlog";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const { data } = await supabasePublico().from("blog_categorias").select("nombre, descripcion").eq("slug", slug).maybeSingle();
  return data ? { title: `${data.nombre} · Blog`, description: data.descripcion ?? undefined } : {};
}

export default async function Categoria({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ q?: string; pag?: string }> }) {
  const { slug } = await params;
  const sp = await searchParams;
  const { data } = await supabasePublico().from("blog_categorias").select("id").eq("slug", slug).maybeSingle();
  if (!data) notFound();
  return <ListaBlog categoriaSlug={slug} q={sp.q} pag={sp.pag} />;
}
