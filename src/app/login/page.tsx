import { redirect } from "next/navigation";
import { supabaseServidor } from "@/lib/supabase/server";
import { APP_NOMBRE } from "@/lib/formato";

async function ingresar(fd: FormData) {
  "use server";
  const correo = String(fd.get("correo") ?? "").trim();
  const clave = String(fd.get("clave") ?? "");
  const supabase = await supabaseServidor();
  const { error } = await supabase.auth.signInWithPassword({ email: correo, password: clave });
  if (error) redirect("/login?error=" + encodeURIComponent("Correo o contraseña incorrectos."));
  await supabase.rpc("registrar_acceso");
  redirect("/");
}

export default async function Login({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  return (
    <main className="login">
      <div className="caja">
        <div className="caja-cab">{APP_NOMBRE}</div>
        <form action={ingresar}>
          {error && <div className="aviso error">{error}</div>}
          <label className="campo">
            Correo
            <input name="correo" type="email" required autoComplete="username" />
          </label>
          <label className="campo">
            Contraseña
            <input name="clave" type="password" required autoComplete="current-password" />
          </label>
          <button className="btn primario" type="submit" style={{ justifyContent: "center" }}>
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
