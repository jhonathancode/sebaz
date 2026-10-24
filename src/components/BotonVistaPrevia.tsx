"use client";

import { useRef, useState } from "react";
import VistaPrevia from "./VistaPrevia";
import FormatoComprobante from "./formatos/FormatoComprobante";
import FormatoRecibo from "./formatos/FormatoRecibo";
import { Memorando, Orden, Requerimiento, type DatosExpediente } from "./formatos/DocumentosExpediente";
import type { Mcp } from "@/lib/contexto";

/**
 * Datos que el servidor ya conoce del documento (lo que no se escribe en el
 * formulario). Todo debe poder pasar al navegador (sin funciones).
 */
export type BaseVistaPrevia =
  | { tipo: "requerimiento" }
  | { tipo: "orden"; d: DatosExpediente; ordenTipo: string; monto: number; proveedor: unknown }
  | { tipo: "conformidad"; d: DatosExpediente; tesorero: string; cargo: string }
  | { tipo: "comprobante"; beneficiario: string; beneficiario_doc: string | null; concepto: string; importe: number; partida: string | null; hecho_por: string }
  | { tipo: "comprobante_directo"; hecho_por: string }
  | { tipo: "recibo" };

const may = (v: FormDataEntryValue | null) => String(v ?? "").toLocaleUpperCase("es-PE").trim();
const num = (v: FormDataEntryValue | null) => Number(String(v ?? "").replace(",", ".")) || 0;

function armar(base: BaseVistaPrevia, fd: FormData, mcp: Mcp): React.ReactNode {
  const fecha = String(fd.get("fecha") || new Date().toISOString().slice(0, 10));
  const anio = Number(fecha.slice(0, 4));
  switch (base.tipo) {
    case "requerimiento": {
      const items = [];
      for (let i = 1; i <= 30; i++) {
        const descripcion = may(fd.get(`desc_${i}`));
        if (!descripcion) continue;
        const cantidad = num(fd.get(`cant_${i}`));
        const precio = num(fd.get(`precio_${i}`));
        items.push({ id: String(i), item: items.length + 1, cantidad, unidad: may(fd.get(`und_${i}`)) || "UND", descripcion, precio_unitario: precio, total: Math.round(cantidad * precio * 100) / 100 });
      }
      const d = {
        e: { numero: null, anio, fecha, area_usuaria: may(fd.get("area_usuaria")) || null, meta: may(fd.get("meta")) || null, clasificador: String(fd.get("clasificador") ?? "") || null, descripcion: may(fd.get("descripcion")) },
        items,
      } as unknown as DatosExpediente;
      return <Requerimiento d={d} mcp={mcp} />;
    }
    case "orden": {
      const d = {
        ...base.d,
        orden: { numero: null, anio, fecha, plazo: may(fd.get("plazo")) || null, concepto: may(fd.get("concepto")), tipo: base.ordenTipo, tipo_proceso: "Adjudicación directa", monto: base.monto, proveedores: base.proveedor },
      } as unknown as DatosExpediente;
      return <Orden d={d} mcp={mcp} />;
    }
    case "conformidad": {
      const d = { ...base.d, conformidad: { memorando_numero: null, anio, fecha, texto: String(fd.get("texto") ?? "") } } as unknown as DatosExpediente;
      return <Memorando d={d} mcp={mcp} tesorero={base.tesorero} cargo={base.cargo} />;
    }
    case "comprobante":
      return (
        <FormatoComprobante
          mcp={mcp}
          c={{
            numero: null,
            fecha,
            beneficiario: may(fd.get("beneficiario")) || base.beneficiario,
            beneficiario_doc: String(fd.get("beneficiario_doc") ?? "") || base.beneficiario_doc,
            concepto: base.concepto,
            importe: base.importe,
            deducciones: 0,
            partida: base.partida,
            funcional: String(fd.get("categoria_funcion") ?? "").split("|")[0] || null,
            cheque: String(fd.get("cheque") ?? "").trim() || null,
            hecho_por: base.hecho_por,
          }}
        />
      );
    case "comprobante_directo":
      return (
        <FormatoComprobante
          mcp={mcp}
          c={{
            numero: null,
            fecha,
            beneficiario: may(fd.get("beneficiario")),
            beneficiario_doc: String(fd.get("beneficiario_doc") ?? "") || null,
            concepto: may(fd.get("concepto")),
            importe: num(fd.get("importe")),
            deducciones: num(fd.get("deducciones")),
            partida: String(fd.get("partida") ?? "") || null,
            funcional: String(fd.get("categoria_funcion") ?? "").split("|")[0] || null,
            cheque: String(fd.get("cheque") ?? "").trim() || null,
            hecho_por: base.hecho_por,
          }}
        />
      );
    case "recibo":
      return (
        <FormatoRecibo
          mcp={mcp}
          r={{ numero: null, anio, fecha, pagador_nombre: may(fd.get("pagador_nombre")), pagador_doc: String(fd.get("pagador_doc") ?? "") || null, concepto: may(fd.get("concepto")), monto: num(fd.get("monto")) }}
        />
      );
  }
}

/** Botón «Ver vista previa»: muestra el documento con lo escrito y desde ahí se emite. */
export default function BotonVistaPrevia({
  base,
  mcp,
  texto = "Ver vista previa",
  textoEmitir = "Sí, emitir",
  titulo = "Vista previa del documento",
}: {
  base: BaseVistaPrevia;
  mcp: Mcp;
  texto?: string;
  textoEmitir?: string;
  titulo?: string;
}) {
  const boton = useRef<HTMLButtonElement>(null);
  const [contenido, setContenido] = useState<React.ReactNode>(null);

  function abrir() {
    const form = boton.current?.form;
    if (!form) return;
    if (!form.checkValidity()) return form.reportValidity();
    setContenido(armar(base, new FormData(form), mcp));
  }

  return (
    <>
      <button ref={boton} type="button" className="btn primario" onClick={abrir}>
        {texto}
      </button>
      <VistaPrevia
        abierta={contenido !== null}
        titulo={titulo}
        onCerrar={() => setContenido(null)}
        onEmitir={() => {
          const form = boton.current?.form;
          setContenido(null);
          form?.requestSubmit();
        }}
        textoEmitir={textoEmitir}
      >
        {contenido}
      </VistaPrevia>
    </>
  );
}
