import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import Bienvenida from "@/components/Bienvenida";
import Bandeja from "@/components/Bandeja";
import BotonTema from "@/components/BotonTema";
import Menu, { BotonMenu, type ItemMenu } from "@/components/Menu";
import MenuUsuario, { type EnlaceMenu } from "@/components/MenuUsuario";
import { COOKIE_MCP, obtenerContexto, tiene } from "@/lib/contexto";
import LogoSebaz from "@/components/LogoSebaz";
import { APP_NOMBRE, logoMcp } from "@/lib/formato";
import { tieneModulo } from "@/lib/modulos";
import { supabaseServidor } from "@/lib/supabase/server";
import type { Aviso } from "@/lib/notificaciones";
import { abrirAviso, marcarTodasLeidas } from "./mensajes/acciones";

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
  // Primer ingreso: condiciones de uso y PIN, antes de cualquier pantalla
  if (ctx.ingresoPendiente) return <Bienvenida nombre={ctx.nombre} pendiente={ctx.ingresoPendiente} salir={salir} />;
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

  // Bandeja de mensajes (si la base aún no tiene la actualización, la campana no aparece)
  let avisos: Aviso[] = [];
  let sinLeer = 0;
  let hayBandeja = false;
  {
    const supabase = await supabaseServidor();
    const [{ data, error }, { count }] = await Promise.all([
      supabase.from("notificaciones").select("id, tipo, titulo, detalle, enlace, leida_en, creado_en").eq("user_id", ctx.userId).order("creado_en", { ascending: false }).limit(12),
      supabase.from("notificaciones").select("id", { count: "exact", head: true }).eq("user_id", ctx.userId).is("leida_en", null),
    ]);
    if (!error) {
      hayBandeja = true;
      avisos = (data ?? []) as Aviso[];
      sinLeer = count ?? 0;
    }
  }

  // Trabajo diario arriba; administración bajo el nombre del usuario.
  // El superadmin tiene su propio panel (Sebaz como empresa); las MCP son sus clientes.
  const items: ItemMenu[] = ctx.esSuperadmin
    ? [
        { href: "/superadmin/inicio", texto: "Inicio" },
        { href: "/superadmin/clientes", texto: "Clientes" },
        { href: "/superadmin/pagos", texto: "Pagos" },
        { href: "/superadmin/planes", texto: "Planes" },
        { href: "/superadmin/usuarios", texto: "Usuarios" },
        { href: "/superadmin/mensajes", texto: "Mensajes y novedades" },
        { href: "/superadmin/equipo", texto: "Equipo de soporte" },
        { href: "/soporte", texto: "Activaciones y relevos" },
      ]
    : ctx.mcp
    ? [
        { href: "/inicio", texto: "Inicio" },
        ...(tiene(ctx, "alcalde", "admin") ? [{ href: "/aprobaciones", texto: "Por aprobar", n: porAprobar }] : []),
        { href: "/expedientes", texto: "Expedientes" },
        ...(tieneModulo(ctx.mcp, "caja_chica") ? [{ href: "/caja-chica", texto: "Caja chica" }] : []),
        ...(tieneModulo(ctx.mcp, "ingresos") ? [{ href: "/ingresos", texto: "Ingresos" }] : []),
        ...(tieneModulo(ctx.mcp, "almacen") ? [{ href: "/almacen", texto: "Almacén" }] : []),
        ...(tieneModulo(ctx.mcp, "rendicion") ? [{ href: "/rendicion", texto: "Rendición" }] : []),
        ...(tieneModulo(ctx.mcp, "contabilidad") ? [{ href: "/contabilidad", texto: "Contabilidad" }] : []),
      ]
    : ctx.esSoporte
      ? [{ href: "/soporte", texto: "Panel de soporte" }]
      : [];

  const enlaces: EnlaceMenu[] = [
    { href: "/mensajes", texto: "Mensajes", grupo: "cuenta" },
    { href: "/cuenta", texto: "Mi cuenta, clave y PIN", grupo: "cuenta" },
  ];
  if (ctx.mcp) {
    enlaces.push(
      { href: "/responsables", texto: "Responsables y relevos", grupo: "administracion" },
      { href: "/configuracion", texto: "Configuración de la MCP", grupo: "administracion" },
      { href: "/auditoria", texto: "Auditoría", grupo: "administracion" },
    );
  }
  if (ctx.esSoporte && !ctx.esSuperadmin) enlaces.push({ href: "/soporte", texto: "Panel de soporte", grupo: "soporte" });

  // Si la MCP no tiene la fuente "propios", la base no tiene la última actualización.
  const baseDesactualizada = ctx.esSoporte && !!ctx.mcp && !ctx.fuentes.some((f) => f.tipo === "propios");
  const suspendida = !!ctx.mcp && ctx.mcp.estado === "suspendida" && !ctx.esSoporte;
  const cargo = ctx.esSuperadmin ? "Administrador del sistema" : [...ctx.cargos, ...(ctx.esSoporte ? ["Soporte"] : [])].join(" · ") || "Sin cargo vigente";

  return (
    <>
      <header className="cabecera no-imprimir">
        <div className="marca">
          {items.length > 0 && <BotonMenu />}
          <span className="marca-app"><LogoSebaz tamano={38} /></span>
          <span className="marca-mcp">
            {ctx.esSuperadmin ? (
              "Panel de administración"
            ) : ctx.mcp ? (
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
          {hayBandeja && <Bandeja avisos={avisos} sinLeer={sinLeer} abrir={abrirAviso} marcarTodas={marcarTodasLeidas} />}
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
          mcp={ctx.mcp ? { nombre: ctx.mcp.nombre, ruc: ctx.mcp.ruc, logo: logoMcp(ctx.mcp) } : null}
          panel={ctx.esSuperadmin ? APP_NOMBRE : ctx.esSoporte && !ctx.mcp ? "Soporte" : undefined}
        />
      )}
      <main className="ventana">
        {baseDesactualizada && (
          <div className="aviso error no-imprimir">
            <strong>Base de datos sin actualizar.</strong> Falta ejecutar <code>supabase/ACTUALIZAR_BASE.sql</code> en Supabase (SQL Editor → Run).
            Mientras tanto no se puede registrar «Pago fijo» ni pagar con «Ingresos propios». Este aviso solo lo ve soporte.
          </div>
        )}
        {suspendida ? (
          <div className="kpi rojo" style={{ maxWidth: 640, margin: "40px auto", gap: 10 }}>
            <span className="k-et">Servicio suspendido</span>
            <span className="k-val">{ctx.mcp?.nombre}</span>
            <span className="k-det">
              El acceso al sistema de esta municipalidad está suspendido. Sus datos se conservan completos. Para reactivarlo, comuníquese con soporte.
            </span>
          </div>
        ) : (
          children
        )}
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
