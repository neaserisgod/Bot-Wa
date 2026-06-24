/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // better-sqlite3 es un módulo nativo: hay que dejar que Next lo cargue como
  // dependencia externa del servidor en vez de intentar empaquetarlo.
  experimental: {
    serverComponentsExternalPackages: ['better-sqlite3'],
  },
};

export default nextConfig;
