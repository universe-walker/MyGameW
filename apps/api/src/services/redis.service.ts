import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import Redis from 'ioredis';
import type { TRoomPlayer } from '@mygame/shared';

type RoomMeta = {
  createdAt: number;
  solo: boolean;
  botCount: number;
};

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  client!: Redis;
  private prefix = process.env.REDIS_PREFIX ?? '';
  private roomTTLSeconds = Number.isFinite(Number(process.env.ROOM_TTL_SECONDS))
    ? Number(process.env.ROOM_TTL_SECONDS)
    : 60 * 60 * 24 * 2; // 2 days by default

  onModuleInit() {
    const url = process.env.REDIS_URL || 'redis://localhost:6379';
    this.client = new Redis(url);
  }

  async onModuleDestroy() {
    if (this.client) await this.client.quit();
  }

  // Key builders
  private keyRoomMeta(roomId: string) {
    return `${this.prefix}room:${roomId}:meta`;
  }
  private keyRoomPlayers(roomId: string) {
    return `${this.prefix}room:${roomId}:players`;
  }

  // Parsing helpers
  getRoomIdFromPlayersKey(key: string): string | null {
    const raw = this.prefix && key.startsWith(this.prefix) ? key.slice(this.prefix.length) : key;
    if (!raw.startsWith('room:') || !raw.endsWith(':players')) return null;
    const parts = raw.split(':');
    // room:{roomId}:players -> parts = ['room', '{roomId}', 'players']
    return parts.length >= 3 ? parts[1] : null;
  }

  // Room meta
  async setRoomMeta(roomId: string, meta: Partial<RoomMeta>) {
    const data: Record<string, string> = {};
    if (typeof meta.createdAt === 'number') data.createdAt = String(meta.createdAt);
    if (typeof meta.solo === 'boolean') data.solo = meta.solo ? '1' : '0';
    if (typeof meta.botCount === 'number') data.botCount = String(meta.botCount);
    if (Object.keys(data).length) {
      await this.client.hset(this.keyRoomMeta(roomId), data);
    }
  }

  async getRoomMeta(roomId: string): Promise<RoomMeta> {
    const raw = await this.client.hgetall(this.keyRoomMeta(roomId));
    return {
      createdAt: raw.createdAt ? Number(raw.createdAt) : Date.now(),
      solo: raw.solo === '1',
      botCount: raw.botCount ? Number(raw.botCount) : 0,
    };
  }

  // Players storage (HSET by playerId -> JSON)
  async addPlayer(roomId: string, player: TRoomPlayer) {
    const key = this.keyRoomPlayers(roomId);
    const t = await this.client.type(key);
    if (t === 'set') await this.migratePlayersSetToHash(roomId);
    await this.client.hset(key, String(player.id), JSON.stringify(player));
  }

  async addPlayers(roomId: string, players: TRoomPlayer[]) {
    if (!players.length) return;
    const key = this.keyRoomPlayers(roomId);
    const t = await this.client.type(key);
    if (t === 'set') await this.migratePlayersSetToHash(roomId);
    const pipeline = this.client.pipeline();
    for (const p of players) {
      pipeline.hset(key, String(p.id), JSON.stringify(p));
    }
    await pipeline.exec();
  }

  async removePlayer(roomId: string, playerId: number) {
    const key = this.keyRoomPlayers(roomId);
    const type = await this.client.type(key);
    if (type === 'hash') {
      await this.client.hdel(key, String(playerId));
      return;
    }
    if (type === 'set') {
      const members = await this.client.smembers(key);
      const toRemove = members.find((m) => {
        try { const p = JSON.parse(m) as TRoomPlayer; return p.id === playerId; } catch { return false; }
      });
      if (toRemove) await this.client.srem(key, toRemove);
    }
  }

  async getPlayers(roomId: string): Promise<TRoomPlayer[]> {
    const key = this.keyRoomPlayers(roomId);
    const type = await this.client.type(key);
    if (type === 'hash') {
      const values = await this.client.hvals(key);
      const players: TRoomPlayer[] = [];
      for (const v of values) {
        try {
          const p = JSON.parse(v) as TRoomPlayer;
          if (typeof p?.id === 'number' && typeof p?.name === 'string') players.push(p);
        } catch {
          // ignore malformed entries
        }
      }
      return players;
    }
    if (type === 'set') {
      // Backward-compat: old storage as Set<JSON>
      const members = await this.client.smembers(key);
      const players: TRoomPlayer[] = [];
      for (const m of members) {
        try {
          const p = JSON.parse(m) as TRoomPlayer;
          if (typeof p?.id === 'number' && typeof p?.name === 'string') players.push(p);
        } catch {
          // ignore
        }
      }
      return players;
    }
    return [];
  }

  async getPlayersByKey(playersKey: string): Promise<TRoomPlayer[]> {
    const type = await this.client.type(playersKey);
    if (type === 'hash') {
      const values = await this.client.hvals(playersKey);
      const players: TRoomPlayer[] = [];
      for (const v of values) {
        try {
          const p = JSON.parse(v) as TRoomPlayer;
          if (typeof p?.id === 'number' && typeof p?.name === 'string') players.push(p);
        } catch {
          // ignore malformed entries
        }
      }
      return players;
    }
    if (type === 'set') {
      // Backward-compat: old storage as Set<JSON>
      const members = await this.client.smembers(playersKey);
      const players: TRoomPlayer[] = [];
      for (const m of members) {
        try {
          const p = JSON.parse(m) as TRoomPlayer;
          if (typeof p?.id === 'number' && typeof p?.name === 'string') players.push(p);
        } catch {
          // ignore
        }
      }
      return players;
    }
    return [];
  }

  async removePlayerByKey(playersKey: string, playerId: number) {
    const type = await this.client.type(playersKey);
    if (type === 'hash') {
      await this.client.hdel(playersKey, String(playerId));
      return;
    }
    if (type === 'set') {
      // Backward-compat: locate JSON entry with this id and SREM it
      const members = await this.client.smembers(playersKey);
      const toRemove = members.find((m) => {
        try { const p = JSON.parse(m) as TRoomPlayer; return p.id === playerId; } catch { return false; }
      });
      if (toRemove) await this.client.srem(playersKey, toRemove);
    }
  }

  async listRoomPlayerKeys(): Promise<string[]> {
    const keys: string[] = [];
    const pattern = `${this.prefix}room:*:players`;
    let cursor = '0';
    do {
      const res = await this.client.scan(cursor, 'MATCH', pattern, 'COUNT', 100);
      cursor = res[0];
      const batch = res[1];
      if (Array.isArray(batch) && batch.length) keys.push(...batch);
    } while (cursor !== '0');
    return keys;
  }

  // One-time migration helper: convert legacy Set<JSON> to Hash<id, JSON>
  private async migratePlayersSetToHash(roomId: string) {
    const key = this.keyRoomPlayers(roomId);
    const type = await this.client.type(key);
    if (type !== 'set') return;
    const members = await this.client.smembers(key);
    const entries: Array<[string, string]> = [];
    for (const m of members) {
      try {
        const p = JSON.parse(m) as TRoomPlayer;
        if (typeof p?.id === 'number') entries.push([String(p.id), JSON.stringify(p)]);
      } catch {
        // skip broken
      }
    }
    const pipeline = this.client.pipeline();
    pipeline.del(key);
    for (const [field, value] of entries) pipeline.hset(key, field, value);
    await pipeline.exec();
  }

  // TTL helpers
  async touchRoom(roomId: string) {
    const ttl = this.roomTTLSeconds;
    const pipe = this.client.pipeline();
    pipe.expire(this.keyRoomMeta(roomId), ttl);
    pipe.expire(this.keyRoomPlayers(roomId), ttl);
    await pipe.exec();
  }

  async deleteRoomIfEmpty(roomId: string): Promise<boolean> {
    const key = this.keyRoomPlayers(roomId);
    const type = await this.client.type(key);
    let count = 0;
    if (type === 'hash') count = await this.client.hlen(key);
    else if (type === 'set') count = await this.client.scard(key);
    if (count > 0) return false;
    const pipe = this.client.pipeline();
    pipe.del(this.keyRoomMeta(roomId));
    pipe.del(key);
    await pipe.exec();
    return true;
  }
}


