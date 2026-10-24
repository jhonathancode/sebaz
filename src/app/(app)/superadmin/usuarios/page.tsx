import { restablecerPin } from "../../soporte/acciones";
import { cookies } from "next/headers";
import Link from "next/link";
import Avisos, { type ParamsAviso } from "@/components/Avisos";
import BotonConfirmar from "@/components/BotonConfirmar";
import { NOMBRE_ROL, obtenerContexto, type Rol } from "@/lib/contexto";
import { fechaHora } from "@/lib/formato";
import { supabaseServicio, supabaseServidor } from "@/lib/supabase/server";
import { bloquearUsuario, nuevaClave } from "../acciones";

/** Todos los usuarios del sistema, con su MCP, cargo y último ingreso. */
export default async function Usuarios({ searchParams }: { searchParams: ParamsAviso }) {
  const sp = await searchParams;
  const ctx = await obtenerContexto();
  if (!ctx.esSuperadmin) return <div className="aviso error">Esta pantalla es solo para el dueño del sistema.</div>;
  const supabase = await supabaseServidor();
  let temporal: { correo: string; clave: string } | null = null;
  try {
    const c = (await cookies()).get("clave_temporal_sa")?.value;
    temporal = c ? JSON.parse(c) : null;
  } catch {
    temporal = null;
  }
  const q = (sp.q ?? "").toLowerCase();
  const [{ data: perfiles }, { data: miembros }, auth] = await Promise.all([
    supabase.from("perfiles").select("*"),
    supabase.from("miembros").select("user_id, rol, cargo, activo, mcp_id, mcps(nombre)").eq("activo", true),
    supabaseServicio().auth.admin.listUsers({ page: 1, perPage: 1000 }),
  ]);
  const usuarios = (auth.data?.users ?? [])
    .map((u) => {
      const p = (perfiles ?? []).find((x) => x.id === u.id);
      const ms = (miembros ?? []).filter((x) => x.user_id === u.id);
      const bloqueado = !!u.banned_until && new Date(u.banned_until) > new Date();
      return { id: u.id, correo: u.email ?? "", nombre: p?.nombre ?? "", ultimo: u.last_sign_in_at ?? null, ms, bloqueado, soporte: !!p?.es_soporte, superadmin: !!p?.es_superadmin };
    })
    .filter((u) => !q || `${u.correo} ${u.nombre} ${u.ms.map((m) => (m.mcps as unknown as { nombre: string } | null)?.nombre).join(" ")}`.toLowerCase().includes(q))
    .sort((a, b) => (b.ultimo ?? "").localeCompare(a.ultimo ?? ""));

  return (
    <>
      <div className="cab-vista">
        <div><h1>Usuarios</h1><div className="sub">Todos los usuarios de todas las MCP. Los cargos y relevos se registran en el panel de soporte.</div></div>
      </div>
      <Avisos ok={sp.ok} error={sp.error} />
      {temporal && (
        <div className="aviso ok">Clave temporal de <b>{temporal.correo}</b>: <b>{temporal.clave}</b>. Entréguela en persona; este aviso desaparece en 2 minutos.</div>
      )}
      <form className="buscador" method="get" role="search" style={{ maxWidth: 520 }}>
        <input name="q" defaultValue={sp.q ?? ""} placeholder="Buscar por nombre, correo o MCP…" aria-label="Buscar" />
        <button className="btn chico" type="submit">Buscar</button>
      </form>
      <div className="filas">
        {usuarios.length === 0 && <div className="vacio">Sin usuarios.</div>}
        {usuarios.map((u) => (
          <div key={u.id} className={`fila${u.bloqueado ? " anulada" : ""}`} style={{ gridTemplateColumns: "minmax(0,1fr) auto auto" }}>
            <div className="f-desc">
              <span className="f-titulo">{u.nombre || u.correo}</span>
              <div className="f-meta">
                <span>{u.correo}</span>
                {u.superadmin && <span className="etq azul">Superadmin</span>}
                {u.soporte && !u.superadmin && <span className="etq azul">Soporte</span>}
                {u.ms.map((m, i) => (
                  <Link key={i} className="etq" href={`/superadmin/clientes/${m.mcp_id}`}>
                    {(m.mcps as unknown as { nombre: string } | null)?.nombre} · {m.cargo || NOMBRE_ROL[m.rol as Rol]}
                  </Link>
                ))}
                {u.bloqueado && <span className="no">Bloqueado</span>}
              </div>
            </div>
            <div className="pequeno tenue" style={{ textAlign: "right" }}>{u.ultimo ? `Último ingreso ${fechaHora(u.ultimo)}` : "Nunca ingresó"}</div>
            <div className="f-acc">
              {!u.superadmin && (
                <>
                  <form action={nuevaClave}>
                    <input type="hidden" name="user_id" value={u.id} />
                    <input type="hidden" name="correo" value={u.correo} />
                    <BotonConfirmar className="btn chico contorno" pregunta={`¿Dar una clave temporal nueva a ${u.correo}?`} detalle="La clave anterior deja de funcionar." textoConfirmar="Sí, generar">Nueva clave</BotonConfirmar>
                  </form>
                  <form action={restablecerPin}>
                    <input type="hidden" name="user_id" value={u.id} />
                    <input type="hidden" name="volver" value="/superadmin/usuarios" />
                    <BotonConfirmar className="btn chico contorno" pregunta={`¿Restablecer el PIN de ${u.correo}?`} detalle="Solo si confirmó su identidad. Al ingresar tendrá que elegir un PIN nuevo." textoConfirmar="Sí, restablecer">Restablecer PIN</BotonConfirmar>
                  </form>
                  <form action={bloquearUsuario}>
                    <input type="hidden" name="user_id" value={u.id} />
                    <input type="hidden" name="bloquear" value={u.bloqueado ? "0" : "1"} />
                    <BotonConfirmar className={`btn chico${u.bloqueado ? "" : " peligro"}`} peligro={!u.bloqueado} pregunta={u.bloqueado ? "¿Desbloquear este usuario?" : "¿Bloquear este usuario?"} detalle={u.bloqueado ? "Podrá volver a ingresar." : "No podrá ingresar a ninguna MCP. Sus registros se conservan."} textoConfirmar="Sí">
                      {u.bloqueado ? "Desbloquear" : "Bloquear"}
                    </BotonConfirmar>
                  </form>
                </>
              )}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
