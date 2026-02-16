'use client';

import { useState, useCallback, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import {
  CheckCircle2,
  XCircle,
  Loader2,
  ExternalLink,
  Eye,
  EyeOff,
  Save,
} from 'lucide-react';
import { useI18n } from '@/lib/i18n/context';

type ValidationStatus = 'idle' | 'testing' | 'success' | 'error';

interface ValidationState {
  status: ValidationStatus;
  message: string;
}

interface AdminSettingsContentProps {
  adminToken?: string | null;
  initialConfig: {
    goplus: { appKey: string; appSecret: string } | null;
    bscscan: { apiKey: string } | null;
    nodereal: { apiKey: string } | null;
    serper: { apiKey: string } | null;
    steel: { apiKey: string; apiUrl?: string } | null;
    siwe: { domain?: string; allowedChainIds?: string } | null;
    rpc: { url56?: string; url97?: string; url204?: string } | null;
    envVars: {
      hasGoplusKey: boolean;
      hasBscscanKey: boolean;
      hasNoderealKey: boolean;
      hasSerperKey: boolean;
      hasSteelKey: boolean;
      hasSiweDomain: boolean;
      hasSiweChainIds: boolean;
      hasRpcUrls: boolean;
    };
  };
}

const inputClass =
  'w-full rounded-lg border border-border bg-background px-3 py-2 text-base text-foreground placeholder:text-muted-foreground/40 focus:border-primary focus:outline-none md:text-sm';
const passwordInputClass = `${inputClass} pr-10`;

export function AdminSettingsContent({
  adminToken,
  initialConfig,
}: AdminSettingsContentProps) {
  const { locale } = useI18n();
  const t = locale === 'zh' ? zh : en;

  // Build auth headers for setup API calls (stable ref)
  const authHeaders = useMemo(
    (): Record<string, string> =>
      adminToken ? { authorization: `Bearer ${adminToken}` } : {},
    [adminToken]
  );

  // GoPlus
  const [goplusKey, setGoplusKey] = useState(initialConfig.goplus?.appKey ?? '');
  const [goplusSecret, setGoplusSecret] = useState(
    initialConfig.goplus?.appSecret ?? ''
  );
  const [showGoplusSecret, setShowGoplusSecret] = useState(false);
  const [goplusValidation, setGoplusValidation] = useState<ValidationState>({
    status: 'idle',
    message: '',
  });

  // BscScan
  const [bscscanKey, setBscscanKey] = useState(
    initialConfig.bscscan?.apiKey ?? ''
  );
  const [showBscscanKey, setShowBscscanKey] = useState(false);
  const [bscscanValidation, setBscscanValidation] = useState<ValidationState>({
    status: 'idle',
    message: '',
  });

  // NodeReal
  const [noderealKey, setNoderealKey] = useState(
    initialConfig.nodereal?.apiKey ?? ''
  );
  const [showNoderealKey, setShowNoderealKey] = useState(false);
  const [noderealValidation, setNoderealValidation] = useState<ValidationState>({
    status: 'idle',
    message: '',
  });

  // Serper
  const [serperKey, setSerperKey] = useState(
    initialConfig.serper?.apiKey ?? ''
  );
  const [showSerperKey, setShowSerperKey] = useState(false);
  const [serperValidation, setSerperValidation] = useState<ValidationState>({
    status: 'idle',
    message: '',
  });

  // Steel
  const [steelKey, setSteelKey] = useState(
    initialConfig.steel?.apiKey ?? ''
  );
  const [steelUrl, setSteelUrl] = useState(
    initialConfig.steel?.apiUrl ?? ''
  );
  const [showSteelKey, setShowSteelKey] = useState(false);
  const [steelValidation, setSteelValidation] = useState<ValidationState>({
    status: 'idle',
    message: '',
  });

  // SIWE
  const [siweDomain, setSiweDomain] = useState(
    initialConfig.siwe?.domain ?? ''
  );
  const [siweChainIds, setSiweChainIds] = useState(
    initialConfig.siwe?.allowedChainIds ?? ''
  );
  const [siweValidation, setSiweValidation] = useState<ValidationState>({
    status: 'idle',
    message: '',
  });

  // RPC
  const [rpcUrl56, setRpcUrl56] = useState(initialConfig.rpc?.url56 ?? '');
  const [rpcUrl97, setRpcUrl97] = useState(initialConfig.rpc?.url97 ?? '');
  const [rpcUrl204, setRpcUrl204] = useState(initialConfig.rpc?.url204 ?? '');
  const [rpcValidation, setRpcValidation] = useState<ValidationState>({
    status: 'idle',
    message: '',
  });

  const [saving, setSaving] = useState(false);
  const [saveResult, setSaveResult] = useState<string | null>(null);

  // ── Validators ──────────────────────────────────────────

  const validateGoPlus = useCallback(async () => {
    setGoplusValidation({ status: 'testing', message: t.testing });
    try {
      const res = await fetch('/api/setup/validate', {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...authHeaders },
        body: JSON.stringify({
          service: 'goplus',
          config: { appKey: goplusKey, appSecret: goplusSecret },
        }),
      });
      const data = await res.json();
      setGoplusValidation({
        status: data.valid ? 'success' : 'error',
        message: data.message,
      });
    } catch {
      setGoplusValidation({ status: 'error', message: t.connectionError });
    }
  }, [goplusKey, goplusSecret, authHeaders, t]);

  const validateBscScan = useCallback(async () => {
    setBscscanValidation({ status: 'testing', message: t.testing });
    try {
      const res = await fetch('/api/setup/validate', {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...authHeaders },
        body: JSON.stringify({
          service: 'bscscan',
          config: { apiKey: bscscanKey },
        }),
      });
      const data = await res.json();
      setBscscanValidation({
        status: data.valid ? 'success' : 'error',
        message: data.message,
      });
    } catch {
      setBscscanValidation({ status: 'error', message: t.connectionError });
    }
  }, [bscscanKey, authHeaders, t]);

  const validateNodereal = useCallback(async () => {
    setNoderealValidation({ status: 'testing', message: t.testing });
    try {
      const res = await fetch('/api/setup/validate', {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...authHeaders },
        body: JSON.stringify({
          service: 'nodereal',
          config: { apiKey: noderealKey },
        }),
      });
      const data = await res.json();
      setNoderealValidation({
        status: data.valid ? 'success' : 'error',
        message: data.message,
      });
    } catch {
      setNoderealValidation({ status: 'error', message: t.connectionError });
    }
  }, [noderealKey, authHeaders, t]);

  const validateSerper = useCallback(async () => {
    setSerperValidation({ status: 'testing', message: t.testing });
    try {
      const res = await fetch('/api/setup/validate', {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...authHeaders },
        body: JSON.stringify({
          service: 'serper',
          config: { apiKey: serperKey },
        }),
      });
      const data = await res.json();
      setSerperValidation({
        status: data.valid ? 'success' : 'error',
        message: data.message,
      });
    } catch {
      setSerperValidation({ status: 'error', message: t.connectionError });
    }
  }, [serperKey, authHeaders, t]);

  const validateSteel = useCallback(async () => {
    setSteelValidation({ status: 'testing', message: t.testing });
    try {
      const res = await fetch('/api/setup/validate', {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...authHeaders },
        body: JSON.stringify({
          service: 'steel',
          config: { apiKey: steelKey, apiUrl: steelUrl || undefined },
        }),
      });
      const data = await res.json();
      setSteelValidation({
        status: data.valid ? 'success' : 'error',
        message: data.message,
      });
    } catch {
      setSteelValidation({ status: 'error', message: t.connectionError });
    }
  }, [steelKey, steelUrl, authHeaders, t]);

  const validateSiwe = useCallback(async () => {
    setSiweValidation({ status: 'testing', message: t.testing });
    try {
      const res = await fetch('/api/setup/validate', {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...authHeaders },
        body: JSON.stringify({
          service: 'siwe',
          config: { domain: siweDomain || undefined, allowedChainIds: siweChainIds || undefined },
        }),
      });
      const data = await res.json();
      setSiweValidation({
        status: data.valid ? 'success' : 'error',
        message: data.message,
      });
    } catch {
      setSiweValidation({ status: 'error', message: t.connectionError });
    }
  }, [siweDomain, siweChainIds, authHeaders, t]);

  const validateRpc = useCallback(async () => {
    setRpcValidation({ status: 'testing', message: t.testing });
    const config: Record<string, string> = {};
    if (rpcUrl56.trim()) config.url56 = rpcUrl56.trim();
    if (rpcUrl97.trim()) config.url97 = rpcUrl97.trim();
    if (rpcUrl204.trim()) config.url204 = rpcUrl204.trim();
    try {
      const res = await fetch('/api/setup/validate', {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...authHeaders },
        body: JSON.stringify({ service: 'rpc', config }),
      });
      const data = await res.json();
      setRpcValidation({
        status: data.valid ? 'success' : 'error',
        message: data.message,
      });
    } catch {
      setRpcValidation({ status: 'error', message: t.connectionError });
    }
  }, [rpcUrl56, rpcUrl97, rpcUrl204, authHeaders, t]);

  // ── Save ────────────────────────────────────────────────

  const handleSave = useCallback(async () => {
    setSaving(true);
    setSaveResult(null);
    try {
      const services: Record<string, unknown> = {};

      // GoPlus: send key if filled, null to clear
      services.goplus =
        goplusKey && goplusSecret
          ? { appKey: goplusKey, appSecret: goplusSecret }
          : null;
      services.bscscan = bscscanKey ? { apiKey: bscscanKey } : null;
      services.nodereal = noderealKey ? { apiKey: noderealKey } : null;
      services.serper = serperKey ? { apiKey: serperKey } : null;
      services.steel = steelKey
        ? { apiKey: steelKey, apiUrl: steelUrl || undefined }
        : null;
      services.siwe =
        siweDomain || siweChainIds
          ? { domain: siweDomain || undefined, allowedChainIds: siweChainIds || undefined }
          : null;
      services.rpc =
        rpcUrl56 || rpcUrl97 || rpcUrl204
          ? {
              url56: rpcUrl56 || undefined,
              url97: rpcUrl97 || undefined,
              url204: rpcUrl204 || undefined,
            }
          : null;

      const res = await fetch('/api/setup/save', {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...authHeaders },
        body: JSON.stringify({ skipModel: true, services }),
      });
      const data = await res.json();
      setSaveResult(data.ok ? t.saved : data.error || t.saveFailed);
    } catch {
      setSaveResult(t.saveFailed);
    } finally {
      setSaving(false);
    }
  }, [
    goplusKey, goplusSecret, bscscanKey, noderealKey, serperKey, steelKey, steelUrl,
    siweDomain, siweChainIds, rpcUrl56, rpcUrl97, rpcUrl204, authHeaders, t,
  ]);

  // ── Render helpers ──────────────────────────────────────

  const renderBadge = (v: ValidationState) => {
    if (v.status === 'idle') return null;
    if (v.status === 'testing')
      return (
        <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Loader2 className="size-3 animate-spin" />
          {v.message}
        </span>
      );
    if (v.status === 'success')
      return (
        <span className="flex items-center gap-1.5 text-xs text-emerald-400">
          <CheckCircle2 className="size-3" />
          {v.message}
        </span>
      );
    return (
      <span className="flex items-center gap-1.5 text-xs text-red-400">
        <XCircle className="size-3" />
        {v.message}
      </span>
    );
  };

  const envBadge = (detected: boolean) =>
    detected ? (
      <div className="mb-3 flex items-center gap-2 rounded-lg bg-emerald-500/10 px-3 py-2 text-xs text-emerald-400">
        <CheckCircle2 className="size-3 shrink-0" />
        {t.detectedFromEnv}
      </div>
    ) : null;

  const toggleButton = (show: boolean, setShow: (v: boolean) => void) => (
    <button
      type="button"
      onClick={() => setShow(!show)}
      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
    >
      {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
    </button>
  );

  // ── UI ──────────────────────────────────────────────────

  return (
    <div className="space-y-4">
      {/* GoPlus */}
      <div className="rounded-2xl border border-border bg-card/80 p-5 shadow-lg backdrop-blur-lg">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-foreground">
            GoPlus Security
          </h3>
          <a
            href="https://gopluslabs.io/"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-xs text-primary hover:underline"
          >
            {t.getKey}
            <ExternalLink className="size-3" />
          </a>
        </div>
        <p className="mb-3 text-xs text-muted-foreground">{t.goplusDesc}</p>
        {envBadge(initialConfig.envVars.hasGoplusKey)}
        <div className="space-y-3">
          <input
            type="text"
            value={goplusKey}
            onChange={(e) => {
              setGoplusKey(e.target.value);
              setGoplusValidation({ status: 'idle', message: '' });
            }}
            placeholder="App Key"
            className={inputClass}
          />
          <div className="relative">
            <input
              type={showGoplusSecret ? 'text' : 'password'}
              value={goplusSecret}
              onChange={(e) => {
                setGoplusSecret(e.target.value);
                setGoplusValidation({ status: 'idle', message: '' });
              }}
              placeholder="App Secret"
              className={passwordInputClass}
            />
            {toggleButton(showGoplusSecret, setShowGoplusSecret)}
          </div>
          <div className="flex items-center justify-between">
            <Button
              onClick={validateGoPlus}
              disabled={
                (!goplusKey || !goplusSecret) ||
                goplusValidation.status === 'testing'
              }
              variant="outline"
              size="sm"
              className="gap-1.5"
            >
              {goplusValidation.status === 'testing' && (
                <Loader2 className="size-3 animate-spin" />
              )}
              {t.test}
            </Button>
            {renderBadge(goplusValidation)}
          </div>
        </div>
      </div>

      {/* BscScan */}
      <div className="rounded-2xl border border-border bg-card/80 p-5 shadow-lg backdrop-blur-lg">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-foreground">
            BscScan / Etherscan
          </h3>
          <a
            href="https://etherscan.io/myapikey"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-xs text-primary hover:underline"
          >
            {t.getKey}
            <ExternalLink className="size-3" />
          </a>
        </div>
        <p className="mb-3 text-xs text-muted-foreground">{t.bscscanDesc}</p>
        {envBadge(initialConfig.envVars.hasBscscanKey)}
        <div className="space-y-3">
          <div className="relative">
            <input
              type={showBscscanKey ? 'text' : 'password'}
              value={bscscanKey}
              onChange={(e) => {
                setBscscanKey(e.target.value);
                setBscscanValidation({ status: 'idle', message: '' });
              }}
              placeholder="API Key"
              className={passwordInputClass}
            />
            {toggleButton(showBscscanKey, setShowBscscanKey)}
          </div>
          <div className="flex items-center justify-between">
            <Button
              onClick={validateBscScan}
              disabled={!bscscanKey || bscscanValidation.status === 'testing'}
              variant="outline"
              size="sm"
              className="gap-1.5"
            >
              {bscscanValidation.status === 'testing' && (
                <Loader2 className="size-3 animate-spin" />
              )}
              {t.test}
            </Button>
            {renderBadge(bscscanValidation)}
          </div>
        </div>
      </div>

      {/* NodeReal */}
      <div className="rounded-2xl border border-border bg-card/80 p-5 shadow-lg backdrop-blur-lg">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-foreground">
            NodeReal (BSC Enhanced)
          </h3>
          <a
            href="https://nodereal.io/meganode"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-xs text-primary hover:underline"
          >
            {t.getKey}
            <ExternalLink className="size-3" />
          </a>
        </div>
        <p className="mb-3 text-xs text-muted-foreground">{t.noderealDesc}</p>
        {envBadge(initialConfig.envVars.hasNoderealKey)}
        <div className="space-y-3">
          <div className="relative">
            <input
              type={showNoderealKey ? 'text' : 'password'}
              value={noderealKey}
              onChange={(e) => {
                setNoderealKey(e.target.value);
                setNoderealValidation({ status: 'idle', message: '' });
              }}
              placeholder="API Key"
              className={passwordInputClass}
            />
            {toggleButton(showNoderealKey, setShowNoderealKey)}
          </div>
          <div className="flex items-center justify-between">
            <Button
              onClick={validateNodereal}
              disabled={!noderealKey || noderealValidation.status === 'testing'}
              variant="outline"
              size="sm"
              className="gap-1.5"
            >
              {noderealValidation.status === 'testing' && (
                <Loader2 className="size-3 animate-spin" />
              )}
              {t.test}
            </Button>
            {renderBadge(noderealValidation)}
          </div>
        </div>
      </div>

      {/* Serper */}
      <div className="rounded-2xl border border-border bg-card/80 p-5 shadow-lg backdrop-blur-lg">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-foreground">
            Serper (Google Search)
          </h3>
          <a
            href="https://serper.dev/"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-xs text-primary hover:underline"
          >
            {t.getKey}
            <ExternalLink className="size-3" />
          </a>
        </div>
        <p className="mb-3 text-xs text-muted-foreground">{t.serperDesc}</p>
        {envBadge(initialConfig.envVars.hasSerperKey)}
        <div className="space-y-3">
          <div className="relative">
            <input
              type={showSerperKey ? 'text' : 'password'}
              value={serperKey}
              onChange={(e) => {
                setSerperKey(e.target.value);
                setSerperValidation({ status: 'idle', message: '' });
              }}
              placeholder="API Key"
              className={passwordInputClass}
            />
            {toggleButton(showSerperKey, setShowSerperKey)}
          </div>
          <div className="flex items-center justify-between">
            <Button
              onClick={validateSerper}
              disabled={!serperKey || serperValidation.status === 'testing'}
              variant="outline"
              size="sm"
              className="gap-1.5"
            >
              {serperValidation.status === 'testing' && (
                <Loader2 className="size-3 animate-spin" />
              )}
              {t.test}
            </Button>
            {renderBadge(serperValidation)}
          </div>
        </div>
      </div>

      {/* Steel */}
      <div className="rounded-2xl border border-border bg-card/80 p-5 shadow-lg backdrop-blur-lg">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-foreground">
            Steel (Web Scraper)
          </h3>
          <a
            href="https://steel.dev/"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-xs text-primary hover:underline"
          >
            {t.getKey}
            <ExternalLink className="size-3" />
          </a>
        </div>
        <p className="mb-3 text-xs text-muted-foreground">{t.steelDesc}</p>
        {envBadge(initialConfig.envVars.hasSteelKey)}
        <div className="space-y-3">
          <div className="relative">
            <input
              type={showSteelKey ? 'text' : 'password'}
              value={steelKey}
              onChange={(e) => {
                setSteelKey(e.target.value);
                setSteelValidation({ status: 'idle', message: '' });
              }}
              placeholder="API Key"
              className={passwordInputClass}
            />
            {toggleButton(showSteelKey, setShowSteelKey)}
          </div>
          <input
            type="text"
            value={steelUrl}
            onChange={(e) => {
              setSteelUrl(e.target.value);
              setSteelValidation({ status: 'idle', message: '' });
            }}
            placeholder="https://api.steel.dev"
            className={inputClass}
          />
          <div className="flex items-center justify-between">
            <Button
              onClick={validateSteel}
              disabled={!steelKey || steelValidation.status === 'testing'}
              variant="outline"
              size="sm"
              className="gap-1.5"
            >
              {steelValidation.status === 'testing' && (
                <Loader2 className="size-3 animate-spin" />
              )}
              {t.test}
            </Button>
            {renderBadge(steelValidation)}
          </div>
        </div>
      </div>

      {/* SIWE Authentication */}
      <div className="rounded-2xl border border-border bg-card/80 p-5 shadow-lg backdrop-blur-lg">
        <h3 className="mb-3 text-sm font-semibold text-foreground">
          {t.siweTitle}
        </h3>
        <p className="mb-3 text-xs text-muted-foreground">{t.siweDesc}</p>
        {envBadge(initialConfig.envVars.hasSiweDomain || initialConfig.envVars.hasSiweChainIds)}
        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-xs text-muted-foreground">{t.siweDomainLabel}</label>
            <input
              type="text"
              value={siweDomain}
              onChange={(e) => {
                setSiweDomain(e.target.value);
                setSiweValidation({ status: 'idle', message: '' });
              }}
              placeholder="app.example.com"
              className={inputClass}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-muted-foreground">{t.siweChainIdsLabel}</label>
            <input
              type="text"
              value={siweChainIds}
              onChange={(e) => {
                setSiweChainIds(e.target.value);
                setSiweValidation({ status: 'idle', message: '' });
              }}
              placeholder="56 (all)"
              className={inputClass}
            />
          </div>
          <div className="flex items-center justify-between">
            <Button
              onClick={validateSiwe}
              disabled={
                (!siweDomain && !siweChainIds) ||
                siweValidation.status === 'testing'
              }
              variant="outline"
              size="sm"
              className="gap-1.5"
            >
              {siweValidation.status === 'testing' && (
                <Loader2 className="size-3 animate-spin" />
              )}
              {t.test}
            </Button>
            {renderBadge(siweValidation)}
          </div>
        </div>
      </div>

      {/* Blockchain RPC */}
      <div className="rounded-2xl border border-border bg-card/80 p-5 shadow-lg backdrop-blur-lg">
        <h3 className="mb-3 text-sm font-semibold text-foreground">
          {t.rpcTitle}
        </h3>
        <p className="mb-3 text-xs text-muted-foreground">{t.rpcDesc}</p>
        {envBadge(initialConfig.envVars.hasRpcUrls)}
        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-xs text-muted-foreground">BSC Mainnet (Chain 56)</label>
            <input
              type="text"
              value={rpcUrl56}
              onChange={(e) => {
                setRpcUrl56(e.target.value);
                setRpcValidation({ status: 'idle', message: '' });
              }}
              placeholder="https://bsc-dataseed.binance.org"
              className={inputClass}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-muted-foreground">BSC Testnet (Chain 97)</label>
            <input
              type="text"
              value={rpcUrl97}
              onChange={(e) => {
                setRpcUrl97(e.target.value);
                setRpcValidation({ status: 'idle', message: '' });
              }}
              placeholder="https://bsc-testnet-dataseed.bnbchain.org"
              className={inputClass}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-muted-foreground">opBNB Mainnet (Chain 204)</label>
            <input
              type="text"
              value={rpcUrl204}
              onChange={(e) => {
                setRpcUrl204(e.target.value);
                setRpcValidation({ status: 'idle', message: '' });
              }}
              placeholder="https://opbnb-mainnet-rpc.bnbchain.org"
              className={inputClass}
            />
          </div>
          <div className="flex items-center justify-between">
            <Button
              onClick={validateRpc}
              disabled={
                (!rpcUrl56 && !rpcUrl97 && !rpcUrl204) ||
                rpcValidation.status === 'testing'
              }
              variant="outline"
              size="sm"
              className="gap-1.5"
            >
              {rpcValidation.status === 'testing' && (
                <Loader2 className="size-3 animate-spin" />
              )}
              {t.test}
            </Button>
            {renderBadge(rpcValidation)}
          </div>
        </div>
      </div>

      {/* Save button */}
      <div className="flex items-center justify-between gap-3 rounded-2xl border border-border bg-card/80 p-4 shadow-lg backdrop-blur-lg">
        <div className="text-sm text-muted-foreground">
          {saveResult && (
            <span
              className={
                saveResult === t.saved
                  ? 'text-emerald-400'
                  : 'text-red-400'
              }
            >
              {saveResult}
            </span>
          )}
        </div>
        <Button
          onClick={handleSave}
          disabled={saving}
          className="gap-1.5"
        >
          {saving ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Save className="size-4" />
          )}
          {t.saveSettings}
        </Button>
      </div>
    </div>
  );
}

const en = {
  testing: 'Testing...',
  connectionError: 'Connection failed',
  getKey: 'Get API key',
  goplusDesc:
    'Provides token security scanning, address analysis, and phishing detection. Free tier works without credentials.',
  bscscanDesc:
    'Provides transaction history, contract source code, and balance queries across 60+ EVM chains.',
  noderealDesc:
    'Free BSC enhanced API (100M CU/month). Provides transaction history and token transfers as a BscScan alternative.',
  serperDesc:
    'Provides Google Search and News results for deep token research and web intelligence.',
  steelDesc:
    'Headless browser for scraping SPA websites. Optional fallback for web search.',
  siweTitle: 'Authentication (SIWE)',
  siweDesc:
    'Sign-In with Ethereum configuration. Domain pinning prevents Origin header spoofing. Chain IDs restrict which chains can authenticate.',
  siweDomainLabel: 'Domain (optional)',
  siweChainIdsLabel: 'Allowed Chain IDs (comma-separated, or "all")',
  rpcTitle: 'Blockchain RPC',
  rpcDesc:
    'Custom RPC endpoints for BNB Chain. Leave empty to use public defaults.',
  detectedFromEnv: 'Also detected from environment variables',
  test: 'Test',
  saveSettings: 'Save Settings',
  saved: 'Settings saved successfully',
  saveFailed: 'Failed to save settings',
};

const zh: typeof en = {
  testing: '测试中...',
  connectionError: '连接失败',
  getKey: '获取 API Key',
  goplusDesc:
    '提供代币安全扫描、地址分析、钓鱼检测等功能。免费版可不填但有频率限制。',
  bscscanDesc:
    '提供交易历史、合约源码、余额查询功能，一个 API Key 支持 60+ EVM 链。',
  noderealDesc:
    '免费 BSC 增强 API（每月 100M CU）。提供交易历史和代币转账查询，作为 BscScan 的替代方案。',
  serperDesc:
    '提供 Google 搜索和新闻结果，用于深度代币研究和网络情报分析。',
  steelDesc:
    '无头浏览器，用于抓取 SPA 网站。可选的网络搜索备选方案。',
  siweTitle: '认证（SIWE）',
  siweDesc:
    '以太坊签名登录配置。域名锁定可防止 Origin 头欺骗。链 ID 限制可认证的链。',
  siweDomainLabel: '域名（可选）',
  siweChainIdsLabel: '允许的链 ID（逗号分隔，或 "all"）',
  rpcTitle: '区块链 RPC',
  rpcDesc:
    '自定义 BNB Chain RPC 端点。留空使用公共默认值。',
  detectedFromEnv: '同时已从环境变量检测到',
  test: '测试',
  saveSettings: '保存设置',
  saved: '设置保存成功',
  saveFailed: '保存设置失败',
};
