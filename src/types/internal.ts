import type { Domain } from './index.js';

export interface AgentWallets {
  solana_wallet_pubkey?: string;
  hyperliquid_wallet?: string;
  polygon_wallet?: string;
}

export interface PendingPosition {
  domain: Domain;
  id: string;
  tx_hash: string;
  opened_at: string;
}

export interface CommunitySkillRecord {
  id: string;
  name: string;
  description: string;
  author?: string;
  githubUrl?: string;
  domain?: string;
  downloads: number;
  rating: number;
  version: string;
  createdAt: Date;
  updatedAt: Date;
}
