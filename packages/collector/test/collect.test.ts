import assert from 'node:assert/strict';
import { test } from 'node:test';
import { stringify } from 'smol-toml';
import { collectFromToml } from '../src/collect.js';
import { DEFAULT_KEYCAPS, SUPPORTED_APP } from '../src/compatibility.js';

function config(layout: Record<string,unknown>, extra: Record<string,unknown> = {}) {
  return stringify({desktop:{'codex-micro-layout':{version:1,slots:Object.fromEntries(Object.entries(DEFAULT_KEYCAPS).map(([id,keycapId])=>[id,{keycapId}])),...layout},...extra}});
}
test('supported omitted configuration resolves effective defaults with provenance',()=>{
  const result=collectFromToml('',SUPPORTED_APP,'2026-09-12T00:00:00.000Z');
  assert.equal(result.options.agentSource,'recent');assert.equal(result.options.lightingAutoOff,'3-minutes');
  assert.deepEqual(result.layout.slots.map(s=>s.keycapId),['FAST','APPR','REJ','SPLIT','MIC','CODEX']);
  assert.equal(result.layout.encoder.mode,'composer-navigation');assert.equal(result.layout.encoder.longPress.kind,'command');
  assert.ok(result.source.defaultedFields.includes('options.agentSource'));
});
test('actual-style layout preserves keycap separately from effective command and knob mode',()=>{
  const slots=Object.fromEntries(Object.entries(DEFAULT_KEYCAPS).map(([id,keycapId])=>[id,{keycapId}]));
  slots.ACT06={keycapId:'MIND-'};slots.ACT07={keycapId:'MIND+'};slots.ACT08={keycapId:'NEW'};
  const result=collectFromToml(config({slots,encoder:{},encoderMode:'conversation-scroll'}),SUPPORTED_APP);
  assert.equal(result.layout.slots[1].keycapId,'MIND+');
  assert.deepEqual(result.layout.slots[1].action,{kind:'command',id:'composer.increaseReasoningEffort',label:{en:'Increase reasoning effort',ja:'推論強度を上げる'}});
  assert.equal(result.layout.encoder.clockwise.kind,'command');
  if(result.layout.encoder.clockwise.kind==='command')assert.equal(result.layout.encoder.clockwise.id,'micro.encoder.scrollUp');
});
test('skill names survive, skill paths, prompt bodies, credentials, conversation metadata do not',()=>{
  const secret='DO_NOT_PUBLISH_credential_secret';
  const slots:Record<string,unknown>=Object.fromEntries(Object.entries(DEFAULT_KEYCAPS).map(([id,keycapId])=>[id,{keycapId}]));
  slots.ACT06={keycapId:'FAST',action:{type:'skill',skillName:'daily-notes',skillPath:`/private/${secret}`}};
  slots.ACT07={keycapId:'APPR',action:{type:'composer-text',text:secret}};
  const result=collectFromToml(config({slots},{token:secret,'codex-micro-custom-agent-assignments':{AG00:{conversationId:secret}},'codex-micro-agent-source':'custom'}),SUPPORTED_APP);
  const output=JSON.stringify(result);assert.ok(!output.includes(secret));assert.ok(!output.includes('/private'));assert.ok(output.includes('daily-notes'));
  assert.deepEqual(result.layout.slots[1].action,{kind:'text',redacted:true});
  assert.ok(result.unsupported.some(x=>x.field==='agentAssignments'));
});
test('unknown command or field values are not serialized',()=>{
  const slots:Record<string,unknown>=Object.fromEntries(Object.entries(DEFAULT_KEYCAPS).map(([id,keycapId])=>[id,{keycapId}]));
  slots.ACT06={keycapId:'FAST',action:{type:'command',commandId:'SECRET_DYNAMIC_ID'}};
  const result=collectFromToml(config({slots,SECRET_UNKNOWN_FIELD:'secret-value'}),SUPPORTED_APP);
  assert.deepEqual(result.layout.slots[0].action,{kind:'unsupported'});
  assert.ok(!JSON.stringify(result).includes('SECRET'));assert.ok(!JSON.stringify(result).includes('secret-value'));
});
test('split mic, custom knob, and custom stick are represented using public actions',()=>{
  const result=collectFromToml(config({separateMicrophoneKeys:true,encoderMode:'custom',encoder:{left:{type:'skill',skillName:'daily-notes',skillPath:'/private/notes'},right:{type:'command',commandId:'newThread'}},analogStick:{up:{type:'command',commandId:'newTask'},right:{type:'command',commandId:'navigateForward'},down:{type:'command',commandId:'toggleSidebar'},left:{type:'command',commandId:'navigateBack'}}}),SUPPORTED_APP);
  assert.equal(result.layout.slots.length,7);assert.ok(!result.layout.slots.some(s=>s.slotId==='ACT10_ACT11'));
  assert.deepEqual(result.layout.encoder.counterclockwise,{kind:'skill',name:'daily-notes'});
  assert.deepEqual(result.layout.encoder.longPress,{kind:'none'});
});
test('unknown versions and unsafe layout shapes stop instead of inventing defaults',()=>{
  assert.throws(()=>collectFromToml('',{...SUPPORTED_APP,version:'99.1.1'}),/not been verified/);
  assert.throws(()=>collectFromToml('',{...SUPPORTED_APP,build:'1'}),/not been verified/);
  assert.throws(()=>collectFromToml(config({version:2}),SUPPORTED_APP),/not supported/);
  assert.throws(()=>collectFromToml(config({slots:{}}),SUPPORTED_APP),/required Micro key/);
  assert.throws(()=>collectFromToml(config({voiceButtonMode:'unknown'}),SUPPORTED_APP),/supported values/);
});
test('malformed TOML error cannot echo private content',()=>{
  try { collectFromToml('API_KEY = "secret-unclosed',SUPPORTED_APP);assert.fail('must reject'); }
  catch(error) {assert.ok(!(error as Error).message.includes('secret-unclosed'));}
});
