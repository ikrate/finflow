export type PeerState = 'connecting' | 'connected' | 'disconnected';

export interface PeerFoundEvent {
  peerId: string;
  displayName: string;
}

export interface PeerLostEvent {
  peerId: string;
  displayName: string;
}

export interface InvitationEvent {
  invitationId: string;
  peerId: string;
  displayName: string;
  context: string;
}

export interface PeerStateEvent {
  peerId: string;
  state: PeerState;
}

export interface DataEvent {
  peerId: string;
  data: string; // base64 payload
}

export interface ErrorEvent {
  code: string;
  message: string;
}

export type FinflowPeerEvents = {
  onPeerFound: (event: PeerFoundEvent) => void;
  onPeerLost: (event: PeerLostEvent) => void;
  onInvitation: (event: InvitationEvent) => void;
  onPeerState: (event: PeerStateEvent) => void;
  onData: (event: DataEvent) => void;
  onError: (event: ErrorEvent) => void;
};
