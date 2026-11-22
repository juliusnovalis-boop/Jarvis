import { boolean, integer, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";

// Historique complet des échanges (mémoire de conversation, façon Yt027/Jarvis)
export const messages = pgTable("messages", {
  id: serial("id").primaryKey(),
  role: text("role").notNull(), // "user" | "jarvis"
  content: text("content").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Notes dictées par l'utilisateur
export const notes = pgTable("notes", {
  id: serial("id").primaryKey(),
  content: text("content").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Liste de tâches
export const tasks = pgTable("tasks", {
  id: serial("id").primaryKey(),
  content: text("content").notNull(),
  done: boolean("done").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Mémoire long terme : prénom, ville par défaut, préférences…
export const memories = pgTable("memories", {
  id: serial("id").primaryKey(),
  key: text("key").notNull().unique(),
  value: text("value").notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// 🏠 DOMOTIQUE — appareils (simulés ou miroir Home Assistant)
export const devices = pgTable("devices", {
  id: serial("id").primaryKey(),
  entityId: text("entity_id").notNull().unique(), // light.salon
  name: text("name").notNull(),                   // Lumière du salon
  room: text("room").notNull(),                   // salon
  kind: text("kind").notNull(),                   // light | plug | thermostat | cover | media | sensor
  state: text("state").notNull().default("off"),  // on | off
  level: integer("level").default(0).notNull(),   // luminosité %, température °C, position %
  source: text("source").notNull().default("sim"), // sim | homeassistant
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// 📱 FILE DE COMMANDES — l'app mobile pousse, le poste principal consomme et parle
export const commandQueue = pgTable("command_queue", {
  id: serial("id").primaryKey(),
  text: text("text").notNull(),
  origin: text("origin").notNull().default("mobile"),
  status: text("status").notNull().default("pending"), // pending | done
  reply: text("reply"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// 📅 AGENDA — rendez-vous dictés à Jarvis
export const events = pgTable("events", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  at: timestamp("at").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// 🖥️ PC LIÉS — les machines qui exécutent l'agent Jarvis
export const pcNodes = pgTable("pc_nodes", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  platform: text("platform").notNull().default("unknown"), // windows | linux | darwin
  token: text("token").notNull().unique(),
  lastSeenAt: timestamp("last_seen_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// File de travaux envoyés aux PC : souris, clavier, shell, captures…
export const nodeJobs = pgTable("node_jobs", {
  id: serial("id").primaryKey(),
  nodeId: integer("node_id").notNull(),
  kind: text("kind").notNull(),           // shell | open | mouse_move | mouse_click | type | screenshot | notify | lock | volume
  payload: text("payload").notNull(),     // JSON
  status: text("status").notNull().default("pending"), // pending | running | done | error
  result: text("result"),
  attachment: text("attachment"),         // capture d'écran en data URL
  createdAt: timestamp("created_at").defaultNow().notNull(),
  finishedAt: timestamp("finished_at"),
});

// 🤖 AGENTS IA créés par l'utilisateur
export const agents = pgTable("agents", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
  role: text("role").notNull(),           // mission / prompt système
  tools: text("tools").notNull().default("[]"), // JSON: domaines autorisés
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// 👁️ VISION — journal des analyses de la caméra
export const visionLogs = pgTable("vision_logs", {
  id: serial("id").primaryKey(),
  summary: text("summary").notNull(),
  engine: text("engine").notNull().default("local"), // local | ollama-llava | openai | anthropic
  faces: integer("faces").default(0).notNull(),
  brightness: integer("brightness").default(0).notNull(),
  motion: integer("motion").default(0).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
