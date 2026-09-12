import type { PublicAction } from '@my-micro/shared';

// Independently recorded identifiers and behavior for the supported application build.
// No extracted app code, icon assets, or private configuration is distributed.
export const SUPPORTED_APP = { version: '26.908.40834', build: '8881' } as const;
export const ACTION_SLOTS = ['ACT06','ACT07','ACT08','ACT09','ACT10','ACT11','ACT10_ACT11','ACT12'] as const;
export const KEYCAPS = 'FAST APPR REJ SPLIT MIC MIC1 CODEX BUG OAI TERM DWN DEL NEW NAV MAGIC DIFF PLAY GIT BRCH BRANCH MRG PR PAINT LAB PARTY TIME MIND+ MIND- EMPT1 EMPT2 EMPT3 EMPT4 SETUP FOLD UPL APPS YOLO YEET EMPT5'.split(' ');
export const DEFAULT_KEYCAPS = { ACT06:'FAST', ACT07:'APPR', ACT08:'REJ', ACT09:'SPLIT', ACT10:'MIC1', ACT11:'EMPT1', ACT10_ACT11:'MIC', ACT12:'CODEX' };

const labels: Record<string, [string,string]> = {
  'composer.toggleFastMode': ['Toggle fast mode','高速モードの切り替え'],
  'approval.approve': ['Approve','承認'], 'approval.decline': ['Decline','拒否'],
  forkThread: ['Fork task','タスクを分岐'], 'composer.submit': ['Send message','メッセージを送信'],
  feedback: ['Send feedback','フィードバック'], toggleTerminal: ['Toggle terminal','ターミナルの表示切り替え'],
  copyConversationMarkdown: ['Copy conversation as Markdown','会話をMarkdownでコピー'],
  archiveThread: ['Archive task','タスクをアーカイブ'], newTask: ['New task','新しいタスク'],
  openBrowserTab: ['Open browser tab','ブラウザタブを開く'], toggleThreadPin: ['Toggle task pin','タスクのピン留め切り替え'],
  toggleReviewTab: ['Toggle review','レビューの表示切り替え'], environmentAction1: ['Run project action','プロジェクトのアクションを実行'],
  'git.commit': ['Commit','コミット'], 'git.createDraftPullRequest': ['Create draft pull request','ドラフトPRを作成'],
  'git.createBranch': ['Create branch','ブランチを作成'], 'git.mergePullRequest': ['Merge pull request','PRをマージ'],
  'git.createPullRequest': ['Create pull request','PRを作成'], 'composer.addPhotos': ['Add photos','写真を追加'],
  settings: ['Open settings','設定を開く'], openSideChat: ['Open side chat','サイドチャットを開く'],
  manageTasks: ['Manage tasks','タスクを管理'], 'composer.increaseReasoningEffort': ['Increase reasoning effort','推論強度を上げる'],
  'composer.decreaseReasoningEffort': ['Decrease reasoning effort','推論強度を下げる'],
  openFolder: ['Open folder','フォルダを開く'], 'composer.addFiles': ['Add files','ファイルを追加'],
  openSkills: ['Open skills','スキルを開く'], 'composer.togglePlanMode': ['Toggle plan mode','プランモードの切り替え'],
  navigateForward: ['Navigate forward','次へ進む'], navigateBack: ['Navigate back','前へ戻る'], toggleSidebar: ['Toggle sidebar','サイドバーの表示切り替え'],
  'micro.voice.push-to-talk': ['Push to talk','押して話す'], 'micro.voice.realtime': ['Realtime voice','リアルタイム音声'],
  'micro.openOpenAIDocs': ['Open OpenAI documentation','OpenAIのドキュメントを開く'],
  'micro.encoder.previous': ['Previous composer control or option','入力欄の前のコントロール・選択肢'],
  'micro.encoder.next': ['Next composer control or option','入力欄の次のコントロール・選択肢'],
  'micro.encoder.select': ['Open or select composer control','入力欄のコントロールを開く・選択'],
  'micro.encoder.reasoningOptions': ['Open reasoning slider or options','推論強度のスライダー・詳細を開く'],
  'micro.encoder.scrollUp': ['Scroll up the conversation','会話を上へスクロール'],
  'micro.encoder.scrollDown': ['Scroll down the conversation','会話を下へスクロール'],
  'micro.encoder.latest': ['Jump to latest message','最新のメッセージに移動'],
};
export function command(id: string): PublicAction | undefined {
  const normalized = id === 'newThread' ? 'newTask' : id;
  const label = labels[normalized];
  return label ? {kind:'command',id:normalized,label:{en:label[0],ja:label[1]}} : undefined;
}
export const KEYCAP_COMMANDS: Record<string,string> = {
  FAST:'composer.toggleFastMode', APPR:'approval.approve', REJ:'approval.decline', SPLIT:'forkThread', CODEX:'composer.submit',
  BUG:'feedback', OAI:'micro.openOpenAIDocs', TERM:'toggleTerminal', DWN:'copyConversationMarkdown', DEL:'archiveThread', NEW:'newTask',
  NAV:'openBrowserTab', MAGIC:'toggleThreadPin', DIFF:'toggleReviewTab', PLAY:'environmentAction1', GIT:'git.commit', BRCH:'git.createDraftPullRequest',
  BRANCH:'git.createBranch', MRG:'git.mergePullRequest', PR:'git.createPullRequest', PAINT:'composer.addPhotos', LAB:'settings', PARTY:'openSideChat',
  TIME:'manageTasks', 'MIND+':'composer.increaseReasoningEffort', 'MIND-':'composer.decreaseReasoningEffort', SETUP:'settings', FOLD:'openFolder',
  UPL:'composer.addFiles', APPS:'openSkills',
};
export const DEFAULT_STICK = {up:'composer.togglePlanMode',right:'navigateForward',down:'toggleSidebar',left:'navigateBack'};
export const ENCODER_MODES = {
  'composer-navigation': {right:'micro.encoder.previous',left:'micro.encoder.next',click:'micro.encoder.select'},
  reasoning: {right:'composer.decreaseReasoningEffort',left:'composer.increaseReasoningEffort',click:'micro.encoder.reasoningOptions'},
  'conversation-scroll': {right:'micro.encoder.scrollUp',left:'micro.encoder.scrollDown',click:'micro.encoder.latest'},
};
