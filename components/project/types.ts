// ============================================================================
// Project Feature — Shared Types
// These types mirror the spec (§3 Data Model) and are production-ready.
// ============================================================================

export type ProjectType = 'token' | 'nft' | 'defi' | 'custom';
export type ProjectStatus = 'draft' | 'active' | 'archived';
export type FileUpdatedBy = 'ai' | 'user' | 'system';
export type SidebarTab = 'projects' | 'chats';
export type DetailTab = 'overview' | 'memory' | 'files' | 'chats';

/** Matches spec §3.1 — projects table */
export interface Project {
  id: string;
  shortId: string;
  name: string;
  description: string | null;
  projectType: ProjectType;
  status: ProjectStatus;
  primaryChainId?: number | null;
  primaryContractAddress?: string | null;
  metadata?: Record<string, unknown>;
  memory: string;
  files: ProjectFile[];
  conversations: ProjectConversation[];
  contracts: ContractInfo[];
  createdAt: string;
  updatedAt: string;
  // Server-side aggregated counts (from listProjects)
  conversationCount?: number;
  fileCount?: number;
}

/** Matches spec §3.1 — project_files table */
export interface ProjectFile {
  id?: string;
  projectId?: string;
  path: string;
  content: string;
  contentType: string;
  language?: string;
  updatedBy: FileUpdatedBy;
  version: number;
  sizeBytes: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface ProjectConversation {
  id: string;
  title: string;
  lastMessage: string;
  messageCount: number;
  updatedAt: string;
}

/** Matches spec §3.1 metadata.contracts[] */
export interface ContractInfo {
  role: string;
  chainId: number;
  address: string;
  name: string;
  deployedAt: string;
  verified: boolean;
  deployTxHash?: string;
}

/** Simplified ABI function definition for Read/Write panels */
export interface AbiFunction {
  name: string;
  type: 'function';
  stateMutability: 'view' | 'pure' | 'nonpayable' | 'payable';
  inputs: { name: string; type: string }[];
  outputs: { name: string; type: string }[];
}

/** Chat message within project conversation */
export interface ProjectChatMsg {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  streaming: boolean;
  memoryUpdate?: MemoryUpdate;
  upgradePrompt?: boolean;
  toolHints?: string[];
  suggestions?: string[];
  cards?: ProjectChatCard[];
}

export interface MemoryUpdate {
  additions: string[];
  applied: boolean;
}

export interface ProjectChatCard {
  id: string;
  type: 'deploy-result' | 'contract-info' | 'verification' | 'security' | 'tx-receipt';
  title: string;
  data: Record<string, unknown>;
  loading: boolean;
}

/** Standalone chat (not in a project) */
export interface StandaloneChat {
  id: string;
  title: string;
  preview: string;
  updatedAt: string;
}

/** View state for the unified mock */
export type MockView =
  | 'home'
  | 'detail'
  | 'contract-page'
  | 'project-chat'
  | 'regular-chat';
