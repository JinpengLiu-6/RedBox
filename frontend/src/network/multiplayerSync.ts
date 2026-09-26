/**
 * Goblin King Heist - Local & Multi-Client Session Synchronization
 * Supports 5 cooperative players across tabs or network peers using BroadcastChannel & state events.
 */

export interface PlayerNetMessage {
  type: 'PLAYER_JOIN' | 'PLAYER_LEAVE' | 'PLAYER_INPUT' | 'HOST_STATE_SYNC' | 'HERO_CLAIM';
  roomId: string;
  senderId: string;
  timestamp: number;
  payload: any;
}

export class MultiplayerSync {
  private channel: BroadcastChannel | null = null;
  private roomId: string = 'HEIST-ALPHA';
  private clientId: string = '';
  private messageHandlers: ((msg: PlayerNetMessage) => void)[] = [];

  constructor() {
    this.clientId = `client_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
    if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
      this.initChannel(this.roomId);
    }
  }

  public initChannel(roomId: string) {
    if (this.channel) {
      this.channel.close();
    }
    this.roomId = roomId;
    this.channel = new BroadcastChannel(`goblin_heist_${roomId}`);
    this.channel.onmessage = (event: MessageEvent<PlayerNetMessage>) => {
      const msg = event.data;
      if (msg && msg.senderId !== this.clientId) {
        this.messageHandlers.forEach(h => h(msg));
      }
    };
  }

  public getRoomId(): string {
    return this.roomId;
  }

  public getClientId(): string {
    return this.clientId;
  }

  public onMessage(handler: (msg: PlayerNetMessage) => void) {
    this.messageHandlers.push(handler);
    return () => {
      this.messageHandlers = this.messageHandlers.filter(h => h !== handler);
    };
  }

  public broadcast(type: PlayerNetMessage['type'], payload: any) {
    if (!this.channel) return;
    const msg: PlayerNetMessage = {
      type,
      roomId: this.roomId,
      senderId: this.clientId,
      timestamp: Date.now(),
      payload,
    };
    try {
      this.channel.postMessage(msg);
    } catch {
      // Ignore channel send errors
    }
  }

  public destroy() {
    if (this.channel) {
      this.channel.close();
      this.channel = null;
    }
  }
}

export const netSync = new MultiplayerSync();
