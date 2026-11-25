import type { Metadata } from "next";
import JarvisApp from "@/components/jarvis/JarvisApp";

export const metadata: Metadata = {
  title: "J.A.R.V.I.S. — Assistant Vocal Intelligent",
  description: "Just A Rather Very Intelligent System. Assistant personnel et console de contrôle.",
};

/** Alias : l'assistant reste accessible sur son URL d'origine. */
export default function AssistantPage() {
  return <JarvisApp />;
}
