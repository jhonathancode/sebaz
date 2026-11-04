import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // Los documentos de respaldo de los relevos se suben por formulario (Vercel admite hasta 4,5 MB por envío)
  // Las páginas ya visitadas se guardan un rato en el navegador: volver a ellas o repetir un clic es instantáneo.
  // Al guardar algo, el sistema las renueva solo.
  experimental: { serverActions: { bodySizeLimit: "4.5mb" }, staleTimes: { dynamic: 30, static: 180 } },
  // La dirección «/inicio» ya no se usa: el inicio está en la raíz
  async redirects() {
    return [{ source: "/inicio", destination: "/", permanent: false }];
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
        ],
      },
    ];
  },
};

export default nextConfig;
