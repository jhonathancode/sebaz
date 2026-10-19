import { FUNCIONES } from "@/lib/catalogos";

/** Función y categoría del gasto, para el informe por funciones (Chanchamayo). */
export default function SelectFuncion({ valor }: { valor?: string }) {
  return (
    <label className="campo">
      Función del gasto (informe de Chanchamayo)
      <select name="categoria_funcion" defaultValue={valor ?? ""}>
        <option value="">— Elegir —</option>
        {FUNCIONES.map((f) => (
          <optgroup key={f.funcion} label={f.funcion}>
            {f.categorias.map((c) => (
              <option key={c} value={`${f.funcion}|${c}`}>{c}</option>
            ))}
          </optgroup>
        ))}
      </select>
    </label>
  );
}
