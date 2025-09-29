export class BotEngineConfig {
  readonly buzzerWindowMs: number;
  readonly prepareMs: number;
  readonly answerWaitHumanMs: number;
  readonly answerWaitBotMs: number;
  readonly scoreApplyMs: number;
  readonly soloAllowPause: boolean;
  readonly multiAllowPause: boolean;
  readonly revealMs: number;
  readonly superWaitMs: number;
  readonly debugAnswer: boolean;
  // Multiplayer defaults
  readonly defaultMinHumans: number;
  readonly defaultAutoBots: number;
  readonly blitzEnabled: boolean;
  readonly blitzRounds: number[];
  readonly blitzCellsPerRound: number;
  readonly blitzCount: number;
  readonly blitzTimerMs: number;
  readonly blitzRetryMs: number;
  readonly blitzScoringMode: 'by_value' | 'fixed';
  readonly blitzFixedCorrect: number;
  readonly blitzCorrectFactor: number;
  readonly blitzWrongFactor: number;

  constructor(private readonly env: NodeJS.ProcessEnv) {
    this.buzzerWindowMs = this.int('BUZZER_WINDOW_MS', 4500);
    this.prepareMs = this.int('PREPARE_MS', 1500);
    const answerWaitFallback = this.int('ANSWER_WAIT_MS', 30000);
    this.answerWaitHumanMs = this.int('ANSWER_WAIT_HUMAN_MS', answerWaitFallback);
    const botFallback = this.int('ANSWER_WAIT_MS', 15000);
    this.answerWaitBotMs = this.int('ANSWER_WAIT_BOT_MS', botFallback);
    this.scoreApplyMs = this.int('SCORE_APPLY_MS', 1000);
    this.soloAllowPause = this.bool('SOLO_ALLOW_PAUSE', true);
    this.multiAllowPause = this.bool('MULTI_ALLOW_PAUSE', false);
    this.revealMs = this.int('REVEAL_MS', 2500);
    this.superWaitMs = this.int('SUPER_WAIT_MS', 12000);
    this.debugAnswer = this.bool('DEBUG_ANSWER', false);
    // If explicitly allowed, enable 2-player multiplayer by default
    const allow2p = this.bool('ALLOW_TWO_PLAYER_MULTI', false);
    this.defaultMinHumans = allow2p ? 2 : this.int('DEFAULT_MIN_HUMANS', 3);
    this.defaultAutoBots = this.int('DEFAULT_AUTO_BOTS', 0);
    this.blitzEnabled = this.bool('BLITZ_ENABLED', true);
    this.blitzRounds = String(this.env.BLITZ_ROUNDS || '2')
      .split(',')
      .map((s) => Number(s.trim()))
      .filter((n) => Number.isFinite(n) && n > 0);
    this.blitzCellsPerRound = this.int('BLITZ_CELLS_PER_ROUND', 1);
    this.blitzCount = this.int('BLITZ_COUNT', 3);
    this.blitzTimerMs = this.int('BLITZ_TIMER_MS', 15000);
    this.blitzRetryMs = this.int('BLITZ_RETRY_MS', 7000);
    this.blitzScoringMode = (this.env.BLITZ_SCORING_MODE || 'by_value') as 'by_value' | 'fixed';
    this.blitzFixedCorrect = this.int('BLITZ_FIXED_CORRECT', 200);
    const correctFactor = Number(this.env.BLITZ_CORRECT_FACTOR);
    this.blitzCorrectFactor = Number.isFinite(correctFactor) ? Number(correctFactor) : 0.5;
    const wrongFactor = Number(this.env.BLITZ_WRONG_FACTOR);
    this.blitzWrongFactor = Number.isFinite(wrongFactor) ? Number(wrongFactor) : -0.25;
  }

  getInt(name: string, fallback: number): number {
    return this.int(name, fallback);
  }

  getBool(name: string, fallback: boolean): boolean {
    return this.bool(name, fallback);
  }

  private int(name: string, fallback: number): number {
    const raw = this.env[name];
    if (raw == null || raw === '') return fallback;
    const num = Number(raw);
    return Number.isFinite(num) ? num : fallback;
  }

  private bool(name: string, fallback: boolean): boolean {
    const raw = this.env[name];
    if (raw == null) return fallback;
    const value = String(raw).toLowerCase();
    if (['1', 'true', 'yes', 'y', 'on'].includes(value)) return true;
    if (['0', 'false', 'no', 'n', 'off'].includes(value)) return false;
    return fallback;
  }
}
