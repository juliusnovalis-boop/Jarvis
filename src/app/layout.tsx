import type { Metadata, Viewport } from "next";
import { Inter, Orbitron, Rajdhani, Share_Tech_Mono } from "next/font/google";
import type { ReactNode } from "react";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], weight: ["400", "500", "600", "700"], variable: "--font-studio" });
const orbitron = Orbitron({ subsets: ["latin"], weight: ["500", "700", "900"], variable: "--font-orbitron" });
const rajdhani = Rajdhani({ subsets: ["latin"], weight: ["400", "500", "600", "700"], variable: "--font-rajdhani" });
const shareTech = Share_Tech_Mono({ subsets: ["latin"], weight: ["400"], variable: "--font-sharetech" });

export const metadata: Metadata = {
  title: "J.A.R.V.I.S. — Assistant Vocal Intelligent",
  description: "Just A Rather Very Intelligent System. Assistant personnel et studio de création de mondes 3D.",
};
export const viewport: Viewport = { themeColor: "#191b1d" };

export default function RootLayout({ children }: { children: ReactNode }) {
  return <html lang="fr"><body className={`${inter.variable} ${orbitron.variable} ${rajdhani.variable} ${shareTech.variable} bg-[#01040c] font-sans text-slate-100 antialiased`}>{children}</body></html>;
}
