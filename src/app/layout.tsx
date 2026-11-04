import type { Metadata, Viewport } from "next";
import { cookies } from "next/headers";
import Mayusculas from "@/components/Mayusculas";
import { APP_NOMBRE } from "@/lib/formato";
import "./globals.css";

export const metadata: Metadata = {
  title: APP_NOMBRE,
  description: "Rendición mensual para Municipalidades de Centros Poblados",
  applicationName: APP_NOMBRE,
  icons: { icon: "/favicon.ico", apple: "/iconos/apple-touch-icon.png" },
  appleWebApp: { capable: true, title: APP_NOMBRE, statusBarStyle: "default" },
};

export const viewport: Viewport = { themeColor: "#1d5cd6", width: "device-width", initialScale: 1 };

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const tema = (await cookies()).get("tema")?.value;
  return (
    <html lang="es" data-theme={tema === "dark" || tema === "light" ? tema : undefined}>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link href="https://fonts.googleapis.com/css2?family=Public+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet" />
      </head>
      <body>
        <Mayusculas />
        {children}
      </body>
    </html>
  );
}
