import BotonConfirmar from "@/components/BotonConfirmar";
import CampoPin from "@/components/CampoPin";
import LogoSebaz from "@/components/LogoSebaz";
import { TERMINOS } from "@/lib/terminos";
import { completarIngreso } from "@/app/(app)/cuenta/acciones";
import AvisoUrl from "@/components/AvisoUrl";

/** Primer ingreso: condiciones de uso y PIN personal. No se puede saltar. */
export default function Bienvenida({ nombre, pendiente, salir }: { nombre: string; pendiente: { terminos: boolean; pin: boolean }; salir: () => Promise<void> }) {
  return (
    <main className="login">
      <div className="caja caja-login" style={{ maxWidth: 520 }}>
        <div className="login-marca"><LogoSebaz tamano={44} /></div>
        <form action={completarIngreso}>
          <div>
            <h1 style={{ margin: 0, fontSize: 20 }}>Bienvenido(a), {nombre}</h1>
            <p className="tenue" style={{ margin: "4px 0 0" }}>
              {pendiente.terminos ? "Antes de empezar, lea y acepte las condiciones de uso" : "Para continuar, elija su PIN personal"}
              {pendiente.terminos && pendiente.pin ? " y elija su PIN personal." : "."}
            </p>
          </div>
          <AvisoUrl />
          {pendiente.terminos && (
            <>
              <ol style={{ margin: 0, paddingLeft: 20, display: "flex", flexDirection: "column", gap: 8 }}>
                {TERMINOS.map((t) => (
                  <li key={t}>{t}</li>
                ))}
              </ol>
              <label className="cheque-marca">
                <input type="checkbox" name="acepto" value="1" required />
                <span><b>Leí y acepto estas condiciones</b></span>
              </label>
            </>
          )}
          {pendiente.pin && (
            <div className="panel" style={{ padding: 14, display: "flex", flexDirection: "column", gap: 10 }}>
              <div>
                <b>Su PIN personal</b>
                <div className="pequeno tenue">De 4 a 6 números. Se le pedirá para aprobar, generar comprobantes y rendiciones. No lo comparta: si lo olvida, solo soporte puede restablecerlo.</div>
              </div>
              <div className="rejilla-2">
                <CampoPin name="pin_nuevo" etiqueta="Cree su PIN" required />
                <CampoPin name="pin_repetir" etiqueta="Repita el PIN" required />
              </div>
            </div>
          )}
          <BotonConfirmar className="btn primario grande" pregunta="¿Guardar y entrar al sistema?" textoConfirmar="Sí, continuar">Continuar</BotonConfirmar>
        </form>
        <form action={salir} style={{ padding: "0 24px 20px" }}>
          <button className="btn chico" type="submit">Salir</button>
        </form>
      </div>
    </main>
  );
}
