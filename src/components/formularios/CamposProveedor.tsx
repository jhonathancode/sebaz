"use client";

import AutoDocumento from "@/components/AutoDocumento";
import { useRef, useState } from "react";

export type ProveedorConocido = { num_doc: string; razon_social: string; direccion: string | null; telefono: string | null };

/**
 * RUC/DNI y razón social del proveedor. Si ya se usó antes, al escribir el RUC
 * o elegir el nombre se llenan solos sus datos.
 */
export default function CamposProveedor({ proveedores, prefijo = "prov" }: { proveedores: ProveedorConocido[]; prefijo?: string }) {
  const caja = useRef<HTMLDivElement>(null);
  const [conocido, setConocido] = useState<ProveedorConocido | null>(null);
  const [doc, setDoc] = useState("");
  const [razon, setRazon] = useState("");
  const [dir, setDir] = useState("");
  const [tel, setTel] = useState("");

  function aplicar(p: ProveedorConocido | undefined) {
    setConocido(p ?? null);
    if (p) {
      setDoc(p.num_doc);
      setRazon(p.razon_social);
      setDir(p.direccion ?? "");
      setTel(p.telefono ?? "");
    }
  }

  return (
    <div ref={caja} className="rejilla-2">
      <AutoDocumento doc="num_doc" nombre="razon_social" direccion="direccion" />
      <datalist id={`${prefijo}-docs`}>
        {proveedores.map((p) => (
          <option key={p.num_doc} value={p.num_doc}>{p.razon_social}</option>
        ))}
      </datalist>
      <datalist id={`${prefijo}-nombres`}>
        {proveedores.map((p) => (
          <option key={p.num_doc} value={p.razon_social} />
        ))}
      </datalist>
      <label className="campo">
        RUC o DNI del proveedor
        <input
          name="num_doc"
          required
          inputMode="numeric"
          maxLength={11}
          list={`${prefijo}-docs`}
          value={doc}
          placeholder="11 u 8 dígitos"
          onChange={(e) => {
            const v = e.target.value.replace(/\D/g, "");
            setDoc(v);
            const p = proveedores.find((x) => x.num_doc === v);
            if (p) aplicar(p);
            else setConocido(null);
          }}
        />
      </label>
      <label className="campo">
        Nombre o razón social
        <input
          name="razon_social"
          list={`${prefijo}-nombres`}
          value={razon}
          required={!conocido}
          placeholder="Escriba o elija de la lista"
          onChange={(e) => {
            setRazon(e.target.value);
            const p = proveedores.find((x) => x.razon_social.toUpperCase() === e.target.value.toUpperCase());
            if (p) aplicar(p);
          }}
        />
      </label>
      {conocido ? (
        <div className="aviso ok" style={{ margin: 0, gridColumn: "1 / -1" }}>
          ✓ Proveedor ya registrado: {conocido.razon_social}{conocido.direccion ? ` · ${conocido.direccion}` : ""}
        </div>
      ) : (
        <>
          <label className="campo">Dirección<input name="direccion" value={dir} onChange={(e) => setDir(e.target.value)} placeholder="Solo si es nuevo" /></label>
          <label className="campo">Teléfono<input name="telefono" value={tel} inputMode="tel" onChange={(e) => setTel(e.target.value)} placeholder="Solo si es nuevo" /></label>
        </>
      )}
    </div>
  );
}
