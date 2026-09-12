import type { MicroSettings, PostInput, PublicAction } from "./index.js";

// Synthetic settings for tests and local previews; never seed public posts from this module.
const command = (id: string, en: string, ja: string): PublicAction => ({ kind: "command", id, label: { en, ja } });
export function createFixtureSettings(): MicroSettings {
  return {
    schemaVersion: 1,
    capturedAt: "2026-09-12T00:00:00.000Z",
    source: { platform: "macos", appVersion: "26.908.40834", appBuild: "8881", layoutVersion: 1, defaultedFields: [] },
    layout: {
      slots: [
        { slotId: "ACT06", keycapId: "MIND-", action: command("decreaseReasoning", "Less reasoning", "推論の労力を下げる") },
        { slotId: "ACT07", keycapId: "MIND+", action: command("increaseReasoning", "More reasoning", "推論の労力を上げる") },
        { slotId: "ACT08", keycapId: "NEW", action: command("newChat", "New task", "新しいタスク") },
        { slotId: "ACT09", keycapId: "SPLIT", action: command("split", "Split view", "分割表示") },
        { slotId: "ACT10_ACT11", keycapId: "MIC", action: command("voice", "Push to talk", "プッシュトゥトーク") },
        { slotId: "ACT12", keycapId: "CODEX", action: command("focusCodex", "Focus Codex", "Codexにフォーカス") },
      ],
      encoder: {
        mode: "conversation-scroll",
        clockwise: command("scrollDown", "Scroll down", "下へスクロール"),
        counterclockwise: command("scrollUp", "Scroll up", "上へスクロール"),
        press: { kind: "none" },
        longPress: command("micro.openSettings", "Micro settings", "Microの設定を開く"),
      },
      analogStick: {
        up: command("composer.togglePlanMode", "Toggle plan mode", "プランモード切替"),
        right: command("navigateForward", "Navigate forward", "進む"),
        down: command("toggleSidebar", "Toggle sidebar", "サイドバー切替"),
        left: command("navigateBack", "Navigate back", "戻る"),
      },
    },
    options: { agentSource: "recent", voiceButtonMode: "push-to-talk", separateMicrophoneKeys: false, singleTapAgentKeys: false, lightingBrightness: 100, lightingAutoOff: "3-minutes" },
    unsupported: [],
  };
}
export function createFixturePostInput(): PostInput {
  return { title: "Local test configuration", description: "Synthetic fixture for development.", settings: createFixtureSettings() };
}
