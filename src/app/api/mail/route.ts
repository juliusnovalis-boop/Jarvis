import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * 📧 API MAIL — IMAP (réception) + SMTP (envoi)
 *
 *  POST /api/mail
 *    { action:"inbox",  host, port, secure, user, pass, limit? } → messages
 *    { action:"send",   host, port, secure, user, pass, to, subject, text } → envoi
 *    { action:"test",   host, port, secure, user, pass } → test de connexion
 *
 *  Sans identifiants : mode DÉMO (boîte d'exemple) pour que l'interface reste
 *  utilisable. Les identifiants ne sont jamais stockés : ils ne servent que
 *  pour la requête en cours.
 */

interface MailCreds {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
}

const DEMO = [
  {
    id: "d1", from: "Service Facturation <facturation@edf.fr>", to: "moi",
    subject: "Votre facture du mois — 84,32 €", date: new Date(Date.now() - 3600e3 * 2).toISOString(),
    unread: true, tag: "Factures",
    body: "Bonjour,\n\nVotre facture d'électricité du mois est disponible : 84,32 €, à débiter le 28 du mois.\n\nMontant régularisé : −6,10 € par rapport au mois dernier.\n\nCordialement,\nService Client EDF",
  },
  {
    id: "d2", from: "Marie Dupont <marie.dupont@atelier.fr>", to: "moi",
    subject: "Réunion de suivi — jeudi 14h", date: new Date(Date.now() - 3600e3 * 7).toISOString(),
    unread: true, tag: "Travail",
    body: "Salut,\n\nOn se cale jeudi à 14h pour le point sur la livraison ? J'ai préparé le compte rendu des deux dernières semaines et la liste des ouverts.\n\nDis-moi si l'horaire te va.\n\nMarie",
  },
  {
    id: "d3", from: "GitHub <noreply@github.com>", to: "moi",
    subject: "[jarvis] Build réussi — main @ a9399d0", date: new Date(Date.now() - 3600e3 * 22).toISOString(),
    unread: false, tag: "Tech",
    body: "Le workflow « build » vient de se terminer avec succès sur la branche main.\n\nDurée : 3 min 12 s\nArtefacts : .next/standalone, Jarvis-Complete-Setup.exe\n\n— GitHub Actions",
  },
  {
    id: "d4", from: "Banque Populaire <no-reply@bp.fr>", to: "moi",
    subject: "Relevé de compte disponible", date: new Date(Date.now() - 3600e3 * 40).toISOString(),
    unread: false, tag: "Banque",
    body: "Votre relevé de compte du 1 au 15 du mois est disponible dans votre espace.\n\nSolde : 3 214,08 €\n3 opérations récurrentes détectées.\n\nNe communiquez jamais vos identifiants par e-mail.",
  },
  {
    id: "d5", from: "Newsletter Dev <hello@weekly.dev>", to: "moi",
    subject: "MCP, agents IA et studios : la semaine en 5 liens", date: new Date(Date.now() - 3600e3 * 60).toISOString(),
    unread: false, tag: "Tech",
    body: "1. Comprendre le Model Context Protocol en 10 minutes\n2. Blender + MCP : piloter une scène en langage naturel\n3. Agents autonomes : garde-fous et outils\n4. Timeline vidéo dans le navigateur\n5. Mini-moteur de jeu en Canvas 2D\n\nBonne semaine de dev !",
  },
];

function readCredentials(body: any): MailCreds | null {
  const host = String(body?.host ?? "").trim();
  const user = String(body?.user ?? "").trim();
  const pass = String(body?.pass ?? "");
  if (!host || !user || !pass) return null;
  const port = Number(body?.port) || (String(body?.secure) === "true" || body?.secure === true ? 993 : 993);
  const secure = body?.secure === true || body?.secure === "true" || port === 465 || port === 993;
  return { host, port, secure, user, pass };
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const action = String(body?.action ?? "inbox");
    const creds = readCredentials(body);

    /* ---------- Mode démo : aucune identifiant fourni ---------- */
    if (!creds) {
      if (action === "send") {
        return NextResponse.json({
          demo: true,
          ok: false,
          error: "Compte non connecté : renseignez hôte SMTP, identifiant et mot de passe pour envoyer.",
        });
      }
      const limit = Math.min(50, Number(body?.limit) || 20);
      return NextResponse.json({ demo: true, ok: true, messages: DEMO.slice(0, limit) });
    }

    /* ---------- Test de connexion ---------- */
    if (action === "test") {
      const { ImapFlow } = await import("imapflow");
      const client = new ImapFlow({ host: creds.host, port: creds.port, secure: creds.secure, auth: { user: creds.user, pass: creds.pass }, logger: false, tls: { rejectUnauthorized: false } });
      await client.connect();
      const box = await client.mailboxOpen("INBOX");
      const out = { ok: true, messages: box.exists, host: creds.host, user: creds.user };
      await client.logout();
      return NextResponse.json(out);
    }

    /* ---------- Réception IMAP ---------- */
    if (action === "inbox") {
      const { ImapFlow } = await import("imapflow");
      const client = new ImapFlow({
        host: creds.host, port: creds.port, secure: creds.secure,
        auth: { user: creds.user, pass: creds.pass },
        logger: false, tls: { rejectUnauthorized: false },
      });
      await client.connect();
      const lock = await client.getMailboxLock("INBOX");
      try {
        const limit = Math.min(50, Number(body?.limit) || 20);
        const selected = client.mailbox;
        const total = selected && typeof selected === "object" ? selected.exists : limit;
        const from = Math.max(1, total - limit + 1);
        const messages: any[] = [];
        for await (const msg of client.fetch(`${from}:*`, { uid: true, envelope: true, internalDate: true, flags: true, bodyStructure: true })) {
          const env = msg.envelope;
          const fromAddr = env?.from?.[0];
          // internalDate est `Date | string | undefined` selon le serveur IMAP
          const rawDate = msg.internalDate;
          const when = rawDate instanceof Date ? rawDate : new Date(rawDate || Date.now());
          messages.push({
            id: String(msg.uid),
            from: fromAddr?.name ? `${fromAddr.name} <${fromAddr.address ?? ""}>` : (fromAddr?.address ?? "(expéditeur inconnu)"),
            subject: env?.subject ?? "(sans objet)",
            date: when.toISOString(),
            unread: !msg.flags?.has("\\Seen"),
            body: "",
          });
        }
        messages.reverse();
        // internalDate peut être une chaîne ou une Date selon le serveur
        for (const m of messages) m.date = new Date(m.date).toISOString();
        return NextResponse.json({ demo: false, ok: true, messages });
      } finally {
        lock.release();
        await client.logout();
      }
    }

    /* ---------- Envoi SMTP ---------- */
    if (action === "send") {
      const to = String(body?.to ?? "").trim();
      const subject = String(body?.subject ?? "").trim();
      const text = String(body?.text ?? "").trim();
      if (!to || !subject || !text) {
        return NextResponse.json({ ok: false, error: "Destinataire, objet et message sont requis." }, { status: 400 });
      }
      const nodemailer = (await import("nodemailer")).default;
      const transport = nodemailer.createTransport({
        host: creds.host,
        port: Number(body?.smtpPort) || (creds.secure ? 465 : 587),
        secure: Number(body?.smtpPort) === 465 || body?.smtpSecure === true,
        auth: { user: creds.user, pass: creds.pass },
        tls: { rejectUnauthorized: false },
      });
      await transport.verify();
      const info = await transport.sendMail({
        from: creds.user,
        to,
        subject,
        text,
        ...(body?.html ? { html: String(body.html) } : {}),
      });
      return NextResponse.json({ ok: true, id: info.messageId, accepted: info.accepted });
    }

    return NextResponse.json({ ok: false, error: `Action inconnue : ${action}` }, { status: 400 });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Échec";
    console.error("[JARVIS /api/mail]", msg);
    return NextResponse.json({ ok: false, error: `Échec de la messagerie : ${msg}` }, { status: 502 });
  }
}
