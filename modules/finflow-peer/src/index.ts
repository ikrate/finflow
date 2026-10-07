import { Platform } from 'react-native';
import {
  DataEvent,
  ErrorEvent,
  InvitationEvent,
  PeerFoundEvent,
  PeerLostEvent,
  PeerState,
  PeerStateEvent,
} from './FinflowPeer.types';
import FinflowPeerModule from './FinflowPeerModule';

export * from './FinflowPeer.types';

export function isMultipeerSupported(): boolean {
  return Platform.OS === 'ios' && FinflowPeerModule !== null;
}

/**
 * PeerTransport implementation wrapping Apple Multipeer Connectivity native module.
 */
export class MultipeerTransport {
  public async start(options: { displayName: string; groupHash: string }): Promise<void> {
    if (!FinflowPeerModule) {
      throw new Error('Nearby sync is available on iOS only');
    }
    return await FinflowPeerModule.start(options);
  }

  public async stop(): Promise<void> {
    if (!FinflowPeerModule) return;
    return await FinflowPeerModule.stop();
  }

  public async invite(peerId: string, context: string): Promise<void> {
    if (!FinflowPeerModule) {
      throw new Error('Nearby sync is available on iOS only');
    }
    return await FinflowPeerModule.invite(peerId, context);
  }

  public async respondToInvitation(invitationId: string, accept: boolean): Promise<void> {
    if (!FinflowPeerModule) {
      throw new Error('Nearby sync is available on iOS only');
    }
    return await FinflowPeerModule.respondToInvitation(invitationId, accept);
  }

  public async send(peerId: string, data: string): Promise<void> {
    if (!FinflowPeerModule) {
      throw new Error('Nearby sync is available on iOS only');
    }
    return await FinflowPeerModule.send(peerId, data);
  }

  public disconnect(peerId?: string): void {
    if (!FinflowPeerModule) return;
    FinflowPeerModule.disconnect(peerId);
  }

  public onPeerFound(listener: (event: PeerFoundEvent) => void): () => void {
    if (!FinflowPeerModule) return () => {};
    const sub = FinflowPeerModule.addListener('onPeerFound', listener);
    return () => sub.remove();
  }

  public onPeerLost(listener: (event: PeerLostEvent) => void): () => void {
    if (!FinflowPeerModule) return () => {};
    const sub = FinflowPeerModule.addListener('onPeerLost', listener);
    return () => sub.remove();
  }

  public onInvitation(listener: (event: InvitationEvent) => void): () => void {
    if (!FinflowPeerModule) return () => {};
    const sub = FinflowPeerModule.addListener('onInvitation', listener);
    return () => sub.remove();
  }

  public onPeerState(listener: (event: PeerStateEvent) => void): () => void {
    if (!FinflowPeerModule) return () => {};
    const sub = FinflowPeerModule.addListener('onPeerState', listener);
    return () => sub.remove();
  }

  public onData(listener: (event: DataEvent) => void): () => void {
    if (!FinflowPeerModule) return () => {};
    const sub = FinflowPeerModule.addListener('onData', listener);
    return () => sub.remove();
  }

  public onError(listener: (event: ErrorEvent) => void): () => void {
    if (!FinflowPeerModule) return () => {};
    const sub = FinflowPeerModule.addListener('onError', listener);
    return () => sub.remove();
  }
}

export const defaultMultipeerTransport = new MultipeerTransport();
