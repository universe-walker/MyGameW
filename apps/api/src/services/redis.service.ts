import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import Redis from 'ioredis';
import type { TRoomPlayer } from '@mygame/shared';

type RoomMeta = {
  createdAt: number;
  solo: boolean;
  botCount: number;
  minHumans?: number;
  autoBots?: number;
};

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  client!: Redis;
  private prefix = process.env.REDIS_PREFIX ?? '';
  private roomTTLSeconds = Number.isFinite(Number(process.env.ROOM_TTL_SECONDS))
    ? Number(process.env.ROOM_TTL_SECONDS)
    : 60 * 60 * 24 * 2; // 2 days by default
  private commandTimeoutMs = Number.isFinite(Number(process.env.REDIS_CMD_TIMEOUT_MS))
    ? Number(process.env.REDIS_CMD_TIMEOUT_MS)
    : 3000; // hard timeout per command

  onModuleInit() {
    const url = process.env.REDIS_URL || 'redis://localhost:6379';
    this.client = new Redis(url, {
      // Connection and retry behavior
      connectTimeout: Number(process.env.REDIS_CONNECT_TIMEOUT_MS || 5000),
      maxRetriesPerRequest: Number.isFinite(Number(process.env.REDIS_MAX_RETRIES))
        ? Number(process.env.REDIS_MAX_RETRIES)
        : 2,
      retryStrategy: (times) => {
        const base = Number(process.env.REDIS_RETRY_BASE_MS || 200);
        const max = Number(process.env.REDIS_RETRY_MAX_MS || 5000);
        const delay = Math.min(base * Math.pow(2, Math.max(0, times - 1)), max);
        return delay;
      },
      enableAutoPipelining: true,
      showFriendlyErrorStack: process.env.NODE_ENV !== 'production',
    });

    // Basic observability hooks
    this.client.on('connect', () => {
      // eslint-disable-next-line no-console
      console.log('[redis] connect');
    });
    this.client.on('ready', () => {
      // eslint-disable-next-line no-console
      console.log('[redis] ready');
    });
    this.client.on('reconnecting', (time: number) => {
      // eslint-disable-next-line no-console
      console.warn('[redis] reconnecting in', time, 'ms');
    });
    this.client.on('end', () => {
      // eslint-disable-next-line no-console
      console.warn('[redis] connection ended');
    });
    this.client.on('error', (err) => {
      // eslint-disable-next-line no-console
      console.error('[redis] error:', err?.message || err);
    });
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
    if (typeof meta.minHumans === 'number') data.minHumans = String(meta.minHumans);
    if (typeof meta.autoBots === 'number') data.autoBots = String(meta.autoBots);
    if (Object.keys(data).length) {
      await this.withTimeout(this.client.hset(this.keyRoomMeta(roomId), data), 'hset room:meta');
    }
  }

  async getRoomMeta(roomId: string): Promise<RoomMeta> {
    const raw = await this.withTimeout(this.client.hgetall(this.keyRoomMeta(roomId)), 'hgetall room:meta');
    return {
      createdAt: raw.createdAt ? Number(raw.createdAt) : Date.now(),
      solo: raw.solo === '1',
      botCount: raw.botCount ? Number(raw.botCount) : 0,
      minHumans: raw.minHumans ? Number(raw.minHumans) : undefined,
      autoBots: raw.autoBots ? Number(raw.autoBots) : undefined,
    };
  }

  // Players storage (HSET by playerId -> JSON)
  async addPlayer(roomId: string, player: TRoomPlayer) {
    const key = this.keyRoomPlayers(roomId);
    const t = await this.withTimeout(this.client.type(key), 'type players');
    if (t === 'set') await this.migratePlayersSetToHash(roomId);
    await this.withTimeout(this.client.hset(key, String(player.id), JSON.stringify(player)), 'hset player');
  }

  async addPlayers(roomId: string, players: TRoomPlayer[]) {
    if (!players.length) return;
    const key = this.keyRoomPlayers(roomId);
    const t = await this.withTimeout(this.client.type(key), 'type players');
    if (t === 'set') await this.migratePlayersSetToHash(roomId);
    const pipeline = this.client.pipeline();
    for (const p of players) {
      pipeline.hset(key, String(p.id), JSON.stringify(p));
    }
    await this.withTimeout(pipeline.exec(), 'pipeline addPlayers');
  }

  async removePlayer(roomId: string, playerId: number) {
    const key = this.keyRoomPlayers(roomId);
    const type = await this.withTimeout(this.client.type(key), 'type players');
    if (type === 'hash') {
      await this.withTimeout(this.client.hdel(key, String(playerId)), 'hdel player');
      return;
    }
    if (type === 'set') {
      const members = await this.withTimeout(this.client.smembers(key), 'smembers players');
      const toRemove = members.find((m) => {
        try { const p = JSON.parse(m) as TRoomPlayer; return p.id === playerId; } catch { return false; }
      });
      if (toRemove) await this.withTimeout(this.client.srem(key, toRemove), 'srem player');
    }
  }

  async getPlayers(roomId: string): Promise<TRoomPlayer[]> {
    const key = this.keyRoomPlayers(roomId);
    const type = await this.withTimeout(this.client.type(key), 'type players');
    if (type === 'hash') {
      const values = await this.withTimeout(this.client.hvals(key), 'hvals players');
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
      const members = await this.withTimeout(this.client.smembers(key), 'smembers players');
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
    const type = await this.withTimeout(this.client.type(playersKey), 'type playersKey');
    if (type === 'hash') {
      const values = await this.withTimeout(this.client.hvals(playersKey), 'hvals playersKey');
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
      const members = await this.withTimeout(this.client.smembers(playersKey), 'smembers playersKey');
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
    const type = await this.withTimeout(this.client.type(playersKey), 'type playersKey');
    if (type === 'hash') {
      await this.withTimeout(this.client.hdel(playersKey, String(playerId)), 'hdel playerKey');
      return;
    }
    if (type === 'set') {
      // Backward-compat: locate JSON entry with this id and SREM it
      const members = await this.withTimeout(this.client.smembers(playersKey), 'smembers playersKey');
      const toRemove = members.find((m) => {
        try { const p = JSON.parse(m) as TRoomPlayer; return p.id === playerId; } catch { return false; }
      });
      if (toRemove) await this.withTimeout(this.client.srem(playersKey, toRemove), 'srem playerKey');
    }
  }

  async listRoomPlayerKeys(): Promise<string[]> {
    const keys: string[] = [];
    const pattern = `${this.prefix}room:*:players`;
    let cursor = '0';
    do {
      const res = await this.withTimeout(this.client.scan(cursor, 'MATCH', pattern, 'COUNT', 100), 'scan players');
      cursor = res[0];
      const batch = res[1];
      if (Array.isArray(batch) && batch.length) keys.push(...batch);
    } while (cursor !== '0');
    return keys;
  }

  // One-time migration helper: convert legacy Set<JSON> to Hash<id, JSON>
  private async migratePlayersSetToHash(roomId: string) {
    const key = this.keyRoomPlayers(roomId);
    const type = await this.withTimeout(this.client.type(key), 'type migrate');
    if (type !== 'set') return;
    const members = await this.withTimeout(this.client.smembers(key), 'smembers migrate');
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
    await this.withTimeout(pipeline.exec(), 'pipeline migrate');
  }

  // TTL helpers
  async touchRoom(roomId: string) {
    const ttl = this.roomTTLSeconds;
    if (!Number.isFinite(ttl) || ttl <= 0) return;
    const pipe = this.client.pipeline();
    pipe.expire(this.keyRoomMeta(roomId), ttl);
    pipe.expire(this.keyRoomPlayers(roomId), ttl);
    await this.withTimeout(pipe.exec(), 'pipeline touchRoom');
  }

  async deleteRoomIfEmpty(roomId: string): Promise<boolean> {
    const key = this.keyRoomPlayers(roomId);
    const type = await this.withTimeout(this.client.type(key), 'type deleteRoomIfEmpty');
    let count = 0;
    if (type === 'hash') count = await this.withTimeout(this.client.hlen(key), 'hlen players');
    else if (type === 'set') count = await this.withTimeout(this.client.scard(key), 'scard players');
    if (count > 0) return false;
    const pipe = this.client.pipeline();
    pipe.del(this.keyRoomMeta(roomId));
    pipe.del(key);
    await this.withTimeout(pipe.exec(), 'pipeline deleteRoom');
    return true;
  }

  // Hard timeout wrapper for all redis calls in this service
  private async withTimeout<T>(p: Promise<T>, label: string): Promise<T> {
    const ms = this.commandTimeoutMs;
    if (!Number.isFinite(ms) || ms <= 0) return p;
    let timer: NodeJS.Timeout | null = null;
    try {
      return await Promise.race([
        p,
        new Promise<T>((_, reject) => {
          timer = setTimeout(() => reject(new Error(`[redis-timeout] ${label} exceeded ${ms}ms`)), ms);
        }),
      ]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }
}


