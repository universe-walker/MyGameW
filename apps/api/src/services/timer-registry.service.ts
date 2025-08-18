import { Injectable } from '@nestjs/common';

// Simple per-room timer registry with pause support.
// On pause, callbacks will be deferred until resume (polling every 100ms).

type TimerHandle = ReturnType<typeof setTimeout>;

type RoomTimers = {
  paused: boolean;
  timeouts: Map<string, TimerHandle>;
};

@Injectable()
export class TimerRegistryService {
  private rooms = new Map<string, RoomTimers>();

  private ensure(roomId: string): RoomTimers {
    let rt = this.rooms.get(roomId);
    if (!rt) {
      rt = { paused: false, timeouts: new Map() };
      this.rooms.set(roomId, rt);
    }
    return rt;
  }

  clearAll(roomId: string) {
    const rt = this.rooms.get(roomId);
    if (!rt) return;
    for (const h of rt.timeouts.values()) clearTimeout(h);
    rt.timeouts.clear();
  }

  pause(roomId: string) {
    const rt = this.ensure(roomId);
    rt.paused = true;
  }

  resume(roomId: string) {
    const rt = this.ensure(roomId);
    rt.paused = false;
  }

  isPaused(roomId: string) {
    return this.ensure(roomId).paused;
  }

  set(roomId: string, key: string, ms: number, cb: () => void) {
    const rt = this.ensure(roomId);
    const wrapped = () => {
      if (rt.paused) {
        // Defer while paused
        const h2 = setTimeout(wrapped, 100);
        rt.timeouts.set(key, h2);
        return;
      }
      rt.timeouts.delete(key);
      try {
        cb();
      } catch (e) {
        // eslint-disable-next-line no-console
        console.error('Timer callback error for', roomId, key, e);
      }
    };
    const h = setTimeout(wrapped, ms);
    rt.timeouts.set(key, h);
  }
}
