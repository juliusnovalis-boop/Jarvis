import { NextRequest, NextResponse } from "next/server";
import { haConfigured, listDevices, setDevice } from "@/lib/jarvis/home";

export const dynamic = "force-dynamic";

export async function GET() {
  const devices = await listDevices();
  return NextResponse.json({ devices, homeAssistant: haConfigured() });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const entityId: string = String(body?.entityId ?? "");
    if (!entityId) return NextResponse.json({ error: "entityId requis" }, { status: 400 });

    const patch: { state?: string; level?: number } = {};
    if (body?.state === "on" || body?.state === "off") patch.state = body.state;
    if (typeof body?.level === "number") patch.level = Math.max(0, Math.min(100, Math.round(body.level)));
    if (body?.toggle) {
      const current = (await listDevices()).find((d) => d.entityId === entityId);
      patch.state = current?.state === "on" ? "off" : "on";
    }

    await setDevice(entityId, patch);
    const devices = await listDevices();
    return NextResponse.json({ devices, homeAssistant: haConfigured() });
  } catch (error) {
    console.error("[JARVIS /api/devices]", error);
    return NextResponse.json({ error: "Échec de la commande" }, { status: 500 });
  }
}
