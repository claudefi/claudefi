/**
 * Telegram Bot Types
 */

export type AlertType = 'trade' | 'daily_summary' | 'position_closed' | 'error' | 'all';

export interface TelegramSubscriber {
  id: string;
  chatId: string;
  username?: string;
  alertTypes: AlertType[];
  isActive: boolean;
  createdAt: string;
}

export interface TradeAlert {
  type: 'trade';
  domain: string;
  action: string;
  target: string;
  amountUsd: number;
  reasoning: string;
  confidence: number;
  timestamp: string;
}

export interface PositionClosedAlert {
  type: 'position_closed';
  domain: string;
  target: string;
  entryValueUsd: number;
  exitValueUsd: number;
  pnl: number;
  pnlPercent: number;
  holdDuration: string;
  timestamp: string;
}

export interface DailySummaryAlert {
  type: 'daily_summary';
  totalAum: number;
  dailyPnl: number;
  dailyPnlPercent: number;
  openPositions: number;
  tradesExecuted: number;
  domains: {
    dlmm: { aum: number; pnl: number };
    perps: { aum: number; pnl: number };
    polymarket: { aum: number; pnl: number };
    spot: { aum: number; pnl: number };
  };
  timestamp: string;
}

export interface ErrorAlert {
  type: 'error';
  domain?: string;
  message: string;
  severity: 'warning' | 'error' | 'critical';
  timestamp: string;
}

export type Alert = TradeAlert | PositionClosedAlert | DailySummaryAlert | ErrorAlert;

export interface BotStatus {
  isRunning: boolean;
  lastCycleTime?: string;
  nextCycleTime?: string;
  totalAum: number;
  openPositions: number;
  activeDomains: string[];
}
