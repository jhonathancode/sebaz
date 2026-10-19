import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import BotonTema from "@/components/BotonTema";
import Menu, { type ItemMenu } from "@/components/Menu";
import MenuUsuario, { type EnlaceMenu } from "@/components/MenuUsuario";
import { COOKIE_MCP, obtenerContexto } from "@/lib/contexto";
import { APP_NOMBRE } from "@/lib/formato";
import { supabaseServidor } from "@/lib/supabase/server";

async function salir() {
  "use server";
  const supabase = await supabaseServidor();
  await supabase.auth.signOut();
  redirect("/login");
}

async function cambiarMcp(fd: FormData) {
  "use server";
  const id = String(fd.get("mcp") ?? "");
  (await cookies()).set(COOKIE_MCP, id, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 365 });
  redirect("/inicio");
}

export default async function MarcoApp({ children }: { children: React.ReactNode }) {
  const [ctx, cookieStore] = await Promise.all([obtenerContexto(), cookies()]);
  const tema = cookieStore.get("tema")?.value;

  // Trabajo diario arriba; administración bajo el nombre del usuario.
  const items: ItemMenu[] = ctx.mcp
    ? [
        { href: "/inicio", texto: "Inicio" },
        { href: "/expedientes", texto: "Expedientes" },
        { href: "/comprobantes", texto: "Comprobantes de pago" },
        { href: "/caja-chica", texto: "Caja chica" },
        { href: "/ingresos", texto: "Ingresos" },
        { href: "/rendicion", texto: "Rendición" },
      ]
    : ctx.esSoporte
      ? [{ href: "/soporte", texto: "Panel de soporte" }]
      : [];

  const enlaces: EnlaceMenu[] = [{ href: "/cuenta", texto: "Mi cuenta y contraseña", grupo: "cuenta" }];
  if (ctx.mcp) {
    enlaces.push(
      { href: "/responsables", texto: "Responsables y relevos", grupo: "administracion" },
      { href: "/configuracion", texto: "Configuración de la MCP", grupo: "administracion" },
      { href: "/auditoria", texto: "Auditoría", grupo: "administracion" },
    );
  }
  if (ctx.esSoporte) enlaces.push({ href: "/soporte", texto: "Panel de soporte", grupo: "soporte" });

  const cargo = [...ctx.cargos, ...(ctx.esSoporte ? ["Soporte"] : [])].join(" · ") || "Sin cargo vigente";

  return (
    <>
      <header className="cabecera no-imprimir">
        <div className="marca">
          <div className="logo" aria-hidden="true">MCP</div>
          <div className="marca-texto">
            <div className="marca-nombre">{ctx.mcp?.nombre ?? (ctx.esSoporte ? "Panel de soporte" : "Sin MCP asignada")}</div>
            <div className="sub">
              {APP_NOMBRE}
              {ctx.mcp && <> · RUC {ctx.mcp.ruc ?? <span className="pendiente">pendiente</span>}</>}
            </div>
          </div>
        </div>
        <div className="acciones">
          <BotonTema inicial={tema === "dark" || tema === "light" ? tema : null} />
          <MenuUsuario
            nombre={ctx.nombre}
            cargo={cargo}
            mcp={ctx.mcp?.nombre ?? null}
            iniciales={iniciales(ctx.nombre)}
            enlaces={enlaces}
            mcps={ctx.mcps}
            mcpActual={ctx.mcp?.id ?? null}
            cambiarMcp={cambiarMcp}
            salir={salir}
          />
        </div>
      </header>
      <Menu items={items} />
      <main className="ventana">{children}</main>
    </>
  );
}

function iniciales(nombre: string) {
  return (
    nombre
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase())
      .join("") || "?"
  );
}
