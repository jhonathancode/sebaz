import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const PUBLICAS = ["/login", "/sitio"];

// Dominios de la web pública (por ejemplo «zebaz.pe,www.zebaz.pe»). Lo demás es el sistema.
const HOSTS_SITIO = (process.env.SITIO_HOSTS ?? "").split(",").map((h) => h.trim().toLowerCase()).filter(Boolean);

export async function middleware(request: NextRequest) {
  const host = (request.headers.get("host") ?? "").split(":")[0].toLowerCase();
  const rutaPedida = request.nextUrl.pathname;

  // Dominio de la web: se sirve el sitio público sin pedir sesión
  if (HOSTS_SITIO.includes(host)) {
    const appUrl = process.env.APP_URL;
    if (appUrl && (rutaPedida === "/login" || rutaPedida.startsWith("/login/"))) return NextResponse.redirect(`${appUrl.replace(/\/$/, "")}${rutaPedida}`);
    const url = request.nextUrl.clone();
    if (!rutaPedida.startsWith("/sitio")) url.pathname = `/sitio${rutaPedida === "/" ? "" : rutaPedida}`;
    const cabeceras = new Headers(request.headers);
    cabeceras.set("x-sitio-base", "");
    return NextResponse.rewrite(url, { request: { headers: cabeceras } });
  }

  let respuesta = NextResponse.next({ request });
  if (rutaPedida.startsWith("/sitio")) {
    const cabeceras = new Headers(request.headers);
    cabeceras.set("x-sitio-base", "/sitio");
    respuesta = NextResponse.next({ request: { headers: cabeceras } });
    return respuesta;
  }

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(lista) {
          lista.forEach(({ name, value }) => request.cookies.set(name, value));
          respuesta = NextResponse.next({ request });
          lista.forEach(({ name, value, options }) => respuesta.cookies.set(name, value, options));
        },
      },
    },
  );

  // getClaims verifica la firma de la sesión en el propio servidor (sin ir a
  // Supabase en cada clic) y la renueva cuando está por vencer.
  const { data } = await supabase.auth.getClaims();
  const hayUsuario = !!data?.claims?.sub;

  const ruta = request.nextUrl.pathname;
  const esPublica = PUBLICAS.some((p) => ruta.startsWith(p));

  if (!hayUsuario && !esPublica) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    return NextResponse.redirect(url);
  }
  if (hayUsuario && ruta === "/login") {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    url.search = "";
    return NextResponse.redirect(url);
  }
  return respuesta;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|.*\\.(?:png|jpg|svg|ico|woff2?)$).*)"],
};
