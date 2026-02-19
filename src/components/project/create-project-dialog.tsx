'use client';

import { useState } from 'react';
import { X, Plus } from 'lucide-react';
import type { ProjectType } from './types';
import { PROJECT_TYPE_META } from './ui';

/**
 * Modal dialog for creating a new project.
 * Shows name/description inputs, type selector grid, and template preview.
 *
 * Spec ref: §4.1 POST /api/projects
 */
export function CreateProjectDialog({
  open,
  onClose,
  onCreate,
}: {
  open: boolean;
  onClose: () => void;
  onCreate: (name: string, description: string, type: ProjectType) => void;
}) {
  const [name, setName] = useState('');
  const [desc, setDesc] = useState('');
  const [type, setType] = useState<ProjectType>('token');

  if (!open) return null;

  const templates: Record<ProjectType, string> = {
    token: `# [Project Name] — Project Memory\n\n> Auto-maintained by BNB Shield AI.\n\n## Contract\n- Chain: BSC (56)\n- Address: (not deployed yet)\n- Status: Draft\n\n## Token Economics\n- Total Supply: \n- Decimals: 18\n\n## History\n- {date} — Project created\n\n## TODO\n- [ ] Deploy contract\n- [ ] Verify on explorer\n- [ ] Add liquidity\n- [ ] Lock LP tokens`,
    nft: `# [Project Name] — Project Memory\n\n> Auto-maintained by BNB Shield AI.\n\n## Contract\n- Chain: BSC (56)\n- Address: (not deployed yet)\n- Standard: ERC721\n\n## Collection\n- Max Supply: \n- Mint Price: \n\n## History\n- {date} — Project created\n\n## TODO\n- [ ] Deploy NFT contract\n- [ ] Upload metadata to IPFS\n- [ ] Create mint page`,
    defi: `# [Project Name] — Project Memory\n\n> Auto-maintained by BNB Shield AI.\n\n## Strategy\n- Type: \n- Pairs: \n- Parameters: \n\n## Performance\n- Total trades: 0\n- P&L: 0 BNB\n\n## History\n- {date} — Project created\n\n## TODO\n- [ ] Define strategy parameters\n- [ ] Fund bot wallet`,
    custom: `# [Project Name] — Project Memory\n\n> Auto-maintained by BNB Shield AI.\n\n## Overview\n\n{description}\n\n## History\n- {date} — Project created\n\n## TODO\n- [ ] Define project requirements`,
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div className="animate-message-in w-full max-w-lg rounded-2xl border border-border bg-card p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-lg font-bold text-foreground">Create New Project</h2>
          <button onClick={onClose} className="rounded-md p-1 text-muted-foreground hover:text-foreground">
            <X className="size-4" />
          </button>
        </div>

        {/* Name */}
        <label className="mb-1 block text-xs font-medium text-muted-foreground">Project Name</label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="mb-4 w-full rounded-lg border border-border bg-background/60 px-3 py-2 text-sm text-foreground outline-none transition-colors focus:border-primary/50"
          placeholder="My Awesome Token"
        />

        {/* Description */}
        <label className="mb-1 block text-xs font-medium text-muted-foreground">Description</label>
        <textarea
          value={desc}
          onChange={(e) => setDesc(e.target.value)}
          className="mb-4 w-full rounded-lg border border-border bg-background/60 px-3 py-2 text-sm text-foreground outline-none transition-colors focus:border-primary/50"
          placeholder="Brief description of your project"
          rows={2}
        />

        {/* Type selector */}
        <label className="mb-2 block text-xs font-medium text-muted-foreground">Project Type</label>
        <div className="mb-5 grid grid-cols-2 gap-2">
          {(Object.entries(PROJECT_TYPE_META) as [ProjectType, (typeof PROJECT_TYPE_META)[ProjectType]][]).map(
            ([key, meta]) => {
              const Icon = meta.icon;
              const selected = type === key;
              return (
                <button
                  key={key}
                  onClick={() => setType(key)}
                  className={`flex items-center gap-2.5 rounded-xl border p-3 text-left transition-all ${
                    selected
                      ? 'border-primary/50 bg-primary/5 ring-1 ring-primary/20'
                      : 'border-border hover:border-border hover:bg-accent/50'
                  }`}
                >
                  <div className={`flex size-8 items-center justify-center rounded-lg border ${meta.bgColor}`}>
                    <Icon className={`size-4 ${meta.color}`} />
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-foreground">{meta.label}</p>
                    <p className="text-[10px] text-muted-foreground">{meta.description}</p>
                  </div>
                </button>
              );
            }
          )}
        </div>

        {/* Template preview */}
        <div className="mb-5 rounded-lg border border-border/60 bg-background/40 p-3">
          <p className="mb-1.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            Template Preview — memory.md
          </p>
          <pre className="max-h-[120px] overflow-y-auto whitespace-pre-wrap text-[11px] leading-relaxed text-muted-foreground/80">
            {templates[type]}
          </pre>
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="rounded-lg px-4 py-2 text-sm text-muted-foreground transition-colors hover:bg-accent">
            Cancel
          </button>
          <button
            onClick={() => {
              if (name.trim()) {
                onCreate(name.trim(), desc.trim(), type);
                onClose();
                setName('');
                setDesc('');
              }
            }}
            disabled={!name.trim()}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-lg transition-all hover:brightness-105 active:scale-[0.98] disabled:opacity-50"
          >
            <span className="flex items-center gap-1.5">
              <Plus className="size-3.5" /> Create Project
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}
