import assert from "node:assert/strict";
import test from "node:test";
import { actionSchema, microSettingsSchema, postInputSchema, snapshotHash } from "../src/index.js";
import { createFixturePostInput, createFixtureSettings } from "../src/fixtures.js";

test("accepts real plus-sign keycaps and preserves supported metadata", () => {
  const settings = microSettingsSchema.parse(createFixtureSettings());
  assert.equal(settings.layout.slots[1].keycapId, "MIND+");
  assert.equal(settings.source.appBuild, "8881");
});

test("private fields cannot enter a public settings payload", () => {
  assert.equal(actionSchema.safeParse({ kind: "skill", name: "example", skillPath: "/private/secret" }).success, false);
  assert.equal(actionSchema.safeParse({ kind: "text", redacted: true, text: "private text" }).success, false);
  const settings = createFixtureSettings();
  assert.equal(microSettingsSchema.safeParse({ ...settings, rawConfig: "private" }).success, false);
  assert.equal(postInputSchema.safeParse({ ...createFixturePostInput(), token: "private" }).success, false);
});

test("rejects duplicate, missing, and contradictory microphone slots", () => {
  const duplicate = createFixtureSettings();
  duplicate.layout.slots[1] = duplicate.layout.slots[0];
  assert.equal(microSettingsSchema.safeParse(duplicate).success, false);
  const missing = createFixtureSettings();
  missing.layout.slots.pop();
  assert.equal(microSettingsSchema.safeParse(missing).success, false);
  const split = createFixtureSettings();
  split.options.separateMicrophoneKeys = true;
  assert.equal(microSettingsSchema.safeParse(split).success, false);
  split.layout.slots = split.layout.slots.filter((slot) => slot.slotId !== "ACT10_ACT11");
  split.layout.slots.push({ slotId: "ACT10", keycapId: "MIC1", action: { kind: "none" } }, { slotId: "ACT11", keycapId: "EMPT1", action: { kind: "none" } });
  assert.equal(microSettingsSchema.safeParse(split).success, true);
});

test("snapshot digest survives object key reordering but changes with content", async () => {
  const input = createFixturePostInput();
  const reordered = { settings: input.settings, description: input.description, title: input.title };
  assert.equal(await snapshotHash(input), await snapshotHash(reordered));
  assert.notEqual(await snapshotHash(input), await snapshotHash({ ...input, title: "Changed after preview" }));
  const changedSettings = structuredClone(input);
  changedSettings.settings.options.singleTapAgentKeys = true;
  assert.notEqual(await snapshotHash(input), await snapshotHash(changedSettings));
});
