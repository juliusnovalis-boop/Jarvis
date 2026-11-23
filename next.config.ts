import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Produit .next/standalone : serveur Node autonome, nécessaire au paquet
  // Windows complet (Jarvis-Complete-Portable.zip / Setup.exe) — aucun npm
  // install sur le PC utilisateur, le serveur part de server.js.
  output: "standalone",
  // Clients IMAP/SMTP : laissés hors bundle (API Node natives, gros paquets).
  serverExternalPackages: ["imapflow", "nodemailer"],
};

export default nextConfig;
