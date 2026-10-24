import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import BotonTema from "@/components/BotonTema";
import Menu, { BotonMenu, type ItemMenu } from "@/components/Menu";
import MenuUsuario, { type EnlaceMenu } from "@/components/MenuUsuario";
import { COOKIE_MCP, obtenerContexto, tiene } from "@/lib/contexto";
import { APP_NOMBRE, urlLogo } from "@/lib/formato";
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
  // Pendientes de firma (solo para quien aprueba)
  let porAprobar = 0;
  if (ctx.mcp && tiene(ctx, "alcalde", "admin")) {
    const supabase = await supabaseServidor();
    const [{ count: a }, { count: b }] = await Promise.all([
      supabase.from("expedientes").select("id", { count: "exact", head: true }).eq("mcp_id", ctx.mcp.id).eq("estado", "borrador"),
      supabase.from("comprobantes_pago").select("id", { count: "exact", head: true }).eq("mcp_id", ctx.mcp.id).eq("estado", "borrador"),
    ]);
    porAprobar = (a ?? 0) + (b ?? 0);
  }
  const menuOculto = cookieStore.get("menu")?.value === "oculto";

  // Trabajo diario arriba; administración bajo el nombre del usuario.
  const items: ItemMenu[] = ctx.mcp
    ? [
        { href: "/inicio", texto: "Inicio" },
        ...(tiene(ctx, "alcalde", "admin") ? [{ href: "/aprobaciones", texto: "Por aprobar", n: porAprobar }] : []),
        { href: "/expedientes", texto: "Expedientes" },
        { href: "/caja-chica", texto: "Caja chica" },
        { href: "/ingresos", texto: "Ingresos" },
        { href: "/almacen", texto: "Almacén" },
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

  // Si la MCP no tiene la fuente "propios", la base no tiene la última actualización.
  const baseDesactualizada = ctx.esSoporte && !!ctx.mcp && !ctx.fuentes.some((f) => f.tipo === "propios");
  const cargo = [...ctx.cargos, ...(ctx.esSoporte ? ["Soporte"] : [])].join(" · ") || "Sin cargo vigente";

  return (
    <>
      <header className="cabecera no-imprimir">
        <div className="marca">
          {items.length > 0 && <BotonMenu />}
          <span className="marca-app">{APP_NOMBRE}</span>
          <span className="marca-mcp">
            {ctx.mcp ? (
              <>
                {ctx.mcp.nombre} <span className="sub">· RUC {ctx.mcp.ruc ?? <span className="pendiente">pendiente</span>}</span>
              </>
            ) : ctx.esSoporte ? (
              "Panel de soporte"
            ) : (
              "Sin MCP asignada"
            )}
          </span>
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
      <div className="marco-app" data-menu={menuOculto ? "oculto" : "visible"}>
      {items.length > 0 && (
        <Menu
          items={items}
          nuevo={!!ctx.mcp && tiene(ctx, "admin", "tesorero", "contador")}
          abajo={
            ctx.mcp
              ? [
                  { href: "/configuracion", texto: "Configuración de la MCP" },
                  ...(tiene(ctx, "admin") || ctx.esSoporte ? [{ href: "/responsables", texto: "Responsables" }] : []),
                  ...(tiene(ctx, "admin", "alcalde") ? [{ href: "/auditoria", texto: "Auditoría" }] : []),
                ]
              : []
          }
          mcp={ctx.mcp ? { nombre: ctx.mcp.nombre, ruc: ctx.mcp.ruc, logo: urlLogo(ctx.mcp.logo_path) } : null}
        />
      )}
      <main className="ventana">
        {baseDesactualizada && (
          <div className="aviso error no-imprimir">
            <strong>Base de datos sin actualizar.</strong> Falta ejecutar <code>supabase/ACTUALIZAR_BASE.sql</code> en Supabase (SQL Editor → Run).
            Mientras tanto no se puede registrar «Pago fijo» ni pagar con «Ingresos propios». Este aviso solo lo ve soporte.
          </div>
        )}
        {children}
      </main>
      </div>
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
