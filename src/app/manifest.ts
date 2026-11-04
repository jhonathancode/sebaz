import type { MetadataRoute } from "next";
import { APP_NOMBRE } from "@/lib/formato";

/** Hace que ZEBAZ se instale como app en el celular: abre a pantalla completa, sin la barra del navegador. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: `${APP_NOMBRE} · Sistema de control`,
    short_name: APP_NOMBRE,
    description: "Rendición mensual para Municipalidades de Centros Poblados",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#1d5cd6",
    theme_color: "#1d5cd6",
    lang: "es",
    icons: [
      { src: "/iconos/icono-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/iconos/icono-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/iconos/icono-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
