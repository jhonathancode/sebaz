import { cookies } from "next/headers";
import { UsuarioProvider } from "@/components/UsuarioContexto";
import { redirect } from "next/navigation";
import Bienvenida from "@/components/Bienvenida";
import Bandeja from "@/components/Bandeja";
import BotonTema from "@/components/BotonTema";
import BarraInferior, { type PestanaInferior } from "@/components/BarraInferior";
import Menu, { BotonMenu, type ItemMenu } from "@/components/Menu";
import MenuUsuario, { type EnlaceMenu } from "@/components/MenuUsuario";
import { COOKIE_MCP, obtenerContexto, tiene } from "@/lib/contexto";
import LogoSebaz from "@/components/LogoSebaz";
import { APP_NOMBRE, logoMcp } from "@/lib/formato";
import { tieneModulo } from "@/lib/modulos";
import { supabaseServidor } from "@/lib/supabase/server";
import type { Aviso } from "@/lib/notificaciones";
import { rendicionesAtrasadas, type Pendiente } from "@/lib/pendientes";
import { abrirAviso, dejarPendiente, marcarLeida, marcarTodasLeidas } from "./mensajes/acciones";

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
  redirect("/");
}

export default async function MarcoApp({ children }: { children: React.ReactNode }) {
  const [ctx, cookieStore] = await Promise.all([obtenerContexto(), cookies()]);
  const tema = cookieStore.get("tema")?.value;
  // Primer ingreso: condiciones de uso y PIN, antes de cualquier pantalla
  if (ctx.ingresoPendiente) return <Bienvenida nombre={ctx.nombre} pendiente={ctx.ingresoPendiente} salir={salir} />;
  // Pendientes de firma (solo para quien aprueba)
  // Las tres consultas del marco (por aprobar, bandeja y pendientes) salen a la vez, no una tras otra
  const sb = await supabaseServidor();
  const [porAprobar, bandeja, pendientes] = await Promise.all([
    (async () => {
      if (!(ctx.mcp && tiene(ctx, "alcalde", "admin"))) return 0;
      const [{ count: a }, { count: b }] = await Promise.all([
        sb.from("expedientes").select("id", { count: "exact", head: true }).eq("mcp_id", ctx.mcp.id).eq("estado", "borrador"),
        sb.from("comprobantes_pago").select("id", { count: "exact", head: true }).eq("mcp_id", ctx.mcp.id).eq("estado", "borrador"),
      ]);
      return (a ?? 0) + (b ?? 0);
    })(),
    (async () => {
      // Si la base aún no tiene la actualización, la campana no aparece
      const [{ data, error }, { count }] = await Promise.all([
        sb.from("notificaciones").select("id, tipo, titulo, detalle, enlace, leida_en, creado_en").eq("user_id", ctx.userId).order("creado_en", { ascending: false }).limit(12),
        sb.from("notificaciones").select("id", { count: "exact", head: true }).eq("user_id", ctx.userId).is("leida_en", null),
      ]);
      return error ? null : { avisos: (data ?? []) as Aviso[], sinLeer: count ?? 0 };
    })(),
    (async (): Promise<Pendiente[]> => {
      // Pendientes que no son mensajes (ej. rendición del mes pasado sin armar): también van en la campana
      if (!(ctx.mcp && !ctx.esSuperadmin && tieneModulo(ctx.mcp, "rendicion"))) return [];
      try {
        return await rendicionesAtrasadas(sb, ctx.mcp.id, ctx.fuentes);
      } catch {
        return [];
      }
    })(),
  ]);
  const menuOculto = cookieStore.get("menu")?.value === "oculto";
  const avisos: Aviso[] = bandeja?.avisos ?? [];
  const sinLeer = bandeja?.sinLeer ?? 0;
  const hayBandeja = !!bandeja;

  // Trabajo diario arriba; administración bajo el nombre del usuario.
  // El superadmin tiene su propio panel (Zebaz como empresa); las MCP son sus clientes.
  const items: ItemMenu[] = ctx.esSuperadmin
    ? [
        { href: "/superadmin/inicio", texto: "Inicio" },
        { href: "/superadmin/clientes", texto: "Clientes" },
        { href: "/superadmin/pagos", texto: "Pagos" },
        { href: "/superadmin/planes", texto: "Planes" },
        { href: "/superadmin/usuarios", texto: "Usuarios" },
        { href: "/superadmin/web", texto: "Sitio web" },
        { href: "/superadmin/mensajes", texto: "Mensajes y novedades" },
        { href: "/superadmin/equipo", texto: "Equipo de soporte" },
        { href: "/soporte", texto: "Activaciones y relevos" },
      ]
    : ctx.mcp
    ? [
        { href: "/", texto: "Inicio" },
        ...(tiene(ctx, "alcalde", "admin") ? [{ href: "/aprobaciones", texto: "Por aprobar", n: porAprobar }] : []),
        { href: "/expedientes", texto: "Expedientes" },
        ...(tieneModulo(ctx.mcp, "caja_chica") ? [{ href: "/caja-chica", texto: "Caja chica" }] : []),
        ...(tieneModulo(ctx.mcp, "ingresos") ? [{ href: "/ingresos", texto: "Ingresos" }] : []),
        ...(tieneModulo(ctx.mcp, "almacen") ? [{ href: "/almacen", texto: "Almacén" }] : []),
        ...(tieneModulo(ctx.mcp, "rendicion") ? [{ href: "/rendicion", texto: "Rendición" }] : []),
        ...(tieneModulo(ctx.mcp, "contabilidad") ? [{ href: "/contabilidad", texto: "Contabilidad", sub: [{ href: "/contabilidad", texto: "Libros y resumen" }, { href: "/contabilidad/estados-cuenta", texto: "Estados de cuenta corriente" }] }] : []),
      ]
    : ctx.esSoporte
      ? [{ href: "/soporte", texto: "Panel de soporte" }]
      : [];

  // Barra de abajo (celular): inicio, gastos, lo que aprueba, ingresos o caja chica; el resto va en «Más»
  const pestanas: PestanaInferior[] = [];
  if (ctx.mcp && !ctx.esSuperadmin) {
    pestanas.push({ href: "/", texto: "Inicio" });
    if (tiene(ctx, "alcalde", "admin")) pestanas.push({ href: "/aprobaciones", texto: "Por aprobar", n: porAprobar });
    pestanas.push({ href: "/expedientes", texto: "Gastos" });
    if (tieneModulo(ctx.mcp, "ingresos") && pestanas.length < 4) pestanas.push({ href: "/ingresos", texto: "Ingresos" });
    if (tieneModulo(ctx.mcp, "caja_chica") && pestanas.length < 4) pestanas.push({ href: "/caja-chica", texto: "Caja chica" });
  }

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
    <UsuarioProvider nombre={ctx.nombre} exigirPin={!!ctx.mcp?.exigir_pin}>
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
          {(hayBandeja || pendientes.length > 0) && <Bandeja avisos={avisos} sinLeer={sinLeer} pendientes={pendientes} abrir={abrirAviso} marcarLeida={marcarLeida} dejarPendiente={dejarPendiente} marcarTodas={marcarTodasLeidas} />}
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
      {pestanas.length > 0 && <BarraInferior pestanas={pestanas} />}
    </UsuarioProvider>
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
