import { redirect } from "next/navigation";

export default function NuevoComprobante() {
  redirect("/comprobantes?nuevo=1");
}
