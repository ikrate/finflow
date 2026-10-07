import { NativeModule, requireNativeModule } from 'expo-modules-core';
import { FinflowPeerEvents } from './FinflowPeer.types';

declare class FinflowPeerModule extends NativeModule<FinflowPeerEvents> {
  start(options: { displayName: string; groupHash: string }): Promise<void>;
  stop(): Promise<void>;
  invite(peerId: string, context: string): Promise<void>;
  respondToInvitation(invitationId: string, accept: boolean): Promise<void>;
  send(peerId: string, data: string): Promise<void>;
  disconnect(peerId?: string): void;
}

let module: FinflowPeerModule | null = null;
try {
  module = requireNativeModule<FinflowPeerModule>('FinflowPeer');
} catch {
  // Fallback for Expo Go or non-supported platforms
}

export default module;
