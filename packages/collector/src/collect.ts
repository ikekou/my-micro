import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile, stat } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { parse } from 'smol-toml';
import { microSettingsSchema, type MicroSettings, type MicroSlot, type PublicAction } from '@my-micro/shared';
import { ACTION_SLOTS, DEFAULT_KEYCAPS, DEFAULT_STICK, ENCODER_MODES, KEYCAPS, KEYCAP_COMMANDS, SUPPORTED_APP, command } from './compatibility.js';
import { fail } from './errors.js';

const run = promisify(execFile);
const KNOWN_SETTINGS = ['codex-micro-layout','codex-micro-agent-source','codex-micro-single-tap-agent-keys','codex-micro-lighting-brightness','codex-micro-lighting-auto-off'];
const LIMIT = 2 * 1024 * 1024;
type RecordValue = Record<string, unknown>;
function object(value: unknown): RecordValue {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) fail('INVALID_CONFIG','The supported Micro configuration has an invalid structure. Nothing was collected.');
  return value as RecordValue;
}
function validate<T>(value: unknown, allowed: readonly T[]): T {
  if (!allowed.includes(value as T)) fail('INVALID_CONFIG','A Micro option is outside the supported values. Nothing was collected.');
  return value as T;
}
function boolean(value: unknown): boolean { if (typeof value !== 'boolean') fail('INVALID_CONFIG','A Micro option has an invalid type.'); return value; }

export interface SourceVersion { version: string; build: string }
export function collectFromToml(text: string, source: SourceVersion, capturedAt = new Date().toISOString()): MicroSettings {
  if (source.version !== SUPPORTED_APP.version || source.build !== SUPPORTED_APP.build) fail('UNSUPPORTED_APP','This Codex app version or build has not been verified. Collection stopped.');
  if (Buffer.byteLength(text) > LIMIT) fail('CONFIG_TOO_LARGE','The configuration exceeds the supported read limit.');
  let parsed: RecordValue;
  try { parsed = object(parse(text)); } catch { fail('INVALID_TOML','The configuration could not be parsed. Its contents were not logged.'); }
  const desktop = parsed.desktop === undefined ? {} : object(parsed.desktop);
  const unsupported: MicroSettings['unsupported'] = [];
  const defaultedFields: string[] = [];
  function mark(field: string, reason: MicroSettings['unsupported'][number]['reason']) {
    if (!unsupported.some((item) => item.field === field && item.reason === reason)) unsupported.push({field,reason});
  }
  function unknownKeys(record: RecordValue, keys: readonly string[], field: string) {
    if (Object.keys(record).some((key) => !keys.includes(key))) mark(field,'unknown-field');
  }
  if (Object.keys(desktop).some((key) => key.startsWith('codex-micro-') && !KNOWN_SETTINGS.includes(key))) mark('options.unknown','unknown-field');
  function fallback<T>(record: RecordValue, key: string, value: T, field: string): unknown {
    if (record[key] !== undefined) return record[key];
    defaultedFields.push(field); return value;
  }
  const layoutMissing = desktop['codex-micro-layout'] === undefined;
  const layout = layoutMissing ? {} : object(desktop['codex-micro-layout']);
  if (layoutMissing) defaultedFields.push('layout');
  else if (layout.version !== 1) fail('UNSUPPORTED_LAYOUT','The Micro layout version is not supported.');
  unknownKeys(layout,['version','slots','analogStick','encoder','encoderMode','voiceButtonMode','separateMicrophoneKeys'],'layout.unknown');
  const encoderMode = validate(fallback(layout,'encoderMode','composer-navigation','layout.encoder.mode'),['composer-navigation','reasoning','conversation-scroll','custom'] as const);
  const voiceButtonMode = validate(fallback(layout,'voiceButtonMode','push-to-talk','options.voiceButtonMode'),['push-to-talk','realtime'] as const);
  const separateMicrophoneKeys = boolean(fallback(layout,'separateMicrophoneKeys',false,'options.separateMicrophoneKeys'));
  const sourceSlots = layoutMissing ? {} : object(layout.slots);
  unknownKeys(sourceSlots,ACTION_SLOTS,'layout.slots.unknown');
  function publicAction(raw: unknown, field: string, allowText = false): PublicAction {
    if (raw === null) return {kind:'none'};
    const action = object(raw);
    if (action.type === 'command') {
      unknownKeys(action,['type','commandId'],field);
      if (typeof action.commandId !== 'string') fail('INVALID_ACTION','A Micro command assignment has an invalid structure.');
      const known = command(action.commandId);
      if (known && !Object.keys(action).some((key) => !['type','commandId'].includes(key))) return known;
    } else if (action.type === 'skill') {
      unknownKeys(action,['type','skillName','skillPath'],field);
      if (typeof action.skillName !== 'string' || typeof action.skillPath !== 'string') fail('INVALID_ACTION','A Micro skill assignment has an invalid structure.');
      // Names are the sole custom text allowed from action data; reject path-like names.
      if (/^[\p{L}\p{N}_.:+ -]{1,100}$/u.test(action.skillName) && !action.skillName.includes('..') && !Object.keys(action).some((key) => !['type','skillName','skillPath'].includes(key))) {
        return {kind:'skill',name:action.skillName};
      }
    } else if (action.type === 'composer-text' && allowText) {
      if (typeof action.text !== 'string') fail('INVALID_ACTION','A Micro text assignment has an invalid structure.');
      unknownKeys(action,['type','text'],field);
      return {kind:'text',redacted:true};
    }
    mark(field,'unknown-action'); return {kind:'unsupported'};
  }
  const visible = ACTION_SLOTS.filter((id) => separateMicrophoneKeys ? id !== 'ACT10_ACT11' : id !== 'ACT10' && id !== 'ACT11');
  const slots: MicroSlot[] = visible.map((slotId) => {
    let raw = sourceSlots[slotId];
    if (raw === undefined) {
      if (!layoutMissing && slotId !== 'ACT10' && slotId !== 'ACT11') fail('INVALID_LAYOUT','A required Micro key is missing. Collection stopped.');
      raw = {keycapId:DEFAULT_KEYCAPS[slotId]};
      defaultedFields.push(`layout.slots.${slotId}`);
    }
    const slot = object(raw);
    unknownKeys(slot,['keycapId','commandId','action'],`layout.slots.${slotId}`);
    const keycapId = validate(slot.keycapId,KEYCAPS);
    if ((slotId === 'ACT10_ACT11') !== ['MIC','EMPT5'].includes(keycapId)) fail('INVALID_LAYOUT','A Micro keycap size does not match its slot.');
    let action: PublicAction;
    if (slot.action !== undefined) action = publicAction(slot.action,`layout.slots.${slotId}.action`,true);
    else if (slot.commandId !== undefined) action = publicAction({type:'command',commandId:slot.commandId},`layout.slots.${slotId}.action`);
    else {
      defaultedFields.push(`layout.slots.${slotId}.action`);
      action = keycapId === 'MIC' || keycapId === 'MIC1' ? command(`micro.voice.${voiceButtonMode}`)! :
        keycapId === 'YOLO' || keycapId === 'YEET' ? {kind:'text',redacted:true} :
        KEYCAP_COMMANDS[keycapId] ? command(KEYCAP_COMMANDS[keycapId])! : {kind:'none'};
    }
    return {slotId,keycapId,action};
  });
  const rawStick = layout.analogStick === undefined ? undefined : object(layout.analogStick);
  if (rawStick) unknownKeys(rawStick,Object.keys(DEFAULT_STICK),'layout.analogStick.unknown');
  else defaultedFields.push('layout.analogStick');
  const analogStick = Object.fromEntries(Object.entries(DEFAULT_STICK).map(([direction,id]) => {
    if (rawStick && rawStick[direction] === undefined) fail('INVALID_LAYOUT','A Micro stick direction is missing.');
    return [direction,rawStick ? publicAction(rawStick[direction],`layout.analogStick.${direction}`) : command(id)!];
  })) as MicroSettings['layout']['analogStick'];
  const rawEncoder = layout.encoder === undefined ? undefined : object(layout.encoder);
  if (rawEncoder) unknownKeys(rawEncoder,['left','right','click','longPress'],'layout.encoder.unknown');
  else defaultedFields.push('layout.encoder');
  const encoder: MicroSettings['layout']['encoder'] = {mode:encoderMode,clockwise:{kind:'none'},counterclockwise:{kind:'none'},press:{kind:'none'},longPress:{kind:'none'}};
  if (encoderMode === 'custom') {
    for (const [input,output] of [['right','clockwise'],['left','counterclockwise'],['click','press'],['longPress','longPress']] as const) {
      encoder[output] = rawEncoder?.[input] === undefined ? {kind:'none'} : publicAction(rawEncoder[input],`layout.encoder.${output}`);
    }
  } else {
    const defaults = ENCODER_MODES[encoderMode];
    encoder.clockwise = command(defaults.right)!; encoder.counterclockwise = command(defaults.left)!; encoder.press = command(defaults.click)!;
    encoder.longPress = {kind:'command',id:'micro.openSettings',label:{en:'Open Micro settings',ja:'Micro設定を開く'}};
  }
  const agentSource = validate(fallback(desktop,'codex-micro-agent-source','recent','options.agentSource'),['recent','pinned','priority','custom'] as const);
  if (agentSource === 'custom') mark('agentAssignments','unavailable');
  const singleTapAgentKeys = boolean(fallback(desktop,'codex-micro-single-tap-agent-keys',false,'options.singleTapAgentKeys'));
  const lightingBrightness = fallback(desktop,'codex-micro-lighting-brightness',100,'options.lightingBrightness');
  if (typeof lightingBrightness !== 'number' || !Number.isInteger(lightingBrightness) || lightingBrightness < 0 || lightingBrightness > 100) fail('INVALID_CONFIG','Micro brightness is outside the supported values.');
  const lightingAutoOff = validate(fallback(desktop,'codex-micro-lighting-auto-off','3-minutes','options.lightingAutoOff'),['off','30-seconds','1-minute','3-minutes','10-minutes','30-minutes','1-hour'] as const);
  const result = microSettingsSchema.safeParse({schemaVersion:1,capturedAt,source:{platform:'macos',appVersion:source.version,appBuild:source.build,layoutVersion:1,defaultedFields},layout:{slots,encoder,analogStick},options:{agentSource,voiceButtonMode,separateMicrophoneKeys,singleTapAgentKeys,lightingBrightness,lightingAutoOff},unsupported});
  if (!result.success) fail('INVALID_PUBLIC_SETTINGS','The collected settings do not match the public schema. No data was sent.');
  return result.data;
}

export async function detectApp(appPath?: string): Promise<SourceVersion> {
  if (process.platform !== 'darwin') fail('UNSUPPORTED_OS','Micro collection currently supports macOS only.');
  const candidates = appPath ? [appPath] : ['/Applications/Codex.app','/Applications/ChatGPT.app',join(homedir(),'Applications/Codex.app'),join(homedir(),'Applications/ChatGPT.app')];
  for (const candidate of candidates) {
    try {
      const plist = join(candidate,'Contents/Info.plist');
      const [version,build] = await Promise.all([
        run('/usr/libexec/PlistBuddy',['-c','Print :CFBundleShortVersionString',plist]),
        run('/usr/libexec/PlistBuddy',['-c','Print :CFBundleVersion',plist]),
      ]);
      return {version:version.stdout.trim(),build:build.stdout.trim()};
    } catch { /* try the next standard installation location */ }
  }
  fail('APP_NOT_FOUND','The Codex app was not found. Pass its .app directory with --app.');
}
export async function collectLocal(options: {configPath?: string; appPath?: string} = {}): Promise<MicroSettings> {
  const source = await detectApp(options.appPath);
  if (source.version !== SUPPORTED_APP.version || source.build !== SUPPORTED_APP.build) fail('UNSUPPORTED_APP','This Codex app version or build has not been verified. Collection stopped before reading settings.');
  const path = options.configPath ?? join(process.env.CODEX_HOME || join(homedir(),'.codex'),'config.toml');
  let text: string;
  try {
    if ((await stat(path)).size > LIMIT) fail('CONFIG_TOO_LARGE','The configuration exceeds the supported read limit.');
    text = await readFile(path,'utf8');
  } catch { fail('CONFIG_READ_FAILED','The Codex configuration could not be read. No data was sent.'); }
  return collectFromToml(text,source);
}
