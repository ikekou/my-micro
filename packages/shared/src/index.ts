import { z } from "zod";

export const SCHEMA_VERSION = 1;
export const DEVICE_CLIENT_ID = "my-micro";
export const REPOSITORY_URL = "https://github.com/ikekou/my-micro";
export const MAX_POST_BYTES = 65_536;
export type Locale = "en" | "ja";

const identifier = z.string().min(1).max(100).regex(/^[A-Za-z0-9_.:-]+$/);
const localizedLabel = z.object({ en: z.string().min(1).max(160), ja: z.string().min(1).max(160) }).strict();

export const actionSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("command"), id: identifier, label: localizedLabel }).strict(),
  z.object({ kind: z.literal("skill"), name: z.string().min(1).max(100) }).strict(),
  z.object({ kind: z.literal("text"), redacted: z.literal(true) }).strict(),
  z.object({ kind: z.literal("none") }).strict(),
  z.object({ kind: z.literal("unsupported") }).strict(),
]);
export type PublicAction = z.infer<typeof actionSchema>;

export const slotIds = ["ACT06", "ACT07", "ACT08", "ACT09", "ACT10", "ACT11", "ACT10_ACT11", "ACT12"] as const;
export const slotSchema = z.object({
  slotId: z.enum(slotIds),
  keycapId: z.string().min(1).max(100).regex(/^[A-Za-z0-9_.:+-]+$/),
  action: actionSchema,
}).strict();
export type MicroSlot = z.infer<typeof slotSchema>;

export const microSettingsSchema = z.object({
  schemaVersion: z.literal(SCHEMA_VERSION),
  capturedAt: z.iso.datetime(),
  source: z.object({
    platform: z.literal("macos"),
    appVersion: z.string().regex(/^\d+\.\d+\.\d+$/),
    appBuild: z.string().regex(/^\d{1,10}$/).optional(),
    layoutVersion: z.literal(1),
    defaultedFields: z.array(identifier).max(40).default([]),
  }).strict(),
  layout: z.object({
    slots: z.array(slotSchema).min(6).max(7),
    encoder: z.object({ mode: identifier, clockwise: actionSchema, counterclockwise: actionSchema, press: actionSchema, longPress: actionSchema }).strict(),
    analogStick: z.object({ up: actionSchema, right: actionSchema, down: actionSchema, left: actionSchema }).strict(),
  }).strict(),
  options: z.object({
    agentSource: z.enum(["recent", "pinned", "priority", "custom"]),
    voiceButtonMode: z.enum(["push-to-talk", "realtime"]),
    separateMicrophoneKeys: z.boolean(),
    singleTapAgentKeys: z.boolean(),
    lightingBrightness: z.number().int().min(0).max(100),
    lightingAutoOff: z.enum(["off", "30-seconds", "1-minute", "3-minutes", "10-minutes", "30-minutes", "1-hour"]),
  }).strict(),
  unsupported: z.array(z.object({ field: identifier, reason: z.enum(["unknown-field", "unknown-action", "unavailable"]) }).strict()).max(30),
}).strict().superRefine((settings, ctx) => {
  const ids = settings.layout.slots.map((slot) => slot.slotId);
  if (new Set(ids).size !== ids.length) ctx.addIssue({ code: "custom", path: ["layout", "slots"], message: "Duplicate control slots" });
  const combined = ids.includes("ACT10_ACT11");
  const separate = ids.includes("ACT10") || ids.includes("ACT11");
  const required = ["ACT06", "ACT07", "ACT08", "ACT09", "ACT12", ...(settings.options.separateMicrophoneKeys ? ["ACT10", "ACT11"] : ["ACT10_ACT11"])];
  if (required.some((id) => !ids.includes(id as MicroSlot["slotId"]))) ctx.addIssue({ code: "custom", path: ["layout", "slots"], message: "Missing control slots" });
  if (combined && separate) ctx.addIssue({ code: "custom", path: ["layout", "slots"], message: "Combined and separate microphone keys cannot coexist" });
  if (settings.options.separateMicrophoneKeys && combined) ctx.addIssue({ code: "custom", path: ["layout", "slots"], message: "Microphone layout does not match split option" });
  if (!settings.options.separateMicrophoneKeys && separate) ctx.addIssue({ code: "custom", path: ["layout", "slots"], message: "Microphone layout does not match combined option" });
});
export type MicroSettings = z.infer<typeof microSettingsSchema>;

export const postInputSchema = z.object({
  title: z.string().trim().min(1).max(100),
  description: z.string().trim().max(2000),
  settings: microSettingsSchema,
}).strict();
export type PostInput = z.infer<typeof postInputSchema>;
export const postUpdateSchema = postInputSchema.extend({ version: z.number().int().min(1) });
export type PostUpdate = z.infer<typeof postUpdateSchema>;
export interface PublicAuthor { id: string; username: string; avatarUrl: string | null }
export interface PublicPost extends PostInput { id: string; author: PublicAuthor; version: number; createdAt: string; updatedAt: string }
export interface PostPage { items: PublicPost[]; page: { seed: string; cutoff: string; cursor: string | null } }
export interface SessionInfo { id: string; createdAt: string; expiresAt: string; userAgent: string | null; current: boolean }
export interface SessionPage { sessions: SessionInfo[]; currentSession: SessionInfo | null; page: { cursor: string | null } }
export interface ApiError { error: { code: string; message: string } }

export function actionLabel(action: PublicAction, locale: Locale): string {
  switch (action.kind) {
    case "command": return action.label[locale];
    case "skill": return action.name;
    case "text": return locale === "ja" ? "定型文（内容非公開）" : "Text shortcut (private)";
    case "none": return locale === "ja" ? "未割り当て" : "Unassigned";
    case "unsupported": return locale === "ja" ? "未対応の機能" : "Unsupported action";
  }
}

export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`).join(",")}}`;
}

export async function snapshotHash(input: PostInput): Promise<string> {
  const validated = postInputSchema.parse(input);
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonicalJson(validated)));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}
