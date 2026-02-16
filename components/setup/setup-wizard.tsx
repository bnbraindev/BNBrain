'use client';

import { useState, useCallback, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import {
  CheckCircle2,
  XCircle,
  Loader2,
  ExternalLink,
  ArrowRight,
  ArrowLeft,
  Shield,
  ChevronDown,
  SkipForward,
  Eye,
  EyeOff,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useI18n } from '@/lib/i18n/context';

/* ─── Types ────────────────────────────────────────────────── */

interface SetupStatus {
  completed: boolean;
  hasModels: boolean;
  services: {
    anthropic: { configured: boolean; fromEnv: boolean };
    goplus: { configured: boolean; fromEnv: boolean };
    bscscan: { configured: boolean; fromEnv: boolean };
    serper: { configured: boolean; fromEnv: boolean };
    steel: { configured: boolean; fromEnv: boolean };
  };
  envPreloaded: {
    anthropicBaseUrl: string;
    anthropicModel: string;
    hasAnthropicKey: boolean;
    hasGoplusKey: boolean;
    hasBscscanKey: boolean;
    hasSerperKey: boolean;
    hasSteelKey: boolean;
    hasSiweDomain: boolean;
    hasSiweChainIds: boolean;
    hasRpcUrls: boolean;
  };
}

type ValidationStatus = 'idle' | 'testing' | 'success' | 'error';

interface ValidationState {
  status: ValidationStatus;
  message: string;
  latencyMs?: number;
}

interface SetupWizardProps {
  onComplete: () => void;
}

/* ─── Component ────────────────────────────────────────────── */

export function SetupWizard({ onComplete }: SetupWizardProps) {
  const { locale } = useI18n();
  const t = locale === 'zh' ? zh : en;

  const [step, setStep] = useState(0); // 0: AI, 1: Services, 2: Done
  const [status, setStatus] = useState<SetupStatus | null>(null);
  const [saving, setSaving] = useState(false);

  // Step 0: AI Model
  const [displayName, setDisplayName] = useState('');
  const [protocol, setProtocol] = useState<'anthropic' | 'openai'>('anthropic');
  const [apiKey, setApiKey] = useState('');
  const [baseUrl, setBaseUrl] = useState('https://api.anthropic.com');
  const [model, setModel] = useState('claude-sonnet-4-5-20250929');
  const [authMode, setAuthMode] = useState<'x-api-key' | 'bearer'>('x-api-key');
  const [modelValidation, setModelValidation] = useState<ValidationState>({
    status: 'idle',
    message: '',
  });
  const [showApiKey, setShowApiKey] = useState(false);

  // Step 1: Services
  const [goplusKey, setGoplusKey] = useState('');
  const [goplusSecret, setGoplusSecret] = useState('');
  const [goplusValidation, setGoplusValidation] = useState<ValidationState>({
    status: 'idle',
    message: '',
  });
  const [bscscanKey, setBscscanKey] = useState('');
  const [bscscanValidation, setBscscanValidation] = useState<ValidationState>({
    status: 'idle',
    message: '',
  });
  const [serperKey, setSerperKey] = useState('');
  const [serperValidation, setSerperValidation] = useState<ValidationState>({
    status: 'idle',
    message: '',
  });
  const [steelKey, setSteelKey] = useState('');
  const [steelUrl, setSteelUrl] = useState('');
  const [steelValidation, setSteelValidation] = useState<ValidationState>({
    status: 'idle',
    message: '',
  });

  // SIWE
  const [siweDomain, setSiweDomain] = useState('');
  const [siweChainIds, setSiweChainIds] = useState('');
  const [siweValidation, setSiweValidation] = useState<ValidationState>({
    status: 'idle',
    message: '',
  });

  // RPC URLs
  const [rpcUrl56, setRpcUrl56] = useState('');
  const [rpcUrl97, setRpcUrl97] = useState('');
  const [rpcUrl204, setRpcUrl204] = useState('');
  const [rpcValidation, setRpcValidation] = useState<ValidationState>({
    status: 'idle',
    message: '',
  });

  // Load initial status
  useEffect(() => {
    fetch('/api/setup/status')
      .then((r) => r.json())
      .then((data: SetupStatus) => {
        setStatus(data);
        // Pre-fill from env
        if (data.envPreloaded.anthropicBaseUrl) {
          setBaseUrl(data.envPreloaded.anthropicBaseUrl);
        }
        if (data.envPreloaded.anthropicModel) {
          setModel(data.envPreloaded.anthropicModel);
        }
        // If AI model already configured, jump to step 1
        if (data.hasModels) {
          setStep(1);
        }
      })
      .catch(() => {});
  }, []);

  // Protocol change handler
  const handleProtocolChange = useCallback(
    (newProtocol: 'anthropic' | 'openai') => {
      setProtocol(newProtocol);
      if (newProtocol === 'openai') {
        setAuthMode('bearer');
        if (baseUrl === 'https://api.anthropic.com') {
          setBaseUrl('https://api.openai.com');
        }
      } else {
        setAuthMode('x-api-key');
        if (baseUrl === 'https://api.openai.com') {
          setBaseUrl('https://api.anthropic.com');
        }
      }
      setModelValidation({ status: 'idle', message: '' });
    },
    [baseUrl]
  );

  // ── Validators ──────────────────────────────────────────

  const validateModel = useCallback(async () => {
    setModelValidation({ status: 'testing', message: t.testing });
    try {
      const res = await fetch('/api/setup/validate', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          service: 'anthropic',
          config: { apiKey, baseUrl, model, protocol, authMode },
        }),
      });
      const data = await res.json();
      setModelValidation({
        status: data.valid ? 'success' : 'error',
        message: data.message,
        latencyMs: data.latencyMs,
      });
    } catch {
      setModelValidation({ status: 'error', message: t.connectionError });
    }
  }, [apiKey, baseUrl, model, protocol, authMode, t]);

  const validateGoPlus = useCallback(async () => {
    setGoplusValidation({ status: 'testing', message: t.testing });
    try {
      const res = await fetch('/api/setup/validate', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          service: 'goplus',
          config: { appKey: goplusKey, appSecret: goplusSecret },
        }),
      });
      const data = await res.json();
      setGoplusValidation({
        status: data.valid ? 'success' : 'error',
        message: data.message,
        latencyMs: data.latencyMs,
      });
    } catch {
      setGoplusValidation({ status: 'error', message: t.connectionError });
    }
  }, [goplusKey, goplusSecret, t]);

  const validateBscScan = useCallback(async () => {
    setBscscanValidation({ status: 'testing', message: t.testing });
    try {
      const res = await fetch('/api/setup/validate', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          service: 'bscscan',
          config: { apiKey: bscscanKey },
        }),
      });
      const data = await res.json();
      setBscscanValidation({
        status: data.valid ? 'success' : 'error',
        message: data.message,
        latencyMs: data.latencyMs,
      });
    } catch {
      setBscscanValidation({ status: 'error', message: t.connectionError });
    }
  }, [bscscanKey, t]);

  const validateSerper = useCallback(async () => {
    setSerperValidation({ status: 'testing', message: t.testing });
    try {
      const res = await fetch('/api/setup/validate', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          service: 'serper',
          config: { apiKey: serperKey },
        }),
      });
      const data = await res.json();
      setSerperValidation({
        status: data.valid ? 'success' : 'error',
        message: data.message,
        latencyMs: data.latencyMs,
      });
    } catch {
      setSerperValidation({ status: 'error', message: t.connectionError });
    }
  }, [serperKey, t]);

  const validateSteel = useCallback(async () => {
    setSteelValidation({ status: 'testing', message: t.testing });
    try {
      const res = await fetch('/api/setup/validate', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          service: 'steel',
          config: { apiKey: steelKey, apiUrl: steelUrl || undefined },
        }),
      });
      const data = await res.json();
      setSteelValidation({
        status: data.valid ? 'success' : 'error',
        message: data.message,
        latencyMs: data.latencyMs,
      });
    } catch {
      setSteelValidation({ status: 'error', message: t.connectionError });
    }
  }, [steelKey, steelUrl, t]);

  const validateSiwe = useCallback(async () => {
    setSiweValidation({ status: 'testing', message: t.testing });
    try {
      const res = await fetch('/api/setup/validate', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          service: 'siwe',
          config: { domain: siweDomain || undefined, allowedChainIds: siweChainIds || undefined },
        }),
      });
      const data = await res.json();
      setSiweValidation({
        status: data.valid ? 'success' : 'error',
        message: data.message,
        latencyMs: data.latencyMs,
      });
    } catch {
      setSiweValidation({ status: 'error', message: t.connectionError });
    }
  }, [siweDomain, siweChainIds, t]);

  const validateRpc = useCallback(async () => {
    setRpcValidation({ status: 'testing', message: t.testing });
    try {
      const res = await fetch('/api/setup/validate', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          service: 'rpc',
          config: { url56: rpcUrl56 || undefined, url97: rpcUrl97 || undefined, url204: rpcUrl204 || undefined },
        }),
      });
      const data = await res.json();
      setRpcValidation({
        status: data.valid ? 'success' : 'error',
        message: data.message,
        latencyMs: data.latencyMs,
      });
    } catch {
      setRpcValidation({ status: 'error', message: t.connectionError });
    }
  }, [rpcUrl56, rpcUrl97, rpcUrl204, t]);

  // ── Save & Complete ─────────────────────────────────────

  const handleComplete = useCallback(async () => {
    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        services: {} as Record<string, unknown>,
      };

      // Include model if not already configured
      if (!status?.hasModels && modelValidation.status === 'success') {
        payload.model = {
          displayName: displayName.trim() || model,
          protocol,
          baseUrl,
          providerModelId: model,
          apiKey,
          authMode,
        };
      } else {
        payload.skipModel = true;
      }

      const services = payload.services as Record<string, unknown>;
      if (goplusKey && goplusSecret) {
        services.goplus = { appKey: goplusKey, appSecret: goplusSecret };
      }
      if (bscscanKey) {
        services.bscscan = { apiKey: bscscanKey };
      }
      if (serperKey) {
        services.serper = { apiKey: serperKey };
      }
      if (steelKey) {
        services.steel = { apiKey: steelKey, apiUrl: steelUrl || undefined };
      }
      if (siweDomain || siweChainIds) {
        services.siwe = {
          domain: siweDomain || undefined,
          allowedChainIds: siweChainIds || undefined,
        };
      }
      if (rpcUrl56 || rpcUrl97 || rpcUrl204) {
        services.rpc = {
          url56: rpcUrl56 || undefined,
          url97: rpcUrl97 || undefined,
          url204: rpcUrl204 || undefined,
        };
      }

      const res = await fetch('/api/setup/save', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (data.ok) {
        setStep(2);
        setTimeout(onComplete, 1500);
      } else {
        alert(data.error || 'Setup save failed');
      }
    } catch {
      alert('Network error');
    } finally {
      setSaving(false);
    }
  }, [
    status,
    modelValidation,
    displayName,
    protocol,
    baseUrl,
    model,
    apiKey,
    authMode,
    goplusKey,
    goplusSecret,
    bscscanKey,
    serperKey,
    steelKey,
    steelUrl,
    siweDomain,
    siweChainIds,
    rpcUrl56,
    rpcUrl97,
    rpcUrl204,
    onComplete,
  ]);

  // ── Render helpers ──────────────────────────────────────

  const canProceedFromStep0 =
    status?.hasModels || modelValidation.status === 'success';

  const renderValidationBadge = (v: ValidationState) => {
    if (v.status === 'idle') return null;
    if (v.status === 'testing')
      return (
        <span className="flex items-center gap-1.5 text-xs text-foreground">
          <Loader2 className="size-3.5 animate-spin text-primary" />
          {v.message}
        </span>
      );
    if (v.status === 'success')
      return (
        <span className="flex items-center gap-1.5 text-xs text-emerald-400">
          <CheckCircle2 className="size-3.5" />
          {v.message}
        </span>
      );
    return (
      <span className="flex items-center gap-1.5 text-xs text-red-400">
        <XCircle className="size-3.5" />
        {v.message}
      </span>
    );
  };

  // ── Step indicators ─────────────────────────────────────

  const steps = [
    { label: t.stepAI, done: step > 0 || canProceedFromStep0 },
    { label: t.stepServices, done: step > 1 },
    { label: t.stepDone, done: step === 2 },
  ];

  // ── UI ──────────────────────────────────────────────────

  return (
    <div className="flex h-[100dvh] flex-col items-center justify-start overflow-y-auto bg-background px-4 py-8 sm:py-12">
      {/* Header */}
      <div className="mb-8 flex flex-col items-center gap-3 text-center animate-hero-entrance">
        <div className="relative flex size-16 items-center justify-center rounded-2xl bg-primary/10 animate-shield-glow">
          <Shield className="size-8 text-primary" />
        </div>
        <h1 className="text-2xl font-bold text-foreground sm:text-3xl">
          BNBrain
        </h1>
        <p className="max-w-md text-sm text-muted-foreground">
          {t.subtitle}
        </p>
      </div>

      {/* Step indicator */}
      <div className="mb-8 flex items-center gap-2 sm:gap-3">
        {steps.map((s, i) => (
          <div key={i} className="flex items-center gap-2 sm:gap-3">
            <button
              onClick={() => {
                if (i < step) setStep(i);
              }}
              className={cn(
                'flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-all',
                i === step
                  ? 'bg-primary text-primary-foreground shadow-lg shadow-primary/25'
                  : s.done
                    ? 'cursor-pointer bg-primary/20 text-primary hover:bg-primary/30'
                    : 'bg-card text-muted-foreground'
              )}
            >
              <span className="flex size-5 items-center justify-center rounded-full bg-black/10 text-[10px] font-bold">
                {s.done && i !== step ? (
                  <CheckCircle2 className="size-3.5" />
                ) : (
                  i + 1
                )}
              </span>
              <span className="hidden sm:inline">{s.label}</span>
            </button>
            {i < steps.length - 1 && (
              <div
                className={cn(
                  'h-px w-6 sm:w-10',
                  i < step ? 'bg-primary/40' : 'bg-border'
                )}
              />
            )}
          </div>
        ))}
      </div>

      {/* Content card */}
      <div className="w-full max-w-xl">
        {/* ── Step 0: AI Model ───────────────────────── */}
        {step === 0 && (
          <div className="space-y-6 animate-message-in">
            <div className="rounded-2xl border border-border bg-card/80 p-5 shadow-lg backdrop-blur-lg sm:p-6">
              <h2 className="mb-1 text-lg font-semibold text-foreground">
                {t.aiTitle}
              </h2>
              <p className="mb-5 text-sm text-muted-foreground">
                {t.aiDesc}
              </p>

              {!status && (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="size-5 animate-spin text-primary" />
                </div>
              )}

              {status?.hasModels && (
                <div className="mb-4 flex items-center gap-2 rounded-xl bg-emerald-500/10 px-4 py-3 text-sm text-emerald-400">
                  <CheckCircle2 className="size-4 shrink-0" />
                  {status.envPreloaded.hasAnthropicKey
                    ? t.aiDetectedEnv
                    : t.aiDetectedDb}
                </div>
              )}

              {status && !status.hasModels && (
                <div className="space-y-4">
                  {/* Display Name */}
                  <div>
                    <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
                      {t.displayName}
                    </label>
                    <input
                      type="text"
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                      placeholder={t.displayNamePlaceholder}
                      className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-base text-foreground placeholder:text-muted-foreground/40 focus:border-primary focus:outline-none md:text-sm"
                    />
                  </div>

                  {/* Protocol selector */}
                  <div>
                    <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
                      {t.protocol}
                    </label>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => handleProtocolChange('anthropic')}
                        className={cn(
                          'flex-1 rounded-lg border px-3 py-2 text-sm font-medium transition-all',
                          protocol === 'anthropic'
                            ? 'border-primary bg-primary/10 text-foreground'
                            : 'border-border bg-card text-muted-foreground hover:border-primary/30'
                        )}
                      >
                        Anthropic
                      </button>
                      <button
                        type="button"
                        onClick={() => handleProtocolChange('openai')}
                        className={cn(
                          'flex-1 rounded-lg border px-3 py-2 text-sm font-medium transition-all',
                          protocol === 'openai'
                            ? 'border-primary bg-primary/10 text-foreground'
                            : 'border-border bg-card text-muted-foreground hover:border-primary/30'
                        )}
                      >
                        OpenAI Compatible
                      </button>
                    </div>
                  </div>

                  {/* API Key */}
                  <div>
                    <div className="mb-1.5 flex items-center justify-between">
                      <label className="text-xs font-medium text-muted-foreground">
                        API Key
                      </label>
                      <a
                        href={
                          protocol === 'anthropic'
                            ? 'https://console.anthropic.com/settings/keys'
                            : 'https://platform.openai.com/api-keys'
                        }
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1 text-xs text-primary hover:underline"
                      >
                        {t.getKey}
                        <ExternalLink className="size-3" />
                      </a>
                    </div>
                    <div className="relative">
                      <input
                        type={showApiKey ? 'text' : 'password'}
                        value={apiKey}
                        onChange={(e) => {
                          setApiKey(e.target.value);
                          setModelValidation({ status: 'idle', message: '' });
                        }}
                        placeholder={
                          protocol === 'anthropic'
                            ? 'sk-ant-...'
                            : 'sk-...'
                        }
                        className="w-full rounded-lg border border-border bg-background px-3 py-2.5 pr-10 text-base text-foreground placeholder:text-muted-foreground/40 focus:border-primary focus:outline-none md:text-sm"
                      />
                      <button
                        type="button"
                        onClick={() => setShowApiKey(!showApiKey)}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      >
                        {showApiKey ? (
                          <EyeOff className="size-4" />
                        ) : (
                          <Eye className="size-4" />
                        )}
                      </button>
                    </div>
                  </div>

                  {/* Base URL */}
                  <div>
                    <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
                      Base URL
                    </label>
                    <input
                      type="text"
                      value={baseUrl}
                      onChange={(e) => {
                        setBaseUrl(e.target.value);
                        setModelValidation({ status: 'idle', message: '' });
                      }}
                      className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-base text-foreground placeholder:text-muted-foreground/40 focus:border-primary focus:outline-none md:text-sm"
                    />
                  </div>

                  {/* Model ID */}
                  <div>
                    <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
                      {t.modelId}
                    </label>
                    <input
                      type="text"
                      value={model}
                      onChange={(e) => {
                        setModel(e.target.value);
                        setModelValidation({ status: 'idle', message: '' });
                      }}
                      placeholder="claude-sonnet-4-5-20250929"
                      className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-base text-foreground placeholder:text-muted-foreground/40 focus:border-primary focus:outline-none md:text-sm"
                    />
                  </div>

                  {/* Auth Mode (advanced) */}
                  <details className="group">
                    <summary className="flex cursor-pointer items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground">
                      <ChevronDown className="size-3 transition-transform group-open:rotate-180" />
                      {t.advanced}
                    </summary>
                    <div className="mt-3">
                      <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
                        {t.authMode}
                      </label>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => setAuthMode('x-api-key')}
                          className={cn(
                            'flex-1 rounded-lg border px-3 py-2 text-xs font-medium transition-all',
                            authMode === 'x-api-key'
                              ? 'border-primary bg-primary/10 text-foreground'
                              : 'border-border bg-card text-muted-foreground hover:border-primary/30'
                          )}
                        >
                          x-api-key
                        </button>
                        <button
                          type="button"
                          onClick={() => setAuthMode('bearer')}
                          className={cn(
                            'flex-1 rounded-lg border px-3 py-2 text-xs font-medium transition-all',
                            authMode === 'bearer'
                              ? 'border-primary bg-primary/10 text-foreground'
                              : 'border-border bg-card text-muted-foreground hover:border-primary/30'
                          )}
                        >
                          Bearer Token
                        </button>
                      </div>
                    </div>
                  </details>

                  {/* Test button */}
                  <div className="flex items-center justify-between">
                    <Button
                      onClick={validateModel}
                      disabled={
                        !apiKey ||
                        !baseUrl ||
                        !model ||
                        modelValidation.status === 'testing'
                      }
                      variant="outline"
                      size="sm"
                      className="gap-1.5"
                    >
                      {modelValidation.status === 'testing' ? (
                        <Loader2 className="size-3.5 animate-spin" />
                      ) : null}
                      {t.testConnection}
                    </Button>
                    {renderValidationBadge(modelValidation)}
                  </div>
                </div>
              )}
            </div>

            {/* Navigation */}
            <div className="flex justify-end gap-3">
              <Button
                onClick={() => setStep(1)}
                disabled={!canProceedFromStep0}
                className="gap-1.5"
              >
                {t.next}
                <ArrowRight className="size-4" />
              </Button>
            </div>
          </div>
        )}

        {/* ── Step 1: Services ───────────────────────── */}
        {step === 1 && (
          <div className="space-y-6 animate-message-in">
            <div className="rounded-2xl border border-border bg-card/80 p-5 shadow-lg backdrop-blur-lg sm:p-6">
              <h2 className="mb-1 text-lg font-semibold text-foreground">
                {t.servicesTitle}
              </h2>
              <p className="mb-5 text-sm text-muted-foreground">
                {t.servicesDesc}
              </p>

              {/* GoPlus */}
              <div className="mb-6">
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
                <p className="mb-3 text-xs text-muted-foreground">
                  {t.goplusDesc}
                </p>
                {status?.envPreloaded.hasGoplusKey && (
                  <div className="mb-3 flex items-center gap-2 rounded-lg bg-emerald-500/10 px-3 py-2 text-xs text-emerald-400">
                    <CheckCircle2 className="size-3.5 shrink-0" />
                    {t.detectedFromEnv}
                  </div>
                )}
                <div className="space-y-3">
                  <input
                    type="text"
                    value={goplusKey}
                    onChange={(e) => {
                      setGoplusKey(e.target.value);
                      setGoplusValidation({ status: 'idle', message: '' });
                    }}
                    placeholder="App Key"
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-base text-foreground placeholder:text-muted-foreground/40 focus:border-primary focus:outline-none md:text-sm"
                  />
                  <input
                    type="password"
                    value={goplusSecret}
                    onChange={(e) => {
                      setGoplusSecret(e.target.value);
                      setGoplusValidation({ status: 'idle', message: '' });
                    }}
                    placeholder="App Secret"
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-base text-foreground placeholder:text-muted-foreground/40 focus:border-primary focus:outline-none md:text-sm"
                  />
                  <div className="flex items-center justify-between">
                    <Button
                      onClick={validateGoPlus}
                      disabled={
                        ((!goplusKey || !goplusSecret) &&
                          !status?.envPreloaded.hasGoplusKey) ||
                        goplusValidation.status === 'testing'
                      }
                      variant="outline"
                      size="sm"
                      className="gap-1.5"
                    >
                      {goplusValidation.status === 'testing' ? (
                        <Loader2 className="size-3.5 animate-spin" />
                      ) : null}
                      {t.test}
                    </Button>
                    {renderValidationBadge(goplusValidation)}
                  </div>
                </div>
              </div>

              <div className="sidebar-gradient-sep mb-6" />

              {/* BscScan */}
              <div>
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
                <p className="mb-3 text-xs text-muted-foreground">
                  {t.bscscanDesc}
                </p>
                {status?.envPreloaded.hasBscscanKey && (
                  <div className="mb-3 flex items-center gap-2 rounded-lg bg-emerald-500/10 px-3 py-2 text-xs text-emerald-400">
                    <CheckCircle2 className="size-3.5 shrink-0" />
                    {t.detectedFromEnv}
                  </div>
                )}
                <div className="space-y-3">
                  <input
                    type="text"
                    value={bscscanKey}
                    onChange={(e) => {
                      setBscscanKey(e.target.value);
                      setBscscanValidation({ status: 'idle', message: '' });
                    }}
                    placeholder="API Key"
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-base text-foreground placeholder:text-muted-foreground/40 focus:border-primary focus:outline-none md:text-sm"
                  />
                  <div className="flex items-center justify-between">
                    <Button
                      onClick={validateBscScan}
                      disabled={
                        (!bscscanKey && !status?.envPreloaded.hasBscscanKey) ||
                        bscscanValidation.status === 'testing'
                      }
                      variant="outline"
                      size="sm"
                      className="gap-1.5"
                    >
                      {bscscanValidation.status === 'testing' ? (
                        <Loader2 className="size-3.5 animate-spin" />
                      ) : null}
                      {t.test}
                    </Button>
                    {renderValidationBadge(bscscanValidation)}
                  </div>
                </div>
              </div>

              <div className="sidebar-gradient-sep mb-6" />

              {/* Serper */}
              <div className="mb-6">
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
                <p className="mb-3 text-xs text-muted-foreground">
                  {t.serperDesc}
                </p>
                {status?.envPreloaded.hasSerperKey && (
                  <div className="mb-3 flex items-center gap-2 rounded-lg bg-emerald-500/10 px-3 py-2 text-xs text-emerald-400">
                    <CheckCircle2 className="size-3.5 shrink-0" />
                    {t.detectedFromEnv}
                  </div>
                )}
                <div className="space-y-3">
                  <input
                    type="password"
                    value={serperKey}
                    onChange={(e) => {
                      setSerperKey(e.target.value);
                      setSerperValidation({ status: 'idle', message: '' });
                    }}
                    placeholder="API Key"
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-base text-foreground placeholder:text-muted-foreground/40 focus:border-primary focus:outline-none md:text-sm"
                  />
                  <div className="flex items-center justify-between">
                    <Button
                      onClick={validateSerper}
                      disabled={
                        (!serperKey && !status?.envPreloaded.hasSerperKey) ||
                        serperValidation.status === 'testing'
                      }
                      variant="outline"
                      size="sm"
                      className="gap-1.5"
                    >
                      {serperValidation.status === 'testing' ? (
                        <Loader2 className="size-3.5 animate-spin" />
                      ) : null}
                      {t.test}
                    </Button>
                    {renderValidationBadge(serperValidation)}
                  </div>
                </div>
              </div>

              <div className="sidebar-gradient-sep mb-6" />

              {/* Steel */}
              <div>
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
                <p className="mb-3 text-xs text-muted-foreground">
                  {t.steelDesc}
                </p>
                {status?.envPreloaded.hasSteelKey && (
                  <div className="mb-3 flex items-center gap-2 rounded-lg bg-emerald-500/10 px-3 py-2 text-xs text-emerald-400">
                    <CheckCircle2 className="size-3.5 shrink-0" />
                    {t.detectedFromEnv}
                  </div>
                )}
                <div className="space-y-3">
                  <input
                    type="password"
                    value={steelKey}
                    onChange={(e) => {
                      setSteelKey(e.target.value);
                      setSteelValidation({ status: 'idle', message: '' });
                    }}
                    placeholder="API Key"
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-base text-foreground placeholder:text-muted-foreground/40 focus:border-primary focus:outline-none md:text-sm"
                  />
                  <input
                    type="text"
                    value={steelUrl}
                    onChange={(e) => {
                      setSteelUrl(e.target.value);
                      setSteelValidation({ status: 'idle', message: '' });
                    }}
                    placeholder="https://api.steel.dev"
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-base text-foreground placeholder:text-muted-foreground/40 focus:border-primary focus:outline-none md:text-sm"
                  />
                  <div className="flex items-center justify-between">
                    <Button
                      onClick={validateSteel}
                      disabled={
                        (!steelKey && !status?.envPreloaded.hasSteelKey) ||
                        steelValidation.status === 'testing'
                      }
                      variant="outline"
                      size="sm"
                      className="gap-1.5"
                    >
                      {steelValidation.status === 'testing' ? (
                        <Loader2 className="size-3.5 animate-spin" />
                      ) : null}
                      {t.test}
                    </Button>
                    {renderValidationBadge(steelValidation)}
                  </div>
                </div>
              </div>

              {/* Advanced: SIWE + RPC */}
              <details className="group mt-6 rounded-xl border border-border/50 bg-card/40">
                <summary className="flex cursor-pointer items-center gap-1.5 px-4 py-3 text-xs font-medium text-muted-foreground hover:text-foreground">
                  <ChevronDown className="size-3 transition-transform group-open:rotate-180" />
                  {t.advancedServices}
                </summary>
                <div className="space-y-6 px-4 pb-4 pt-2">
                  {/* SIWE */}
                  <div>
                    <h3 className="mb-1 text-sm font-semibold text-foreground">
                      SIWE ({t.siweLabel})
                    </h3>
                    <p className="mb-3 text-xs text-muted-foreground">
                      {t.siweDesc}
                    </p>
                    {(status?.envPreloaded.hasSiweDomain || status?.envPreloaded.hasSiweChainIds) && (
                      <div className="mb-3 flex items-center gap-2 rounded-lg bg-emerald-500/10 px-3 py-2 text-xs text-emerald-400">
                        <CheckCircle2 className="size-3.5 shrink-0" />
                        {t.detectedFromEnv}
                      </div>
                    )}
                    <div className="space-y-3">
                      <input
                        type="text"
                        value={siweDomain}
                        onChange={(e) => {
                          setSiweDomain(e.target.value);
                          setSiweValidation({ status: 'idle', message: '' });
                        }}
                        placeholder={t.siweDomainPlaceholder}
                        className="w-full rounded-lg border border-border bg-background px-3 py-2 text-base text-foreground placeholder:text-muted-foreground/40 focus:border-primary focus:outline-none md:text-sm"
                      />
                      <input
                        type="text"
                        value={siweChainIds}
                        onChange={(e) => {
                          setSiweChainIds(e.target.value);
                          setSiweValidation({ status: 'idle', message: '' });
                        }}
                        placeholder={t.siweChainIdsPlaceholder}
                        className="w-full rounded-lg border border-border bg-background px-3 py-2 text-base text-foreground placeholder:text-muted-foreground/40 focus:border-primary focus:outline-none md:text-sm"
                      />
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
                          {siweValidation.status === 'testing' ? (
                            <Loader2 className="size-3.5 animate-spin" />
                          ) : null}
                          {t.test}
                        </Button>
                        {renderValidationBadge(siweValidation)}
                      </div>
                    </div>
                  </div>

                  <div className="sidebar-gradient-sep" />

                  {/* RPC URLs */}
                  <div>
                    <h3 className="mb-1 text-sm font-semibold text-foreground">
                      {t.rpcTitle}
                    </h3>
                    <p className="mb-3 text-xs text-muted-foreground">
                      {t.rpcDesc}
                    </p>
                    {status?.envPreloaded.hasRpcUrls && (
                      <div className="mb-3 flex items-center gap-2 rounded-lg bg-emerald-500/10 px-3 py-2 text-xs text-emerald-400">
                        <CheckCircle2 className="size-3.5 shrink-0" />
                        {t.detectedFromEnv}
                      </div>
                    )}
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
                          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-base text-foreground placeholder:text-muted-foreground/40 focus:border-primary focus:outline-none md:text-sm"
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
                          placeholder="https://data-seed-prebsc-1-s1.binance.org:8545"
                          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-base text-foreground placeholder:text-muted-foreground/40 focus:border-primary focus:outline-none md:text-sm"
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-xs text-muted-foreground">opBNB (Chain 204)</label>
                        <input
                          type="text"
                          value={rpcUrl204}
                          onChange={(e) => {
                            setRpcUrl204(e.target.value);
                            setRpcValidation({ status: 'idle', message: '' });
                          }}
                          placeholder="https://opbnb-mainnet-rpc.bnbchain.org"
                          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-base text-foreground placeholder:text-muted-foreground/40 focus:border-primary focus:outline-none md:text-sm"
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
                          {rpcValidation.status === 'testing' ? (
                            <Loader2 className="size-3.5 animate-spin" />
                          ) : null}
                          {t.test}
                        </Button>
                        {renderValidationBadge(rpcValidation)}
                      </div>
                    </div>
                  </div>
                </div>
              </details>
            </div>

            {/* Navigation */}
            <div className="flex justify-between gap-3">
              <Button
                variant="ghost"
                onClick={() => setStep(0)}
                className="gap-1.5"
              >
                <ArrowLeft className="size-4" />
                {t.back}
              </Button>
              <div className="flex gap-3">
                <Button
                  variant="ghost"
                  onClick={handleComplete}
                  disabled={saving}
                  className="gap-1.5 text-muted-foreground"
                >
                  <SkipForward className="size-4" />
                  {t.skipAndFinish}
                </Button>
                <Button
                  onClick={handleComplete}
                  disabled={saving}
                  className="gap-1.5"
                >
                  {saving ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : null}
                  {t.completeSetup}
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* ── Step 2: Done ───────────────────────────── */}
        {step === 2 && (
          <div className="flex flex-col items-center gap-4 py-12 text-center animate-message-in">
            <div className="flex size-20 items-center justify-center rounded-full bg-emerald-500/10">
              <CheckCircle2 className="size-10 text-emerald-400" />
            </div>
            <h2 className="text-xl font-bold text-foreground">{t.allSet}</h2>
            <p className="text-sm text-muted-foreground">{t.allSetDesc}</p>
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── i18n strings ─────────────────────────────────────────── */

const en = {
  subtitle:
    'Welcome! Let\u2019s configure your instance before getting started.',
  stepAI: 'AI Provider',
  stepServices: 'Services',
  stepDone: 'Ready',
  aiTitle: 'AI Provider',
  aiDesc:
    'Configure the AI model that powers the security agent. Supports Anthropic Claude and OpenAI-compatible APIs.',
  aiDetectedEnv: 'AI model detected from environment variables. You can skip this step.',
  aiDetectedDb: 'AI model already configured. You can skip this step.',
  protocol: 'Provider Protocol',
  getKey: 'Get API key',
  modelId: 'Model ID',
  advanced: 'Advanced Settings',
  authMode: 'Authentication Mode',
  testConnection: 'Test Connection',
  testing: 'Testing...',
  connectionError: 'Connection failed',
  next: 'Next',
  back: 'Back',
  servicesTitle: 'External Services (Optional)',
  servicesDesc:
    'These services enhance security scanning and blockchain data. You can skip now and configure later in the admin dashboard.',
  goplusDesc:
    'Provides token security scanning, address analysis, phishing detection, and more. Free tier works without credentials but with rate limits.',
  bscscanDesc:
    'Provides transaction history, contract source code, and balance queries. One API key works for BSC and 60+ EVM chains.',
  serperDesc:
    'Provides Google Search and News results for deep token research and web intelligence.',
  steelDesc:
    'Headless browser for scraping SPA websites. Optional fallback for web search.',
  displayName: 'Display Name',
  displayNamePlaceholder: 'e.g. Claude Sonnet 4.5',
  advancedServices: 'Advanced: Wallet Login & RPC Endpoints',
  siweLabel: 'Wallet Login',
  siweDesc:
    'Configure SIWE (Sign-In with Ethereum) wallet login domain and allowed chain IDs.',
  siweDomainPlaceholder: 'Domain, e.g. app.bnbrain.dev',
  siweChainIdsPlaceholder: 'Chain IDs, e.g. 56,97,204',
  rpcTitle: 'RPC Endpoints',
  rpcDesc:
    'Custom RPC endpoints for blockchain data queries. Leave empty to use public default nodes.',
  detectedFromEnv: 'Detected from environment variables',
  test: 'Test',
  skipAndFinish: 'Skip & Finish',
  completeSetup: 'Complete Setup',
  allSet: 'All Set!',
  allSetDesc: 'BNBrain is ready. Redirecting to chat...',
};

const zh: typeof en = {
  subtitle: '欢迎！让我们先完成基本配置，然后开始使用。',
  stepAI: 'AI 服务',
  stepServices: '外部服务',
  stepDone: '完成',
  aiTitle: 'AI 服务提供商',
  aiDesc:
    '配置为安全代理提供支持的 AI 模型。支持 Anthropic Claude 和 OpenAI 兼容接口。',
  aiDetectedEnv: '已从环境变量检测到 AI 模型配置，可跳过此步骤。',
  aiDetectedDb: 'AI 模型已配置，可跳过此步骤。',
  protocol: '接口协议',
  getKey: '获取 API Key',
  modelId: '模型 ID',
  advanced: '高级设置',
  authMode: '认证方式',
  testConnection: '测试连接',
  testing: '测试中...',
  connectionError: '连接失败',
  next: '下一步',
  back: '上一步',
  servicesTitle: '外部服务（可选）',
  servicesDesc:
    '这些服务增强安全扫描和区块链数据查询能力。可以稍后在管理后台中配置。',
  goplusDesc:
    '提供代币安全扫描、地址分析、钓鱼检测等功能。免费版可不填但有频率限制。',
  bscscanDesc:
    '提供交易历史、合约源码、余额查询功能。一个 API Key 同时支持 BSC 和 60+ EVM 链。',
  serperDesc:
    '提供 Google 搜索和新闻结果，用于深度代币研究和网络情报分析。',
  steelDesc:
    '无头浏览器，用于抓取 SPA 网站。可选的网络搜索备选方案。',
  displayName: '显示名称',
  displayNamePlaceholder: '例如 Claude Sonnet 4.5',
  advancedServices: '高级配置：钱包登录与 RPC 节点',
  siweLabel: '钱包登录',
  siweDesc:
    '配置 SIWE（Sign-In with Ethereum）钱包登录的域名和允许的链 ID。',
  siweDomainPlaceholder: '域名，例如 app.bnbrain.dev',
  siweChainIdsPlaceholder: '链 ID，例如 56,97,204',
  rpcTitle: 'RPC 节点',
  rpcDesc:
    '自定义 RPC 节点地址，用于区块链数据查询。留空将使用公共默认节点。',
  detectedFromEnv: '已从环境变量检测到',
  test: '测试',
  skipAndFinish: '跳过并完成',
  completeSetup: '完成配置',
  allSet: '配置完成！',
  allSetDesc: 'BNBrain 已就绪，正在跳转到聊天...',
};
