import type { NextConfig } from "next";

// Chaîne d'installateur Windows (scripts/build-complete-installer.sh) :
//   NEXT_OUTPUT=standalone npx next build   →   .next-standalone/standalone
// La prévisualisation garde la sortie classique dans .next, puisque
// `next start` refuse explicitement la sortie standalone.
const standalone = process.env.NEXT_OUTPUT === "standalone";

const nextConfig: NextConfig = {
  ...(standalone ? { output: "standalone" as const, distDir: ".next-standalone" } : {}),
  // Clients IMAP/SMTP : laissés hors bundle (API Node natives, gros paquets).
  serverExternalPackages: ["imapflow", "nodemailer"],
};

export default nextConfig;
