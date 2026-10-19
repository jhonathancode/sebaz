import { cookies } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import Menu, { type ItemMenu } from "@/components/Menu";
import { COOKIE_MCP, NOMBRE_ROL, obtenerContexto } from "@/lib/contexto";
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
  redirect("/expedientes");
}

export default async function MarcoApp({ children }: { children: React.ReactNode }) {
  const ctx = await obtenerContexto();

  const items: ItemMenu[] = [];
  if (ctx.mcp) {
    items.push(
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

  const cargos = ctx.roles.map((r) => NOMBRE_ROL[r]).join(", ");

  return (
    <>
      <header className="cabecera no-imprimir">
        <div className="marca">
          <div className="logo" aria-hidden="true">MCP</div>
          <div>
            <span style={{ fontWeight: 600 }}>{APP_NOMBRE}</span>{" "}
            <span className="sub">· {ctx.mcp?.nombre ?? (ctx.esSoporte ? "Panel de soporte" : "Sin MCP asignada")}</span>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
          {ctx.mcps.length > 1 && (
            <form action={cambiarMcp} style={{ display: "flex", gap: 6 }}>
              <label className="sub" htmlFor="mcp-sel">MCP</label>
              <select id="mcp-sel" name="mcp" defaultValue={ctx.mcp?.id}>
                {ctx.mcps.map((m) => (
                  <option key={m.id} value={m.id}>{m.nombre}</option>
                ))}
              </select>
              <button className="btn" type="submit">Cambiar</button>
            </form>
          )}
          <Link className="sub" href="/cuenta">
            {ctx.nombre}
            {cargos && ` · ${cargos}`}
            {ctx.esSoporte && " · Soporte"}
          </Link>
          <form action={salir}>
            <button className="enlace" type="submit">Salir</button>
          </form>
        </div>
      </header>
      <Menu items={items} />
      <main className="ventana">{children}</main>
    </>
  );
}
