export interface BaseMsg<K extends string, P> {
  v: 1;
  id: string;
  kind: K;
  payload: P;
}

export type HelloMsg = BaseMsg<'hello', { screenId: string }>;
export type SetModeMsg = BaseMsg<'setMode', { mode: 'select' | 'interact' }>;
export type GetChildrenMsg = BaseMsg<'getChildren', { eid: string }>;
export type GetRelativesMsg = BaseMsg<'getRelatives', { eid: string }>;
export type SubscribeRectsMsg = BaseMsg<'subscribeRects', { eids: string[] }>;
export type UnsubscribeRectsMsg = BaseMsg<'unsubscribeRects', { eids: string[] }>;
export type SearchMsg = BaseMsg<'search', { query: string }>;
export type GetLiveMsg = BaseMsg<'getLive', { eids: string[] }>;
export type ScrollIntoViewMsg = BaseMsg<'scrollIntoView', { eid: string }>;
export type GetAncestorsMsg = BaseMsg<'getAncestors', { eid: string }>;
export type DevFailMsg = BaseMsg<'devFail', { kind: 'pageError' | 'treeQuery' | 'handshake' | 'clickHandler' }>;

export type HostMessage =
  | HelloMsg
  | SetModeMsg
  | GetChildrenMsg
  | GetRelativesMsg
  | SubscribeRectsMsg
  | UnsubscribeRectsMsg
  | SearchMsg
  | GetLiveMsg
  | ScrollIntoViewMsg
  | GetAncestorsMsg
  | DevFailMsg;

export type ReadyMsg = BaseMsg<'ready', Record<string, never>>;
export type WheelFwdMsg = BaseMsg<
  'wheel',
  { deltaY: number; clientX: number; clientY: number; ctrlKey: boolean }
>;
export type PointerMsg = BaseMsg<
  'pointer',
  { eid: string | null; name: string | null; rect: RectLike | null }
>;
export type ClickMsg = BaseMsg<
  'click',
  { eid: string | null; rect: RectLike | null; name: string | null; shift: boolean }
>;
export type AgentKeyMsg = BaseMsg<
  'key',
  { key: string; shift: boolean; ctrl: boolean; meta: boolean }
>;
export type MutationMsg = BaseMsg<'mutation', { parentEid: string }>;
export type RectsMsg = BaseMsg<
  'rects',
  { updates: Array<{ eid: string; rect: RectLike }> }
>;
export type NavigatedMsg = BaseMsg<'navigated', Record<string, never>>;
export type PageErrorMsg = BaseMsg<'pageError', { message: string }>;
export type ResponseMsg = BaseMsg<
  'response',
  { to: string; ok: boolean; data?: unknown; error?: string }
>;

export interface LiveData {
  eid: string;
  name: string;
  tag: string;
  id: string;
  classes: string;
  w: number;
  h: number;
  x: number;
  y: number;
  text: string;
  color: string;
  bg: string;
  fontFamily: string;
  fontSize: string;
  fontWeight: string;
}

export type LiveDataMsg = BaseMsg<'live', LiveData>;

export interface RelativeInfo {
  eid: string;
  rect: RectLike;
  name: string;
}

export type EidRemapMsg = BaseMsg<
  'eidRemap',
  { remaps: Array<{ old: string; new: string }>; removed: string[] }
>;

export type AgentMessage =
  | ReadyMsg
  | WheelFwdMsg
  | PointerMsg
  | ClickMsg
  | AgentKeyMsg
  | MutationMsg
  | RectsMsg
  | EidRemapMsg
  | NavigatedMsg
  | PageErrorMsg
  | ResponseMsg
  | LiveDataMsg;

export interface RectLike {
  x: number;
  y: number;
  width: number;
  height: number;
}

let _seq = 0;
export const makeMsg = <K extends string, P>(kind: K, payload: P): BaseMsg<K, P> => ({
  v: 1,
  id: `h${++_seq}`,
  kind,
  payload,
});
