import { redirect } from "next/navigation";

export default function NuevoExpediente() {
  redirect("/expedientes?nuevo=1");
}
