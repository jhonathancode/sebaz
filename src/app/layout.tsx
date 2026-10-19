import type { Metadata } from "next";
import { cookies } from "next/headers";
import { APP_NOMBRE } from "@/lib/formato";
import "./globals.css";

export const metadata: Metadata = {
  title: APP_NOMBRE,
  description: "Rendición mensual para Municipalidades de Centros Poblados",
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const tema = (await cookies()).get("tema")?.value;
  return (
    <html lang="es" data-theme={tema === "dark" || tema === "light" ? tema : undefined}>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600&display=swap" rel="stylesheet" />
      </head>
      <body>{children}</body>
    </html>
  );
}
