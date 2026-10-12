import fs from 'node:fs';
import path from 'node:path';

export interface RankingRow {
  nick: string;
  wins: number;
  losses: number;
  draws: number;
  points: number;
}

export interface MatchRecord {
  at: string;
  wave: number;
  winnerNick: string | null;
  scores: { nick: string; score: number }[];
}

interface Circle {
  players: Record<string, RankingRow>;
  matches: MatchRecord[];
}

interface FileShape {
  circles: Record<string, Circle>;
}

export interface RankOutcome {
  nick: string;
  score: number;
  outcome: 'win' | 'loss' | 'draw';
}

function emptyFile(): FileShape {
  return { circles: {} };
}

function nickKey(nick: string): string {
  return nick.trim().toLocaleLowerCase('pt-BR');
}

export class RankStore {
  constructor(private readonly filePath: string) {}

  record(code: string, entries: RankOutcome[], wave: number): RankingRow[] {
    const data = this.read();
    const circle = data.circles[code] ?? { players: {}, matches: [] };
    for (const entry of entries) {
      const key = nickKey(entry.nick);
      const row = circle.players[key] ?? {
        nick: entry.nick.trim(),
        wins: 0,
        losses: 0,
        draws: 0,
        points: 0,
      };
      row.nick = entry.nick.trim();
      row.points += entry.score;
      if (entry.outcome === 'win') row.wins += 1;
      else if (entry.outcome === 'loss') row.losses += 1;
      else row.draws += 1;
      circle.players[key] = row;
    }
    const winner = entries.find((entry) => entry.outcome === 'win');
    circle.matches.push({
      at: new Date().toISOString(),
      wave,
      winnerNick: winner ? winner.nick : null,
      scores: entries.map((entry) => ({ nick: entry.nick, score: entry.score })),
    });
    circle.matches = circle.matches.slice(-40);
    data.circles[code] = circle;
    this.write(data);
    return this.rows(circle);
  }

  ranking(code: string): RankingRow[] {
    const circle = this.read().circles[code];
    if (!circle) return [];
    return this.rows(circle);
  }

  private rows(circle: Circle): RankingRow[] {
    return Object.values(circle.players).sort((a, b) => b.wins - a.wins || b.points - a.points || a.nick.localeCompare(b.nick, 'pt-BR'));
  }

  private read(): FileShape {
    try {
      const raw = fs.readFileSync(this.filePath, 'utf8');
      const parsed: unknown = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object' || !('circles' in parsed)) return emptyFile();
      return parsed as FileShape;
    } catch {
      return emptyFile();
    }
  }

  private write(data: FileShape): void {
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    const tmp = `${this.filePath}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(data));
    fs.renameSync(tmp, this.filePath);
  }
}
