import { Injectable } from '@nestjs/common';
import fs from 'fs';
import path from 'path';

export type BotProfile = {
  code: string;
  name: string;
  avatar: string | null;
  knowledgeByTag: Record<string, number>; // 0..1
  valueCurve: 'linear' | 'steep';
  buzzReactionMs: [number, number];
  mistakeRate: number; // 0..1
  riskProfile: 'low' | 'mid' | 'high';
  blindBuzzRate: number; // 0..1
};

@Injectable()
export class BotProfilesService {
  private profiles: BotProfile[] = [];

  constructor() {
    this.load();
  }

  private load() {
    try {
      const file = path.resolve(__dirname, '../../prisma/seed/bots.json');
      const raw = fs.readFileSync(file, 'utf-8');
      const parsed = JSON.parse(raw) as BotProfile[];
      if (Array.isArray(parsed) && parsed.length) this.profiles = parsed;
      else this.setDefaults();
    } catch {
      this.setDefaults();
    }
  }

  private setDefaults() {
    this.profiles = [
      {
        code: 'novice',
        name: 'Новичок',
        avatar: null,
        knowledgeByTag: { general: 0.5 },
        valueCurve: 'linear',
        buzzReactionMs: [650, 900],
        mistakeRate: 0.25,
        riskProfile: 'low',
        blindBuzzRate: 0.05,
      },
      {
        code: 'confident',
        name: 'Уверенный',
        avatar: null,
        knowledgeByTag: { general: 0.6 },
        valueCurve: 'linear',
        buzzReactionMs: [520, 780],
        mistakeRate: 0.15,
        riskProfile: 'mid',
        blindBuzzRate: 0.1,
      },
      {
        code: 'expert',
        name: 'Знаток',
        avatar: null,
        knowledgeByTag: { general: 0.8 },
        valueCurve: 'steep',
        buzzReactionMs: [450, 650],
        mistakeRate: 0.08,
        riskProfile: 'high',
        blindBuzzRate: 0.12,
      },
    ];
  }

  getAll(): BotProfile[] {
    return this.profiles;
  }

  pickSet(count: number): BotProfile[] {
    const arr = this.profiles.slice();
    // simple shuffle
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr.slice(0, Math.max(0, Math.min(count, arr.length)));
  }
}
