import {
  DataEvent,
  ErrorEvent,
  InvitationEvent,
  PeerFoundEvent,
  PeerLostEvent,
  PeerState,
  PeerStateEvent,
  PeerTransport,
} from './transport';

/**
 * In-memory MockPeerTransport for testing the sync protocol without native modules.
 */
export class MockPeerTransport implements PeerTransport {
  public peerId: string;
  public displayName: string;
  public groupHash = '';
  public isStarted = false;

  private remotePeer: MockPeerTransport | null = null;
  private pendingInvitations = new Map<string, { fromPeerId: string; context: string }>();

  private peerFoundListeners = new Set<(e: PeerFoundEvent) => void>();
  private peerLostListeners = new Set<(e: PeerLostEvent) => void>();
  private invitationListeners = new Set<(e: InvitationEvent) => void>();
  private peerStateListeners = new Set<(e: PeerStateEvent) => void>();
  private dataListeners = new Set<(e: DataEvent) => void>();
  private errorListeners = new Set<(e: ErrorEvent) => void>();

  public dropNextData = false;
  public simulateError: ErrorEvent | null = null;

  constructor(peerId: string, displayName: string) {
    this.peerId = peerId;
    this.displayName = displayName;
  }

  public setRemote(remote: MockPeerTransport): void {
    this.remotePeer = remote;
  }

  public async start(options: { displayName: string; groupHash: string }): Promise<void> {
    this.displayName = options.displayName;
    this.groupHash = options.groupHash;
    this.isStarted = true;

    if (this.remotePeer && this.remotePeer.isStarted && this.remotePeer.groupHash === this.groupHash) {
      // Mutual discovery
      setTimeout(() => {
        this.emitPeerFound(this.remotePeer!.peerId, this.remotePeer!.displayName);
        this.remotePeer!.emitPeerFound(this.peerId, this.displayName);
      }, 5);
    }
  }

  public async stop(): Promise<void> {
    this.isStarted = false;
    if (this.remotePeer) {
      this.remotePeer.emitPeerLost(this.peerId, this.displayName);
      this.emitPeerState(this.remotePeer.peerId, 'disconnected');
      this.remotePeer.emitPeerState(this.peerId, 'disconnected');
    }
  }

  public async invite(peerId: string, context: string): Promise<void> {
    if (!this.remotePeer || this.remotePeer.peerId !== peerId) {
      this.emitError('PEER_NOT_FOUND', `Peer ${peerId} not found`);
      return;
    }

    const invitationId = `inv-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    this.remotePeer.pendingInvitations.set(invitationId, { fromPeerId: this.peerId, context });

    setTimeout(() => {
      this.remotePeer?.emitInvitation({
        invitationId,
        peerId: this.peerId,
        displayName: this.displayName,
        context,
      });
    }, 5);
  }

  public async respondToInvitation(invitationId: string, accept: boolean): Promise<void> {
    const inv = this.pendingInvitations.get(invitationId);
    this.pendingInvitations.delete(invitationId);

    if (!inv || !this.remotePeer) return;

    if (accept) {
      setTimeout(() => {
        this.emitPeerState(this.remotePeer!.peerId, 'connecting');
        this.remotePeer!.emitPeerState(this.peerId, 'connecting');

        setTimeout(() => {
          this.emitPeerState(this.remotePeer!.peerId, 'connected');
          this.remotePeer!.emitPeerState(this.peerId, 'connected');
        }, 10);
      }, 5);
    } else {
      setTimeout(() => {
        this.emitPeerState(this.remotePeer!.peerId, 'disconnected');
        this.remotePeer!.emitPeerState(this.peerId, 'disconnected');
      }, 5);
    }
  }

  public async send(peerId: string, data: string): Promise<void> {
    if (!this.remotePeer || this.remotePeer.peerId !== peerId) {
      this.emitError('PEER_NOT_CONNECTED', 'Cannot send to disconnected peer');
      return;
    }

    if (this.dropNextData) {
      this.dropNextData = false;
      return;
    }

    setTimeout(() => {
      this.remotePeer?.emitData(this.peerId, data);
    }, 5);
  }

  public disconnect(peerId?: string): void {
    if (this.remotePeer && (!peerId || peerId === this.remotePeer.peerId)) {
      this.emitPeerState(this.remotePeer.peerId, 'disconnected');
      this.remotePeer.emitPeerState(this.peerId, 'disconnected');
    }
  }

  // Event emitters
  private emitPeerFound(peerId: string, displayName: string): void {
    for (const l of this.peerFoundListeners) l({ peerId, displayName });
  }

  private emitPeerLost(peerId: string, displayName: string): void {
    for (const l of this.peerLostListeners) l({ peerId, displayName });
  }

  private emitInvitation(e: InvitationEvent): void {
    for (const l of this.invitationListeners) l(e);
  }

  private emitPeerState(peerId: string, state: PeerState): void {
    for (const l of this.peerStateListeners) l({ peerId, state });
  }

  private emitData(peerId: string, data: string): void {
    for (const l of this.dataListeners) l({ peerId, data });
  }

  private emitError(code: string, message: string): void {
    for (const l of this.errorListeners) l({ code, message });
  }

  // Listener subscriptions
  public onPeerFound(listener: (e: PeerFoundEvent) => void): () => void {
    this.peerFoundListeners.add(listener);
    return () => this.peerFoundListeners.delete(listener);
  }

  public onPeerLost(listener: (e: PeerLostEvent) => void): () => void {
    this.peerLostListeners.add(listener);
    return () => this.peerLostListeners.delete(listener);
  }

  public onInvitation(listener: (e: InvitationEvent) => void): () => void {
    this.invitationListeners.add(listener);
    return () => this.invitationListeners.delete(listener);
  }

  public onPeerState(listener: (e: PeerStateEvent) => void): () => void {
    this.peerStateListeners.add(listener);
    return () => this.peerStateListeners.delete(listener);
  }

  public onData(listener: (e: DataEvent) => void): () => void {
    this.dataListeners.add(listener);
    return () => this.dataListeners.delete(listener);
  }

  public onError(listener: (e: ErrorEvent) => void): () => void {
    this.errorListeners.add(listener);
    return () => this.errorListeners.delete(listener);
  }

  /**
   * Factory to create an interconnected pair of mock transports.
   */
  public static createPair(
    peerIdA: string,
    nameA: string,
    peerIdB: string,
    nameB: string
  ): [MockPeerTransport, MockPeerTransport] {
    const tA = new MockPeerTransport(peerIdA, nameA);
    const tB = new MockPeerTransport(peerIdB, nameB);
    tA.setRemote(tB);
    tB.setRemote(tA);
    return [tA, tB];
  }
}
