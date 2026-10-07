import { deflateSync, inflateSync, strFromU8, strToU8 } from 'fflate';
import { calculateDelta, mergeEvents, validateGroupEvent } from '../merge';
import { GroupEvent, VersionVector } from '../types';
import { computeVersionVector } from '../eventLog';
import { base64UrlToBytes, bytesToBase64Url } from '../invite';
import { PeerTransport } from './transport';

export const PROTOCOL_VERSION = 1;
export const MAX_CHUNK_DATA_SIZE = 40000; // Chunk size well below 48 KB
export const MAX_SESSION_EVENTS = 20000;
export const MAX_SESSION_BYTES = 20 * 1024 * 1024; // 20 MB
export const CHUNK_TIMEOUT_MS = 15000;
export const BATCH_SIZE = 200;

export interface ChunkFrame {
  msgId: string;
  index: number;
  total: number;
  data: string;
}

export type ProtocolMessage =
  | {
      v: 1;
      type: 'HELLO';
      groupId: string;
      vector: VersionVector;
      deviceId: string;
      memberId?: string;
    }
  | {
      v: 1;
      type: 'DELTA';
      groupId: string;
      events: GroupEvent[];
      vector: VersionVector;
      batchIndex: number;
      totalBatches: number;
    }
  | {
      v: 1;
      type: 'ACK';
      groupId: string;
      received: number;
    }
  | {
      v: 1;
      type: 'ERROR';
      groupId: string;
      code: string;
      message: string;
    };

export interface SyncSummary {
  newExpenses: number;
  newMembers: number;
  newSettlements: number;
  updated: number;
  deleted: number;
  totalNewEvents: number;
  peerId: string;
  remoteDeviceId: string;
  remoteMemberId?: string;
}

export interface SyncProgress {
  phase: 'connecting' | 'handshake' | 'sending_delta' | 'receiving_delta' | 'merging' | 'completed';
  count: number;
  total: number;
}

/**
 * Encodes and compresses a ProtocolMessage into one or more base64 ChunkFrame envelopes.
 */
export function encodeAndChunkMessage(msg: ProtocolMessage, msgIdPrefix = 'msg'): string[] {
  const jsonStr = JSON.stringify(msg);
  const compressed = deflateSync(strToU8(jsonStr));
  const fullB64 = bytesToBase64Url(compressed);

  const totalChunks = Math.max(1, Math.ceil(fullB64.length / MAX_CHUNK_DATA_SIZE));
  const msgId = `${msgIdPrefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const frames: string[] = [];

  for (let i = 0; i < totalChunks; i++) {
    const chunkData = fullB64.slice(i * MAX_CHUNK_DATA_SIZE, (i + 1) * MAX_CHUNK_DATA_SIZE);
    const frame: ChunkFrame = {
      msgId,
      index: i,
      total: totalChunks,
      data: chunkData,
    };
    const frameJson = JSON.stringify(frame);
    frames.push(bytesToBase64Url(strToU8(frameJson)));
  }

  return frames;
}

/**
 * Frame assembler to reassemble chunked protocol messages.
 */
export class FrameAssembler {
  private chunks = new Map<string, { total: number; received: Map<number, string>; createdAt: number }>();

  /**
   * Adds an incoming base64 frame string. Returns the decompressed ProtocolMessage if complete.
   */
  public addFrame(rawFrameB64: string): ProtocolMessage | null {
    let frame: ChunkFrame;
    try {
      const frameJson = strFromU8(base64UrlToBytes(rawFrameB64));
      frame = JSON.parse(frameJson) as ChunkFrame;
    } catch {
      return null;
    }

    if (!frame || typeof frame.msgId !== 'string' || typeof frame.index !== 'number' || typeof frame.total !== 'number') {
      return null;
    }

    const now = Date.now();
    this.cleanupOld(now);

    let entry = this.chunks.get(frame.msgId);
    if (!entry) {
      entry = { total: frame.total, received: new Map(), createdAt: now };
      this.chunks.set(frame.msgId, entry);
    }

    entry.received.set(frame.index, frame.data);

    if (entry.received.size === entry.total) {
      this.chunks.delete(frame.msgId);
      // Reassemble in order
      let fullB64 = '';
      for (let i = 0; i < entry.total; i++) {
        fullB64 += entry.received.get(i) || '';
      }

      try {
        const compressed = base64UrlToBytes(fullB64);
        const decompressedJson = strFromU8(inflateSync(compressed));
        return JSON.parse(decompressedJson) as ProtocolMessage;
      } catch {
        return null;
      }
    }

    return null;
  }

  private cleanupOld(now: number) {
    for (const [id, entry] of this.chunks.entries()) {
      if (now - entry.createdAt > CHUNK_TIMEOUT_MS) {
        this.chunks.delete(id);
      }
    }
  }

  public reset(): void {
    this.chunks.clear();
  }
}

/**
 * Deterministic tie-breaker for simultaneous invitations between two devices.
 * Lower deviceId initiates invitation; higher deviceId accepts.
 */
export function shouldInitiateSimultaneousInvite(localDeviceId: string, remoteDeviceId: string): boolean {
  return localDeviceId.localeCompare(remoteDeviceId) < 0;
}

export interface SyncSessionConfig {
  transport: PeerTransport;
  groupId: string;
  localDeviceId: string;
  localMemberId?: string;
  getLocalEvents: () => Promise<GroupEvent[]> | GroupEvent[];
  saveLocalEvents: (events: GroupEvent[]) => Promise<void> | void;
  onProgress?: (progress: SyncProgress) => void;
  onComplete?: (summary: SyncSummary) => void;
  onError?: (err: { code: string; message: string }) => void;
}

/**
 * Manages an active 2-way sync session with a connected peer.
 */
export class SyncSession {
  private config: SyncSessionConfig;
  private assembler = new FrameAssembler();
  private peerId: string | null = null;
  private unsubscribers: Array<() => void> = [];

  private isConnected = false;
  private localHelloSent = false;
  private remoteHello: { deviceId: string; memberId?: string; vector: VersionVector } | null = null;

  private totalEventsReceived = 0;
  private totalBytesReceived = 0;
  private receivedDeltaBatches: GroupEvent[] = [];
  private expectedBatchesCount = 0;

  private sentDeltaCount = 0;
  private localAckSent = false;
  private remoteAckReceived = false;

  private summary: SyncSummary | null = null;
  private isFinalized = false;

  constructor(config: SyncSessionConfig) {
    this.config = config;
  }

  /**
   * Starts listening to transport events for the session.
   */
  public attach(peerId: string): void {
    this.peerId = peerId;
    this.unsubscribers.push(
      this.config.transport.onData((event) => {
        if (event.peerId === this.peerId) {
          this.handleIncomingData(event.data);
        }
      })
    );

    this.unsubscribers.push(
      this.config.transport.onPeerState((event) => {
        if (event.peerId === this.peerId) {
          if (event.state === 'connected') {
            this.isConnected = true;
            this.sendHello();
          } else if (event.state === 'disconnected') {
            this.isConnected = false;
            this.cleanup();
          }
        }
      })
    );

    this.unsubscribers.push(
      this.config.transport.onError((event) => {
        this.config.onError?.({ code: event.code, message: event.message });
      })
    );
  }

  /**
   * Sends the HELLO message over transport.
   */
  public async sendHello(): Promise<void> {
    if (!this.peerId || this.localHelloSent) return;
    this.localHelloSent = true;

    try {
      this.config.onProgress?.({ phase: 'handshake', count: 0, total: 1 });
      const localEvents = await this.config.getLocalEvents();
      const localVector = computeVersionVector(localEvents);

      const helloMsg: ProtocolMessage = {
        v: 1,
        type: 'HELLO',
        groupId: this.config.groupId,
        vector: localVector,
        deviceId: this.config.localDeviceId,
        memberId: this.config.localMemberId,
      };

      await this.sendProtocolMessage(helloMsg);
    } catch (err) {
      this.config.onError?.({ code: 'HELLO_FAILED', message: String(err) });
    }
  }

  /**
   * Resets session state to trigger another sync round over the same active connection.
   */
  public async startNextRound(): Promise<void> {
    this.isFinalized = false;
    this.localHelloSent = false;
    this.localAckSent = false;
    this.remoteAckReceived = false;
    this.remoteHello = null;
    this.receivedDeltaBatches = [];
    this.expectedBatchesCount = 0;
    this.summary = null;
    await this.sendHello();
  }

  private async sendProtocolMessage(msg: ProtocolMessage): Promise<void> {
    if (!this.peerId) return;
    const frames = encodeAndChunkMessage(msg);
    for (const frame of frames) {
      await this.config.transport.send(this.peerId, frame);
    }
  }

  private async handleIncomingData(data: string): Promise<void> {
    this.totalBytesReceived += data.length;
    if (this.totalBytesReceived > MAX_SESSION_BYTES) {
      this.config.onError?.({ code: 'RATE_LIMIT_EXCEEDED', message: 'Maximum data limit exceeded for sync session' });
      this.config.transport.disconnect(this.peerId ?? undefined);
      return;
    }

    const msg = this.assembler.addFrame(data);
    if (!msg) return;

    if (msg.v !== PROTOCOL_VERSION) {
      await this.sendProtocolMessage({
        v: 1,
        type: 'ERROR',
        groupId: this.config.groupId,
        code: 'VERSION_MISMATCH',
        message: `Protocol version mismatch. Expected ${PROTOCOL_VERSION}, got ${String(msg.v)}`,
      });
      this.config.transport.disconnect(this.peerId ?? undefined);
      return;
    }

    if (msg.groupId !== this.config.groupId) {
      await this.sendProtocolMessage({
        v: 1,
        type: 'ERROR',
        groupId: this.config.groupId,
        code: 'GROUP_ID_MISMATCH',
        message: 'Group ID mismatch between peers',
      });
      this.config.transport.disconnect(this.peerId ?? undefined);
      return;
    }

    if (msg.type === 'HELLO' && this.isFinalized) {
      this.isFinalized = false;
      this.localHelloSent = false;
      this.localAckSent = false;
      this.remoteAckReceived = false;
      this.remoteHello = null;
      this.receivedDeltaBatches = [];
      this.expectedBatchesCount = 0;
      this.summary = null;
      await this.sendHello();
    }

    switch (msg.type) {
      case 'HELLO':
        await this.handleHello(msg);
        break;
      case 'DELTA':
        await this.handleDelta(msg);
        break;
      case 'ACK':
        await this.handleAck(msg);
        break;
      case 'ERROR':
        this.config.onError?.({ code: msg.code, message: msg.message });
        break;
    }
  }

  private async handleHello(msg: Extract<ProtocolMessage, { type: 'HELLO' }>): Promise<void> {
    this.remoteHello = {
      deviceId: msg.deviceId,
      memberId: msg.memberId,
      vector: msg.vector,
    };

    // Once remote HELLO is received, calculate and send our DELTA
    await this.sendDelta(msg.vector);
  }

  private async sendDelta(remoteVector: VersionVector): Promise<void> {
    const localEvents = await this.config.getLocalEvents();
    const deltaEvents = calculateDelta(localEvents, remoteVector);
    const myVector = computeVersionVector(localEvents);

    this.sentDeltaCount = deltaEvents.length;

    if (deltaEvents.length === 0) {
      // Send 1 empty delta batch
      const deltaMsg: ProtocolMessage = {
        v: 1,
        type: 'DELTA',
        groupId: this.config.groupId,
        events: [],
        vector: myVector,
        batchIndex: 0,
        totalBatches: 1,
      };
      await this.sendProtocolMessage(deltaMsg);
      return;
    }

    const totalBatches = Math.ceil(deltaEvents.length / BATCH_SIZE);
    for (let b = 0; b < totalBatches; b++) {
      const batchEvents = deltaEvents.slice(b * BATCH_SIZE, (b + 1) * BATCH_SIZE);
      const deltaMsg: ProtocolMessage = {
        v: 1,
        type: 'DELTA',
        groupId: this.config.groupId,
        events: batchEvents,
        vector: myVector,
        batchIndex: b,
        totalBatches,
      };

      this.config.onProgress?.({
        phase: 'sending_delta',
        count: (b + 1) * BATCH_SIZE,
        total: deltaEvents.length,
      });

      await this.sendProtocolMessage(deltaMsg);
    }
  }

  private async handleDelta(msg: Extract<ProtocolMessage, { type: 'DELTA' }>): Promise<void> {
    this.totalEventsReceived += msg.events.length;
    if (this.totalEventsReceived > MAX_SESSION_EVENTS) {
      this.config.onError?.({ code: 'RATE_LIMIT_EXCEEDED', message: 'Maximum event count exceeded for sync session' });
      this.config.transport.disconnect(this.peerId ?? undefined);
      return;
    }

    this.expectedBatchesCount = msg.totalBatches;
    this.receivedDeltaBatches.push(...msg.events);

    this.config.onProgress?.({
      phase: 'receiving_delta',
      count: this.receivedDeltaBatches.length,
      total: Math.max(this.receivedDeltaBatches.length, msg.totalBatches * BATCH_SIZE),
    });

    // Check if all batches received
    if (msg.batchIndex === msg.totalBatches - 1) {
      await this.mergeAndAcknowledge();
    }
  }

  private async mergeAndAcknowledge(): Promise<void> {
    this.config.onProgress?.({
      phase: 'merging',
      count: this.receivedDeltaBatches.length,
      total: this.receivedDeltaBatches.length,
    });

    const localEvents = await this.config.getLocalEvents();
    const mergeResult = mergeEvents(localEvents, this.receivedDeltaBatches, this.config.groupId);
    await this.config.saveLocalEvents(mergeResult.mergedEvents);

    // Calculate changes summary
    let newExpenses = 0;
    let newMembers = 0;
    let newSettlements = 0;
    let updated = 0;
    let deleted = 0;

    for (const e of this.receivedDeltaBatches) {
      const valid = validateGroupEvent(e, this.config.groupId);
      if (!valid.valid) continue;

      if (e.type === 'expense_upserted') newExpenses++;
      else if (e.type === 'member_added') newMembers++;
      else if (e.type === 'settlement_upserted') newSettlements++;
      else if (e.type === 'member_renamed' || e.type === 'member_claimed' || e.type === 'group_status') updated++;
      else if (e.type === 'expense_deleted' || e.type === 'settlement_deleted') deleted++;
    }

    this.summary = {
      newExpenses,
      newMembers,
      newSettlements,
      updated,
      deleted,
      totalNewEvents: mergeResult.newEventsCount,
      peerId: this.peerId || '',
      remoteDeviceId: this.remoteHello?.deviceId || '',
      remoteMemberId: this.remoteHello?.memberId,
    };

    // Send ACK
    this.localAckSent = true;
    const ackMsg: ProtocolMessage = {
      v: 1,
      type: 'ACK',
      groupId: this.config.groupId,
      received: mergeResult.newEventsCount,
    };
    await this.sendProtocolMessage(ackMsg);

    this.checkCompletion();
  }

  private async handleAck(msg: Extract<ProtocolMessage, { type: 'ACK' }>): Promise<void> {
    this.remoteAckReceived = true;
    this.checkCompletion();
  }

  private checkCompletion(): void {
    if (this.localAckSent && this.remoteAckReceived && !this.isFinalized) {
      this.isFinalized = true;
      this.config.onProgress?.({ phase: 'completed', count: 1, total: 1 });
      if (this.summary) {
        this.config.onComplete?.(this.summary);
      }
    }
  }

  public cleanup(): void {
    for (const unsub of this.unsubscribers) {
      unsub();
    }
    this.unsubscribers = [];
    this.assembler.reset();
  }
}
