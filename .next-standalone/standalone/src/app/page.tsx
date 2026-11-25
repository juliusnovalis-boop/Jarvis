import type { Metadata } from "next";
import JarvisApp from "@/components/jarvis/JarvisApp";

export const metadata: Metadata = {
  title: "J.A.R.V.I.S. — Assistant Vocal Intelligent",
  description:
    "Just A Rather Very Intelligent System. Assistant personnel : voix, mémoire, contrôle du PC, studio 3D et montage vidéo.",
};

/** Accueil du logiciel : l'interface JARVIS s'ouvre avant le studio. */
export default function HomePage() {
  return <JarvisApp />;
}
