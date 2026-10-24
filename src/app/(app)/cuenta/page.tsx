import Avisos, { type ParamsAviso } from "@/components/Avisos";
import BotonConfirmar from "@/components/BotonConfirmar";
import { obtenerContexto } from "@/lib/contexto";
import { texto, volver } from "@/lib/acciones";
import { supabaseServidor } from "@/lib/supabase/server";
import { cambiarPin } from "./acciones";

async function cambiarClave(fd: FormData) {
  "use server";
  await obtenerContexto();
  const nueva = texto(fd, "nueva") ?? "";
  if (nueva.length < 10) volver("/cuenta", "error", "La clave debe tener al menos 10 caracteres.");
  if (nueva !== texto(fd, "repetir")) volver("/cuenta", "error", "Las dos claves no coinciden.");
  const supabase = await supabaseServidor();
  const { error } = await supabase.auth.updateUser({ password: nueva });
  if (error) volver("/cuenta", "error", error.message);
  volver("/cuenta", "ok", "Clave cambiada.");
}

export default async function Cuenta({ searchParams }: { searchParams: ParamsAviso }) {
  const sp = await searchParams;
  const ctx = await obtenerContexto();
  return (
    <>
      <div className="titulo-ventana"><h1>Mi cuenta · {ctx.nombre}</h1></div>
      <Avisos ok={sp.ok} error={sp.error} />
      <form action={cambiarClave} className="panel" style={{ maxWidth: 420 }}>
        <div className="panel-cab">Cambiar clave</div>
        <div className="panel-cuerpo">
          <label className="campo">Clave nueva (mínimo 10 caracteres)<input type="password" name="nueva" required minLength={10} autoComplete="new-password" /></label>
          <label className="campo">Repetir clave nueva<input type="password" name="repetir" required minLength={10} autoComplete="new-password" /></label>
          <BotonConfirmar pregunta="¿Cambiar su contraseña?" textoConfirmar="Sí, cambiar">Cambiar clave</BotonConfirmar>
        </div>
      </form>

      <form action={cambiarPin} className="panel" style={{ maxWidth: 420 }}>
        <div className="panel-cab">Cambiar PIN</div>
        <div className="panel-cuerpo">
          <span className="pequeno tenue">El PIN se le pide para aprobar y generar documentos. Es personal: no lo comparta.</span>
          <label className="campo">PIN actual<input type="password" name="pin" required inputMode="numeric" maxLength={6} autoComplete="off" /></label>
          <label className="campo">PIN nuevo (4 a 6 números)<input type="password" name="pin_nuevo" required inputMode="numeric" maxLength={6} pattern="\d{4,6}" autoComplete="off" /></label>
          <label className="campo">Repetir PIN nuevo<input type="password" name="pin_repetir" required inputMode="numeric" maxLength={6} pattern="\d{4,6}" autoComplete="off" /></label>
          <BotonConfirmar pregunta="¿Cambiar su PIN?" textoConfirmar="Sí, cambiar">Cambiar PIN</BotonConfirmar>
        </div>
      </form>
    </>
  );
}
