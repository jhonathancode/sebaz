import LogoSebaz from "@/components/LogoSebaz";
import { urlLogo } from "@/lib/formato";
import { ingresar } from "@/app/login/acciones";

export type DatosLoginMcp = { nombre: string; ruc: string | null; logo_path: string | null } | null;

/** Pantalla de ingreso: la de Sebaz, o la de una municipalidad con su logo, nombre y RUC. */
export default function PantallaLogin({ error, mcp, desde }: { error?: string; mcp?: DatosLoginMcp; desde: string }) {
  const logo = urlLogo(mcp?.logo_path);
  return (
    <main className="login">
      <div className="caja caja-login">
        <div className="login-marca">
          {mcp ? (
            <>
              {logo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img className="login-logo-mcp" src={logo} alt="" />
              ) : (
                <div className="login-escudo" aria-hidden="true">MCP</div>
              )}
              <h1 className="login-mcp">{mcp.nombre}</h1>
              <div className="login-ruc">RUC {mcp.ruc ?? "pendiente"}</div>
              <div className="login-con"><LogoSebaz tamano={26} /></div>
            </>
          ) : (
            <LogoSebaz tamano={64} />
          )}
        </div>
        <form action={ingresar}>
          <input type="hidden" name="desde" value={desde} />
          {error && <div className="aviso error">{error}</div>}
          <label className="campo">
            Correo
            <input name="correo" type="email" required autoComplete="username" />
          </label>
          <label className="campo">
            Contraseña
            <input name="clave" type="password" required autoComplete="current-password" />
          </label>
          <button className="btn primario grande" type="submit" style={{ justifyContent: "center" }}>
            Ingresar
          </button>
          <p className="tenue pequeno" style={{ margin: 0 }}>
            Cada ingreso queda registrado. Si olvidó su contraseña, comuníquese con soporte.
          </p>
        </form>
      </div>
    </main>
  );
}
