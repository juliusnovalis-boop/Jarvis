import type { Metadata } from "next";
import { GameStudio } from "@/components/studio/GameStudio";

export const metadata: Metadata = {
  title: "JARVIS Studio 3D — Montage, jeu et création",
  description:
    "Studio 3D temps réel de JARVIS : éditeur de mondes, matériaux PBR, exploration jouable, connexions MCP, skills, agents IA et montage vidéo.",
};

/** Le studio s'ouvre après l'assistant, sur sa propre route. */
export default function StudioPage() {
  return <GameStudio />;
}
