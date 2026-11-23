import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Produit .next/standalone : serveur Node autonome, nécessaire au paquet
  // Windows complet (aucun npm install sur le PC utilisateur).
  output: "standalone",
};

export default nextConfig;
