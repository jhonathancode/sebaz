import type { Metadata } from "next";
import { APP_NOMBRE } from "@/lib/formato";
import "./globals.css";

export const metadata: Metadata = {
  title: APP_NOMBRE,
  description: "Rendición mensual para Municipalidades de Centros Poblados",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es">
      <head>
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link
          href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
