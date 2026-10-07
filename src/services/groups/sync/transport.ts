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
  context: string; // JSON string with handshake proof
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

export interface PeerTransport {
  start(options: { displayName: string; groupHash: string }): Promise<void>;
  stop(): Promise<void>;
  invite(peerId: string, context: string): Promise<void>;
  respondToInvitation(invitationId: string, accept: boolean): Promise<void>;
  send(peerId: string, data: string): Promise<void>;
  disconnect(peerId?: string): void;

  onPeerFound(listener: (event: PeerFoundEvent) => void): () => void;
  onPeerLost(listener: (event: PeerLostEvent) => void): () => void;
  onInvitation(listener: (event: InvitationEvent) => void): () => void;
  onPeerState(listener: (event: PeerStateEvent) => void) : () => void;
  onData(listener: (event: DataEvent) => void): () => void;
  onError(listener: (event: ErrorEvent) => void): () => void;
}
