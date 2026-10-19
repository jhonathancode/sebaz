import { cookies } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import BotonTema from "@/components/BotonTema";
import Menu, { type ItemMenu } from "@/components/Menu";
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

  const items: ItemMenu[] = [];
  if (ctx.mcp) {
    items.push(
      { href: "/inicio", texto: "Inicio" },
      { href: "/expedientes", texto: "Expedientes" },
      { href: "/comprobantes", texto: "Comprobantes de pago" },
      { href: "/caja-chica", texto: "Caja chica" },
      { href: "/ingresos", texto: "Ingresos" },
      { href: "/rendicion", texto: "Rendición" },
      { href: "/responsables", texto: "Responsables" },
      { href: "/configuracion", texto: "Configuración" },
      { href: "/auditoria", texto: "Auditoría" },
    );
  }
  if (ctx.esSoporte) items.push({ href: "/soporte", texto: "Soporte" });

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
          {ctx.mcps.length > 1 && (
            <form action={cambiarMcp} style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <label className="sub" htmlFor="mcp-sel">MCP</label>
              <select id="mcp-sel" name="mcp" defaultValue={ctx.mcp?.id}>
                {ctx.mcps.map((m) => (
                  <option key={m.id} value={m.id}>{m.nombre}</option>
                ))}
              </select>
              <button className="boton-cabecera" type="submit">Cambiar</button>
            </form>
          )}
          <BotonTema inicial={tema === "dark" || tema === "light" ? tema : null} />
          <Link className="usuario" href="/cuenta" title="Mi cuenta">
            <span className="avatar" aria-hidden="true">{iniciales(ctx.nombre)}</span>
            <span>
              <span className="usuario-nombre">{ctx.nombre}</span>
              <span className="sub">{cargo}</span>
            </span>
          </Link>
          <form action={salir}>
            <button className="boton-cabecera" type="submit">Salir</button>
          </form>
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
