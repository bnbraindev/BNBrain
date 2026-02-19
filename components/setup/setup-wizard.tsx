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
  Eye,
  EyeOff,
  User,
  Wallet,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useI18n } from '@/lib/i18n/context';
import { LanguageSwitcher } from '@/components/language-switcher';

/* ─── Types ────────────────────────────────────────────────── */

interface SetupStatus {
  completed: boolean;
  hasModels: boolean;
  services: {
    anthropic: { configured: boolean; fromEnv: boolean };
    goplus: { configured: boolean; fromEnv: boolean };
    bscscan: { configured: boolean; fromEnv: boolean };
    nodereal?: { configured: boolean; fromEnv: boolean };
    serper: { configured: boolean; fromEnv: boolean };
    steel: { configured: boolean; fromEnv: boolean };
  };
  envPreloaded: {
    anthropicBaseUrl: string;
    anthropicModel: string;
    hasAnthropicKey: boolean;
    hasGoplusKey: boolean;
    hasBscscanKey: boolean;
    hasNoderealKey?: boolean;
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

interface AutoConfigData {
  services?: {
    goplus?: { appKey?: string; appSecret?: string };
    bscscan?: { apiKey?: string };
    nodereal?: { apiKey?: string };
    serper?: { apiKey?: string };
    steel?: { apiKey?: string; apiUrl?: string };
    siwe?: { domain?: string; allowedChainIds?: string };
    rpc?: { url56?: string; url204?: string };
  };
  model?: {
    displayName?: string;
    protocol?: string;
    baseUrl?: string;
    providerModelId?: string;
    apiKey?: string;
    authMode?: string;
  };
}

interface SetupWizardProps {
  onComplete: () => void;
}

/* ─── Defaults ─────────────────────────────────────────────── */

const DEFAULT_BASE_URL = 'https://api.anthropic.com';
const DEFAULT_MODEL = 'claude-sonnet-4-5-20250929';

/* ─── Component ────────────────────────────────────────────── */

export function SetupWizard({ onComplete }: SetupWizardProps) {
  const { locale } = useI18n();
  const t = locale === 'zh' ? zh : en;

  const [step, setStep] = useState(0); // 0: Account, 1: AI Model, 2: Services, 3: Done
  const [status, setStatus] = useState<SetupStatus | null>(null);
  const [saving, setSaving] = useState(false);
  const [autoConfig, setAutoConfig] = useState<AutoConfigData | null>(null);
  const [autoConfigLoading, setAutoConfigLoading] = useState(false);
  const [autoConfigApplied, setAutoConfigApplied] = useState(false);

  // Step 0: Admin Account
  const [adminUsername, setAdminUsername] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [adminPasswordConfirm, setAdminPasswordConfirm] = useState('');
  const [showAdminPassword, setShowAdminPassword] = useState(false);
  const [adminWalletAddress, setAdminWalletAddress] = useState('');

  // Step 1: AI Model
  const [displayName, setDisplayName] = useState('');
  const [protocol, setProtocol] = useState<'anthropic' | 'openai'>('anthropic');
  const [apiKey, setApiKey] = useState('');
  const [baseUrl, setBaseUrl] = useState(DEFAULT_BASE_URL);
  const [model, setModel] = useState(DEFAULT_MODEL);
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
  const [noderealKey, setNoderealKey] = useState('');
  const [noderealValidation, setNoderealValidation] = useState<ValidationState>({
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
  const [rpcUrl204, setRpcUrl204] = useState('');
  const [rpcValidation, setRpcValidation] = useState<ValidationState>({
    status: 'idle',
    message: '',
  });

  // Auto-test & missing-config warning
  const [needsAutoTest, setNeedsAutoTest] = useState(false);
  const [showMissingWarning, setShowMissingWarning] = useState(false);
  const [missingWarnings, setMissingWarnings] = useState<{ label: string; critical: boolean }[]>([]);

  // Load initial status
  useEffect(() => {
    fetch('/api/setup/status')
      .then((r) => r.json())
      .then((data: SetupStatus) => {
        setStatus(data);
        if (data.envPreloaded.anthropicBaseUrl) {
          setBaseUrl(data.envPreloaded.anthropicBaseUrl);
        }
        if (data.envPreloaded.anthropicModel) {
          setModel(data.envPreloaded.anthropicModel);
        }
      })
      .catch(() => {});
  }, []);

  // Auto-config fetch
  const fetchAutoConfig = useCallback(async () => {
    setAutoConfigLoading(true);
    try {
      const res = await fetch('/api/setup/auto-config');
      if (res.ok) {
        const data = (await res.json()) as AutoConfigData;
        setAutoConfig(data);
        return data;
      }
    } catch {
      // ignore
    } finally {
      setAutoConfigLoading(false);
    }
    return null;
  }, []);

  const applyAutoConfig = useCallback(
    (data: AutoConfigData) => {
      if (autoConfigApplied) return;
      const s = data.services;
      if (s?.goplus?.appKey && !goplusKey) setGoplusKey(s.goplus.appKey);
      if (s?.goplus?.appSecret && !goplusSecret) setGoplusSecret(s.goplus.appSecret);
      if (s?.bscscan?.apiKey && !bscscanKey) setBscscanKey(s.bscscan.apiKey);
      if (s?.nodereal?.apiKey && !noderealKey) setNoderealKey(s.nodereal.apiKey);
      if (s?.serper?.apiKey && !serperKey) setSerperKey(s.serper.apiKey);
      if (s?.steel?.apiKey && !steelKey) setSteelKey(s.steel.apiKey);
      if (s?.steel?.apiUrl && !steelUrl) setSteelUrl(s.steel.apiUrl);
      if (!siweDomain) setSiweDomain(typeof window !== 'undefined' ? window.location.hostname : '');
      if (s?.siwe?.allowedChainIds && !siweChainIds) setSiweChainIds(s.siwe.allowedChainIds);
      if (s?.rpc?.url56 && !rpcUrl56) setRpcUrl56(s.rpc.url56);
      if (s?.rpc?.url204 && !rpcUrl204) setRpcUrl204(s.rpc.url204);
      const m = data.model;
      if (m?.apiKey && !apiKey) setApiKey(m.apiKey);
      if (m?.baseUrl && (baseUrl === DEFAULT_BASE_URL || !baseUrl)) setBaseUrl(m.baseUrl);
      if (m?.providerModelId && (model === DEFAULT_MODEL || !model)) setModel(m.providerModelId);
      if (m?.displayName && !displayName) setDisplayName(m.displayName);
      if (m?.protocol === 'openai' || m?.protocol === 'anthropic') setProtocol(m.protocol);
      if (m?.authMode === 'bearer') setAuthMode('bearer');
      setAutoConfigApplied(true);
      setNeedsAutoTest(true);
    },
    [
      autoConfigApplied,
      goplusKey, goplusSecret, bscscanKey, noderealKey, serperKey,
      steelKey, steelUrl, siweDomain, siweChainIds, rpcUrl56, rpcUrl204,
      apiKey, baseUrl, model, displayName,
    ]
  );

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
        body: JSON.stringify({ service: 'bscscan', config: { apiKey: bscscanKey } }),
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

  const validateNodereal = useCallback(async () => {
    setNoderealValidation({ status: 'testing', message: t.testing });
    try {
      const res = await fetch('/api/setup/validate', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ service: 'nodereal', config: { apiKey: noderealKey } }),
      });
      const data = await res.json();
      setNoderealValidation({
        status: data.valid ? 'success' : 'error',
        message: data.message,
        latencyMs: data.latencyMs,
      });
    } catch {
      setNoderealValidation({ status: 'error', message: t.connectionError });
    }
  }, [noderealKey, t]);

  const validateSerper = useCallback(async () => {
    setSerperValidation({ status: 'testing', message: t.testing });
    try {
      const res = await fetch('/api/setup/validate', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ service: 'serper', config: { apiKey: serperKey } }),
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
          config: { url56: rpcUrl56 || undefined, url204: rpcUrl204 || undefined },
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
  }, [rpcUrl56, rpcUrl204, t]);

  // ── Auto-test after auto-config ───────────────────────────
  useEffect(() => {
    if (!needsAutoTest) return;
    setNeedsAutoTest(false);
    if (apiKey && baseUrl && model && !status?.hasModels) validateModel();
    if (goplusKey && goplusSecret) validateGoPlus();
    if (bscscanKey) validateBscScan();
    if (noderealKey) validateNodereal();
    if (serperKey) validateSerper();
    if (steelKey) validateSteel();
    if (siweDomain || siweChainIds) validateSiwe();
    if (rpcUrl56 || rpcUrl204) validateRpc();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [needsAutoTest]);

  // ── Save & Complete ─────────────────────────────────────

  const handleComplete = useCallback(async () => {
    setSaving(true);
    try {
      // 1. Create admin credential
      const credRes = await fetch('/api/admin/credentials', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          username: adminUsername.trim(),
          password: adminPassword,
        }),
      });
      const credData = await credRes.json();
      if (!credRes.ok) {
        alert(credData.error || 'Failed to create admin account');
        setSaving(false);
        return;
      }

      // 2. Save model + services + adminWallet
      const payload: Record<string, unknown> = {
        services: {} as Record<string, unknown>,
      };

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

      // Admin wallet
      const walletTrimmed = adminWalletAddress.trim();
      if (walletTrimmed && /^0x[0-9a-fA-F]{40}$/.test(walletTrimmed)) {
        payload.adminWallet = walletTrimmed;
      }

      const services = payload.services as Record<string, unknown>;
      if (goplusKey && goplusSecret) {
        services.goplus = { appKey: goplusKey, appSecret: goplusSecret };
      }
      if (bscscanKey) {
        services.bscscan = { apiKey: bscscanKey };
      }
      if (noderealKey) {
        services.nodereal = { apiKey: noderealKey };
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
      if (rpcUrl56 || rpcUrl204) {
        services.rpc = {
          url56: rpcUrl56 || undefined,
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
        // Auto-login with the credential just created
        await fetch('/api/auth/password/login', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            username: adminUsername.trim(),
            password: adminPassword,
          }),
        });
        setStep(3);
        setTimeout(onComplete, 2500);
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
    adminUsername,
    adminPassword,
    adminWalletAddress,
    displayName,
    protocol,
    baseUrl,
    model,
    apiKey,
    authMode,
    goplusKey,
    goplusSecret,
    bscscanKey,
    noderealKey,
    serperKey,
    steelKey,
    steelUrl,
    siweDomain,
    siweChainIds,
    rpcUrl56,
    rpcUrl204,
    onComplete,
  ]);

  const handleCompleteClick = useCallback(() => {
    const warnings: { label: string; critical: boolean }[] = [];

    if (!status?.hasModels && modelValidation.status !== 'success') {
      warnings.push({ label: t.warningAI, critical: true });
    }
    if ((!goplusKey || !goplusSecret) && !status?.envPreloaded.hasGoplusKey) {
      warnings.push({ label: t.warningGoPlus, critical: false });
    }
    if (!bscscanKey && !status?.envPreloaded.hasBscscanKey) {
      warnings.push({ label: t.warningBscScan, critical: false });
    }
    if (!noderealKey && !status?.envPreloaded.hasNoderealKey) {
      warnings.push({ label: t.warningNodeReal, critical: false });
    }
    if (!serperKey && !status?.envPreloaded.hasSerperKey) {
      warnings.push({ label: t.warningSerper, critical: false });
    }
    if (!steelKey && !status?.envPreloaded.hasSteelKey) {
      warnings.push({ label: t.warningSteel, critical: false });
    }

    if (warnings.length > 0) {
      setMissingWarnings(warnings);
      setShowMissingWarning(true);
    } else {
      handleComplete();
    }
  }, [
    status, modelValidation, goplusKey, goplusSecret, bscscanKey,
    noderealKey, serperKey, steelKey, t, handleComplete,
  ]);

  // ── Render helpers ──────────────────────────────────────

  const usernameValid = adminUsername.trim().length >= 2;
  const passwordValid = adminPassword.length >= 8;
  const passwordMatch = adminPassword === adminPasswordConfirm;
  const walletValid =
    !adminWalletAddress.trim() || /^0x[0-9a-fA-F]{40}$/.test(adminWalletAddress.trim());
  const canProceedFromStep0 = usernameValid && passwordValid && passwordMatch && walletValid;

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

  const renderPreConfigBadge = (key: string) => {
    if (!autoConfig?.services) return null;
    const s = autoConfig.services as Record<string, unknown>;
    if (!s[key]) return null;
    return (
      <span className="ml-2 inline-flex items-center rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
        Pre-configured
      </span>
    );
  };

  // ── Step indicators ─────────────────────────────────────

  const steps = [
    { label: t.stepAccount, done: step > 0 },
    { label: t.stepAI, done: step > 1 },
    { label: t.stepServices, done: step > 2 },
    { label: t.stepDone, done: step === 3 },
  ];

  // ── UI ──────────────────────────────────────────────────

  return (
    <div className="flex h-[100dvh] flex-col items-center justify-start overflow-y-auto bg-background px-4 py-4 sm:py-6">
      {/* Header */}
      <div className="mb-4 flex w-full max-w-xl items-start justify-between">
        <div className="flex flex-col items-center gap-2 text-center flex-1 animate-hero-entrance">
          <div className="relative flex size-10 items-center justify-center rounded-xl bg-primary/10 animate-shield-glow">
            <Shield className="size-5 text-primary" />
          </div>
          <h1 className="text-xl font-bold text-foreground">
            BNBrain
          </h1>
          <p className="max-w-md text-xs text-muted-foreground">
            {t.subtitle}
          </p>
        </div>
        <div className="ml-2 shrink-0 pt-1">
          <LanguageSwitcher />
        </div>
      </div>

      {/* Step indicator */}
      <div className="mb-4 flex items-center gap-2 sm:gap-3">
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
        {/* ── Step 0: Admin Account ───────────────────── */}
        {step === 0 && (
          <div className="space-y-6 animate-message-in">
            <div className="rounded-2xl border border-border bg-card/80 p-5 shadow-lg backdrop-blur-lg sm:p-6">
              <h2 className="mb-1 flex items-center gap-2 text-lg font-semibold text-foreground">
                <User className="size-5 text-primary" />
                {t.accountTitle}
              </h2>
              <p className="mb-5 text-sm text-muted-foreground">
                {t.accountDesc}
              </p>

              <div className="space-y-4">
                {/* Username */}
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
                    {t.username} <span className="text-red-400">*</span>
                  </label>
                  <input
                    type="text"
                    value={adminUsername}
                    onChange={(e) => setAdminUsername(e.target.value)}
                    placeholder={t.usernamePlaceholder}
                    className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-base text-foreground placeholder:text-muted-foreground/40 focus:border-primary focus:outline-none md:text-sm"
                    autoComplete="username"
                  />
                  {adminUsername.trim() && !usernameValid && (
                    <p className="mt-1 text-xs text-red-400">{t.usernameMinLength}</p>
                  )}
                </div>

                {/* Password */}
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
                    {t.password} <span className="text-red-400">*</span>
                  </label>
                  <div className="relative">
                    <input
                      type={showAdminPassword ? 'text' : 'password'}
                      value={adminPassword}
                      onChange={(e) => setAdminPassword(e.target.value)}
                      placeholder={t.passwordPlaceholder}
                      className="w-full rounded-lg border border-border bg-background px-3 py-2.5 pr-10 text-base text-foreground placeholder:text-muted-foreground/40 focus:border-primary focus:outline-none md:text-sm"
                      autoComplete="new-password"
                    />
                    <button
                      type="button"
                      onClick={() => setShowAdminPassword(!showAdminPassword)}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    >
                      {showAdminPassword ? (
                        <EyeOff className="size-4" />
                      ) : (
                        <Eye className="size-4" />
                      )}
                    </button>
                  </div>
                  {adminPassword && !passwordValid && (
                    <p className="mt-1 text-xs text-red-400">{t.passwordMinLength}</p>
                  )}
                </div>

                {/* Confirm Password */}
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
                    {t.confirmPassword} <span className="text-red-400">*</span>
                  </label>
                  <input
                    type="password"
                    value={adminPasswordConfirm}
                    onChange={(e) => setAdminPasswordConfirm(e.target.value)}
                    placeholder={t.confirmPasswordPlaceholder}
                    className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-base text-foreground placeholder:text-muted-foreground/40 focus:border-primary focus:outline-none md:text-sm"
                    autoComplete="new-password"
                  />
                  {adminPasswordConfirm && !passwordMatch && (
                    <p className="mt-1 text-xs text-red-400">{t.passwordMismatch}</p>
                  )}
                </div>

                <div className="sidebar-gradient-sep" />

                {/* Admin Wallet Address (optional) */}
                <div>
                  <label className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                    <Wallet className="size-3.5" />
                    {t.adminWallet}
                    <span className="text-muted-foreground/60">({t.optional})</span>
                  </label>
                  <input
                    type="text"
                    value={adminWalletAddress}
                    onChange={(e) => setAdminWalletAddress(e.target.value)}
                    placeholder="0x..."
                    className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-base font-mono text-foreground placeholder:text-muted-foreground/40 focus:border-primary focus:outline-none md:text-sm"
                  />
                  {adminWalletAddress.trim() && !walletValid && (
                    <p className="mt-1 text-xs text-red-400">{t.walletInvalid}</p>
                  )}
                  <p className="mt-1.5 text-xs text-muted-foreground/60">
                    {t.walletHint}
                  </p>
                </div>
              </div>
            </div>

            {/* Navigation */}
            <div className="flex justify-end gap-3">
              <Button
                onClick={() => {
                  setStep(1);
                  // Trigger auto-config fetch on entering step 1
                  if (!autoConfig && !autoConfigLoading) {
                    fetchAutoConfig().then((data) => {
                      if (data) applyAutoConfig(data);
                    });
                  }
                }}
                disabled={!canProceedFromStep0}
                className="gap-1.5"
              >
                {t.next}
                <ArrowRight className="size-4" />
              </Button>
            </div>
          </div>
        )}

        {/* ── Step 1: AI Model ────────────────────────── */}
        {step === 1 && (
          <div className="space-y-4 animate-message-in">
            {/* Auto-config banner */}
            {autoConfigLoading && (
              <div className="flex items-center gap-2 rounded-xl border border-primary/20 bg-primary/5 px-3 py-2 text-sm text-primary">
                <Loader2 className="size-4 animate-spin" />
                {t.autoConfigLoading}
              </div>
            )}
            {autoConfig && !autoConfigLoading && (
              <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 px-3 py-2">
                <div className="flex items-center gap-2 text-sm text-emerald-400">
                  <CheckCircle2 className="size-4 shrink-0" />
                  {t.autoConfigApplied}
                </div>
                <p className="mt-1 pl-6 text-xs text-emerald-400/70">{t.autoConfigNote}</p>
              </div>
            )}

            {/* AI Model Card */}
            <div className="rounded-2xl border border-border bg-card/80 p-4 shadow-lg backdrop-blur-lg sm:p-5">
              <h2 className="mb-1 text-lg font-semibold text-foreground">
                {t.aiTitle}
              </h2>
              <p className="mb-4 text-sm text-muted-foreground">
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
                  {status.envPreloaded.hasAnthropicKey ? t.aiDetectedEnv : t.aiDetectedDb}
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
                        placeholder={protocol === 'anthropic' ? 'sk-ant-...' : 'sk-...'}
                        className="w-full rounded-lg border border-border bg-background px-3 py-2.5 pr-10 text-base text-foreground placeholder:text-muted-foreground/40 focus:border-primary focus:outline-none md:text-sm"
                      />
                      <button
                        type="button"
                        onClick={() => setShowApiKey(!showApiKey)}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      >
                        {showApiKey ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
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
                      disabled={!apiKey || !baseUrl || !model || modelValidation.status === 'testing'}
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
            <div className="flex justify-between gap-3">
              <Button variant="ghost" onClick={() => setStep(0)} className="gap-1.5">
                <ArrowLeft className="size-4" />
                {t.back}
              </Button>
              <Button
                onClick={() => setStep(2)}
                className="gap-1.5"
              >
                {t.next}
                <ArrowRight className="size-4" />
              </Button>
            </div>
          </div>
        )}

        {/* ── Step 2: Services ────────────────────────── */}
        {step === 2 && (
          <div className="space-y-4 animate-message-in">
            {/* Services Card */}
            <div className="rounded-2xl border border-border bg-card/80 p-4 shadow-lg backdrop-blur-lg sm:p-5">
              <h2 className="mb-1 text-lg font-semibold text-foreground">
                {t.servicesTitle}
              </h2>
              <p className="mb-3 text-sm text-muted-foreground">
                {t.servicesDesc}
              </p>

              {/* GoPlus */}
              <div className="mb-4">
                <div className="mb-2 flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-foreground">
                    GoPlus Security{renderPreConfigBadge('goplus')}
                  </h3>
                  <a href="https://gopluslabs.io/" target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-xs text-primary hover:underline">
                    {t.getKey}<ExternalLink className="size-3" />
                  </a>
                </div>
                {status?.envPreloaded.hasGoplusKey && (
                  <div className="mb-2 flex items-center gap-2 rounded-lg bg-emerald-500/10 px-3 py-1.5 text-xs text-emerald-400">
                    <CheckCircle2 className="size-3.5 shrink-0" />{t.detectedFromEnv}
                  </div>
                )}
                <div className="space-y-2">
                  <input type="text" value={goplusKey} onChange={(e) => { setGoplusKey(e.target.value); setGoplusValidation({ status: 'idle', message: '' }); }} placeholder="App Key" className="w-full rounded-lg border border-border bg-background px-3 py-2 text-base text-foreground placeholder:text-muted-foreground/40 focus:border-primary focus:outline-none md:text-sm" />
                  <input type="password" value={goplusSecret} onChange={(e) => { setGoplusSecret(e.target.value); setGoplusValidation({ status: 'idle', message: '' }); }} placeholder="App Secret" className="w-full rounded-lg border border-border bg-background px-3 py-2 text-base text-foreground placeholder:text-muted-foreground/40 focus:border-primary focus:outline-none md:text-sm" />
                  <div className="flex items-center justify-between">
                    <Button onClick={validateGoPlus} disabled={((!goplusKey || !goplusSecret) && !status?.envPreloaded.hasGoplusKey) || goplusValidation.status === 'testing'} variant="outline" size="sm" className="gap-1.5">
                      {goplusValidation.status === 'testing' ? <Loader2 className="size-3.5 animate-spin" /> : null}{t.test}
                    </Button>
                    {renderValidationBadge(goplusValidation)}
                  </div>
                </div>
              </div>

              <div className="sidebar-gradient-sep mb-4" />

              {/* BscScan */}
              <div className="mb-4">
                <div className="mb-2 flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-foreground">BscScan / Etherscan{renderPreConfigBadge('bscscan')}</h3>
                  <a href="https://etherscan.io/myapikey" target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-xs text-primary hover:underline">{t.getKey}<ExternalLink className="size-3" /></a>
                </div>
                {status?.envPreloaded.hasBscscanKey && (
                  <div className="mb-2 flex items-center gap-2 rounded-lg bg-emerald-500/10 px-3 py-1.5 text-xs text-emerald-400"><CheckCircle2 className="size-3.5 shrink-0" />{t.detectedFromEnv}</div>
                )}
                <div className="space-y-2">
                  <input type="text" value={bscscanKey} onChange={(e) => { setBscscanKey(e.target.value); setBscscanValidation({ status: 'idle', message: '' }); }} placeholder="API Key" className="w-full rounded-lg border border-border bg-background px-3 py-2 text-base text-foreground placeholder:text-muted-foreground/40 focus:border-primary focus:outline-none md:text-sm" />
                  <div className="flex items-center justify-between">
                    <Button onClick={validateBscScan} disabled={(!bscscanKey && !status?.envPreloaded.hasBscscanKey) || bscscanValidation.status === 'testing'} variant="outline" size="sm" className="gap-1.5">
                      {bscscanValidation.status === 'testing' ? <Loader2 className="size-3.5 animate-spin" /> : null}{t.test}
                    </Button>
                    {renderValidationBadge(bscscanValidation)}
                  </div>
                </div>
              </div>

              <div className="sidebar-gradient-sep mb-4" />

              {/* NodeReal */}
              <div className="mb-4">
                <div className="mb-2 flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-foreground">NodeReal (BSC Enhanced){renderPreConfigBadge('nodereal')}</h3>
                  <a href="https://nodereal.io/meganode" target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-xs text-primary hover:underline">{t.getKey}<ExternalLink className="size-3" /></a>
                </div>
                {status?.envPreloaded.hasNoderealKey && (
                  <div className="mb-2 flex items-center gap-2 rounded-lg bg-emerald-500/10 px-3 py-1.5 text-xs text-emerald-400"><CheckCircle2 className="size-3.5 shrink-0" />{t.detectedFromEnv}</div>
                )}
                <div className="space-y-2">
                  <input type="text" value={noderealKey} onChange={(e) => { setNoderealKey(e.target.value); setNoderealValidation({ status: 'idle', message: '' }); }} placeholder="API Key" className="w-full rounded-lg border border-border bg-background px-3 py-2 text-base text-foreground placeholder:text-muted-foreground/40 focus:border-primary focus:outline-none md:text-sm" />
                  <div className="flex items-center justify-between">
                    <Button onClick={validateNodereal} disabled={(!noderealKey && !status?.envPreloaded.hasNoderealKey) || noderealValidation.status === 'testing'} variant="outline" size="sm" className="gap-1.5">
                      {noderealValidation.status === 'testing' ? <Loader2 className="size-3.5 animate-spin" /> : null}{t.test}
                    </Button>
                    {renderValidationBadge(noderealValidation)}
                  </div>
                </div>
              </div>

              <div className="sidebar-gradient-sep mb-4" />

              {/* Serper */}
              <div className="mb-4">
                <div className="mb-2 flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-foreground">Serper (Google Search){renderPreConfigBadge('serper')}</h3>
                  <a href="https://serper.dev/" target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-xs text-primary hover:underline">{t.getKey}<ExternalLink className="size-3" /></a>
                </div>
                {status?.envPreloaded.hasSerperKey && (
                  <div className="mb-2 flex items-center gap-2 rounded-lg bg-emerald-500/10 px-3 py-1.5 text-xs text-emerald-400"><CheckCircle2 className="size-3.5 shrink-0" />{t.detectedFromEnv}</div>
                )}
                <div className="space-y-2">
                  <input type="password" value={serperKey} onChange={(e) => { setSerperKey(e.target.value); setSerperValidation({ status: 'idle', message: '' }); }} placeholder="API Key" className="w-full rounded-lg border border-border bg-background px-3 py-2 text-base text-foreground placeholder:text-muted-foreground/40 focus:border-primary focus:outline-none md:text-sm" />
                  <div className="flex items-center justify-between">
                    <Button onClick={validateSerper} disabled={(!serperKey && !status?.envPreloaded.hasSerperKey) || serperValidation.status === 'testing'} variant="outline" size="sm" className="gap-1.5">
                      {serperValidation.status === 'testing' ? <Loader2 className="size-3.5 animate-spin" /> : null}{t.test}
                    </Button>
                    {renderValidationBadge(serperValidation)}
                  </div>
                </div>
              </div>

              <div className="sidebar-gradient-sep mb-4" />

              {/* Steel */}
              <div>
                <div className="mb-2 flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-foreground">Steel (Web Scraper){renderPreConfigBadge('steel')}</h3>
                  <a href="https://steel.dev/" target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-xs text-primary hover:underline">{t.getKey}<ExternalLink className="size-3" /></a>
                </div>
                {status?.envPreloaded.hasSteelKey && (
                  <div className="mb-2 flex items-center gap-2 rounded-lg bg-emerald-500/10 px-3 py-1.5 text-xs text-emerald-400"><CheckCircle2 className="size-3.5 shrink-0" />{t.detectedFromEnv}</div>
                )}
                <div className="space-y-2">
                  <input type="password" value={steelKey} onChange={(e) => { setSteelKey(e.target.value); setSteelValidation({ status: 'idle', message: '' }); }} placeholder="API Key" className="w-full rounded-lg border border-border bg-background px-3 py-2 text-base text-foreground placeholder:text-muted-foreground/40 focus:border-primary focus:outline-none md:text-sm" />
                  <input type="text" value={steelUrl} onChange={(e) => { setSteelUrl(e.target.value); setSteelValidation({ status: 'idle', message: '' }); }} placeholder="https://api.steel.dev" className="w-full rounded-lg border border-border bg-background px-3 py-2 text-base text-foreground placeholder:text-muted-foreground/40 focus:border-primary focus:outline-none md:text-sm" />
                  <div className="flex items-center justify-between">
                    <Button onClick={validateSteel} disabled={(!steelKey && !status?.envPreloaded.hasSteelKey) || steelValidation.status === 'testing'} variant="outline" size="sm" className="gap-1.5">
                      {steelValidation.status === 'testing' ? <Loader2 className="size-3.5 animate-spin" /> : null}{t.test}
                    </Button>
                    {renderValidationBadge(steelValidation)}
                  </div>
                </div>
              </div>

              {/* Advanced: SIWE + RPC */}
              <details className="group mt-4 rounded-xl border border-border/50 bg-card/40">
                <summary className="flex cursor-pointer items-center gap-1.5 px-4 py-2.5 text-xs font-medium text-muted-foreground hover:text-foreground">
                  <ChevronDown className="size-3 transition-transform group-open:rotate-180" />
                  {t.advancedServices}
                </summary>
                <div className="space-y-4 px-4 pb-4 pt-2">
                  {/* SIWE */}
                  <div>
                    <h3 className="mb-1 text-sm font-semibold text-foreground">SIWE ({t.siweLabel})</h3>
                    <p className="mb-2 text-xs text-muted-foreground">{t.siweDesc}</p>
                    {(status?.envPreloaded.hasSiweDomain || status?.envPreloaded.hasSiweChainIds) && (
                      <div className="mb-2 flex items-center gap-2 rounded-lg bg-emerald-500/10 px-3 py-1.5 text-xs text-emerald-400"><CheckCircle2 className="size-3.5 shrink-0" />{t.detectedFromEnv}</div>
                    )}
                    <div className="space-y-2">
                      <input type="text" value={siweDomain} onChange={(e) => { setSiweDomain(e.target.value); setSiweValidation({ status: 'idle', message: '' }); }} placeholder={t.siweDomainPlaceholder} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-base text-foreground placeholder:text-muted-foreground/40 focus:border-primary focus:outline-none md:text-sm" />
                      <input type="text" value={siweChainIds} onChange={(e) => { setSiweChainIds(e.target.value); setSiweValidation({ status: 'idle', message: '' }); }} placeholder={t.siweChainIdsPlaceholder} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-base text-foreground placeholder:text-muted-foreground/40 focus:border-primary focus:outline-none md:text-sm" />
                      <div className="flex items-center justify-between">
                        <Button onClick={validateSiwe} disabled={(!siweDomain && !siweChainIds) || siweValidation.status === 'testing'} variant="outline" size="sm" className="gap-1.5">
                          {siweValidation.status === 'testing' ? <Loader2 className="size-3.5 animate-spin" /> : null}{t.test}
                        </Button>
                        {renderValidationBadge(siweValidation)}
                      </div>
                    </div>
                  </div>

                  <div className="sidebar-gradient-sep" />

                  {/* RPC URLs */}
                  <div>
                    <h3 className="mb-1 text-sm font-semibold text-foreground">{t.rpcTitle}</h3>
                    <p className="mb-2 text-xs text-muted-foreground">{t.rpcDesc}</p>
                    {status?.envPreloaded.hasRpcUrls && (
                      <div className="mb-2 flex items-center gap-2 rounded-lg bg-emerald-500/10 px-3 py-1.5 text-xs text-emerald-400"><CheckCircle2 className="size-3.5 shrink-0" />{t.detectedFromEnv}</div>
                    )}
                    <div className="space-y-2">
                      <div>
                        <label className="mb-1 block text-xs text-muted-foreground">BSC Mainnet (Chain 56)</label>
                        <input type="text" value={rpcUrl56} onChange={(e) => { setRpcUrl56(e.target.value); setRpcValidation({ status: 'idle', message: '' }); }} placeholder="https://bsc-dataseed.binance.org" className="w-full rounded-lg border border-border bg-background px-3 py-2 text-base text-foreground placeholder:text-muted-foreground/40 focus:border-primary focus:outline-none md:text-sm" />
                      </div>
                      <div>
                        <label className="mb-1 block text-xs text-muted-foreground">opBNB (Chain 204)</label>
                        <input type="text" value={rpcUrl204} onChange={(e) => { setRpcUrl204(e.target.value); setRpcValidation({ status: 'idle', message: '' }); }} placeholder="https://opbnb-mainnet-rpc.bnbchain.org" className="w-full rounded-lg border border-border bg-background px-3 py-2 text-base text-foreground placeholder:text-muted-foreground/40 focus:border-primary focus:outline-none md:text-sm" />
                      </div>
                      <div className="flex items-center justify-between">
                        <Button onClick={validateRpc} disabled={(!rpcUrl56 && !rpcUrl204) || rpcValidation.status === 'testing'} variant="outline" size="sm" className="gap-1.5">
                          {rpcValidation.status === 'testing' ? <Loader2 className="size-3.5 animate-spin" /> : null}{t.test}
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
              <Button variant="ghost" onClick={() => setStep(1)} className="gap-1.5">
                <ArrowLeft className="size-4" />
                {t.back}
              </Button>
              <Button
                onClick={handleCompleteClick}
                disabled={saving}
                className="gap-1.5"
              >
                {saving ? <Loader2 className="size-4 animate-spin" /> : null}
                {t.completeSetup}
              </Button>
            </div>
          </div>
        )}

        {/* ── Step 3: Done ───────────────────────────── */}
        {step === 3 && (
          <div className="flex flex-col items-center gap-4 py-12 text-center animate-message-in">
            <div className="flex size-20 items-center justify-center rounded-full bg-emerald-500/10">
              <CheckCircle2 className="size-10 text-emerald-400" />
            </div>
            <h2 className="text-xl font-bold text-foreground">{t.allSet}</h2>
            <p className="text-sm text-muted-foreground">{t.allSetDesc}</p>

            {/* Wallet login hint */}
            <div className="mt-4 w-full max-w-sm space-y-2 rounded-xl border border-border bg-card/80 p-4 text-left">
              <p className="text-sm text-foreground">{t.walletLoginHint}</p>
              <p className="text-xs text-muted-foreground">{t.walletLoginHintDetail}</p>
              {adminWalletAddress.trim() && /^0x[0-9a-fA-F]{40}$/.test(adminWalletAddress.trim()) && (
                <p className="flex items-center gap-1.5 text-xs text-emerald-400">
                  <CheckCircle2 className="size-3.5" />
                  {t.walletConfigured}
                </p>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Missing config warning dialog */}
      {showMissingWarning && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm animate-message-in">
          <div className="mx-4 w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-2xl">
            <h3 className="mb-2 text-lg font-semibold text-foreground">{t.warningTitle}</h3>
            <p className="mb-4 text-sm text-muted-foreground">{t.warningDesc}</p>
            <ul className="mb-5 space-y-2">
              {missingWarnings.map((w, i) => (
                <li key={i} className={cn(
                  'flex items-start gap-2 text-sm',
                  w.critical ? 'text-red-400' : 'text-amber-400'
                )}>
                  <XCircle className="mt-0.5 size-4 shrink-0" />
                  <span>{w.label}</span>
                </li>
              ))}
            </ul>
            <div className="flex justify-end gap-3">
              <Button variant="ghost" onClick={() => setShowMissingWarning(false)}>
                {t.warningCancel}
              </Button>
              <Button onClick={() => { setShowMissingWarning(false); handleComplete(); }}>
                {t.warningConfirm}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── i18n strings ─────────────────────────────────────────── */

const en = {
  subtitle: 'Welcome! Let\u2019s configure your instance before getting started.',
  stepAccount: 'Admin Account',
  stepAI: 'AI Model',
  stepServices: 'Services',
  stepDone: 'Ready',
  accountTitle: 'Admin Account',
  accountDesc: 'Create an administrator account for managing BNBrain. You can optionally add an admin wallet address for wallet-based login.',
  username: 'Username',
  usernamePlaceholder: 'e.g. admin',
  usernameMinLength: 'Username must be at least 2 characters',
  password: 'Password',
  passwordPlaceholder: 'At least 8 characters',
  passwordMinLength: 'Password must be at least 8 characters',
  confirmPassword: 'Confirm Password',
  confirmPasswordPlaceholder: 'Re-enter password',
  passwordMismatch: 'Passwords do not match',
  adminWallet: 'Admin Wallet Address',
  optional: 'optional',
  walletInvalid: 'Invalid wallet address format (0x + 40 hex characters)',
  walletHint: 'Add a wallet address to enable wallet-based admin login. You can also add this later in the admin dashboard.',
  aiTitle: 'AI Provider',
  aiDesc: 'Configure the AI model that powers the security agent. Supports Anthropic Claude and OpenAI-compatible APIs.',
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
  servicesDesc: 'These services enhance security scanning and blockchain data. You can skip now and configure later.',
  goplusDesc: 'Provides token security scanning, address analysis, phishing detection, and more.',
  bscscanDesc: 'Provides transaction history, contract source code, and balance queries.',
  noderealDesc: 'Free BSC enhanced API (100M CU/month). BscScan alternative.',
  serperDesc: 'Google Search and News results for deep token research.',
  steelDesc: 'Headless browser for scraping SPA websites.',
  displayName: 'Display Name',
  displayNamePlaceholder: 'e.g. Claude Sonnet 4.5',
  advancedServices: 'Advanced: Wallet Login & RPC Endpoints',
  siweLabel: 'Wallet Login',
  siweDesc: 'Configure SIWE wallet login domain and allowed chain IDs.',
  siweDomainPlaceholder: 'Domain, e.g. your-domain.com',
  siweChainIdsPlaceholder: 'Chain IDs, e.g. 56,204',
  rpcTitle: 'RPC Endpoints',
  rpcDesc: 'Custom RPC endpoints. Leave empty to use public default nodes.',
  detectedFromEnv: 'Detected from environment variables',
  test: 'Test',
  completeSetup: 'Complete Setup',
  allSet: 'All Set!',
  allSetDesc: 'BNBrain is ready. Redirecting to chat...',
  autoConfigLoading: 'Loading pre-configured settings...',
  autoConfigApplied: 'Pre-configured settings applied. Review and adjust as needed.',
  autoConfigNote: 'These are free testing credentials with limited quota. You can update them later in the admin dashboard.',
  walletLoginHint: 'BNBrain supports wallet-based admin login.',
  walletLoginHintDetail: 'Go to Admin Dashboard \u2192 Admin Wallets to add admin wallet addresses and enable wallet login.',
  walletConfigured: 'Admin wallet configured',
  warningTitle: 'Missing Configuration',
  warningDesc: 'The following services are not configured. You can add them later in the admin dashboard.',
  warningAI: 'AI Model \u2014 Security analysis agent will not function without an AI model.',
  warningGoPlus: 'GoPlus \u2014 Token security scanning and address risk analysis will be unavailable.',
  warningBscScan: 'BscScan \u2014 Transaction history and contract verification will be unavailable.',
  warningNodeReal: 'NodeReal \u2014 BSC enhanced API will be unavailable.',
  warningSerper: 'Serper \u2014 Web search for deep token research will be unavailable.',
  warningSteel: 'Steel \u2014 Website scraping for DApp analysis will be unavailable.',
  warningCancel: 'Go Back',
  warningConfirm: 'Continue Anyway',
};

const zh: typeof en = {
  subtitle: '\u6b22\u8fce\uff01\u8ba9\u6211\u4eec\u5148\u5b8c\u6210\u57fa\u672c\u914d\u7f6e\uff0c\u7136\u540e\u5f00\u59cb\u4f7f\u7528\u3002',
  stepAccount: '\u7ba1\u7406\u8d26\u6237',
  stepAI: 'AI \u6a21\u578b',
  stepServices: '\u670d\u52a1',
  stepDone: '\u5b8c\u6210',
  accountTitle: '\u7ba1\u7406\u5458\u8d26\u6237',
  accountDesc: '\u521b\u5efa\u7ba1\u7406\u5458\u8d26\u6237\u7528\u4e8e\u7ba1\u7406 BNBrain\u3002\u53ef\u9009\u586b\u7ba1\u7406\u5458\u94b1\u5305\u5730\u5740\u4ee5\u542f\u7528\u94b1\u5305\u767b\u5f55\u3002',
  username: '\u7528\u6237\u540d',
  usernamePlaceholder: '\u4f8b\u5982 admin',
  usernameMinLength: '\u7528\u6237\u540d\u81f3\u5c11 2 \u4e2a\u5b57\u7b26',
  password: '\u5bc6\u7801',
  passwordPlaceholder: '\u81f3\u5c11 8 \u4e2a\u5b57\u7b26',
  passwordMinLength: '\u5bc6\u7801\u81f3\u5c11 8 \u4e2a\u5b57\u7b26',
  confirmPassword: '\u786e\u8ba4\u5bc6\u7801',
  confirmPasswordPlaceholder: '\u518d\u6b21\u8f93\u5165\u5bc6\u7801',
  passwordMismatch: '\u4e24\u6b21\u5bc6\u7801\u4e0d\u4e00\u81f4',
  adminWallet: '\u7ba1\u7406\u5458\u94b1\u5305\u5730\u5740',
  optional: '\u53ef\u9009',
  walletInvalid: '\u94b1\u5305\u5730\u5740\u683c\u5f0f\u65e0\u6548\uff080x + 40 \u4f4d\u5341\u516d\u8fdb\u5236\u5b57\u7b26\uff09',
  walletHint: '\u6dfb\u52a0\u94b1\u5305\u5730\u5740\u53ef\u542f\u7528\u94b1\u5305\u767b\u5f55\u7ba1\u7406\u540e\u53f0\u3002\u4e5f\u53ef\u4ee5\u7a0d\u540e\u5728\u7ba1\u7406\u540e\u53f0\u4e2d\u6dfb\u52a0\u3002',
  aiTitle: 'AI \u670d\u52a1\u63d0\u4f9b\u5546',
  aiDesc: '\u914d\u7f6e\u4e3a\u5b89\u5168\u4ee3\u7406\u63d0\u4f9b\u652f\u6301\u7684 AI \u6a21\u578b\u3002\u652f\u6301 Anthropic Claude \u548c OpenAI \u517c\u5bb9\u63a5\u53e3\u3002',
  aiDetectedEnv: '\u5df2\u4ece\u73af\u5883\u53d8\u91cf\u68c0\u6d4b\u5230 AI \u6a21\u578b\u914d\u7f6e\uff0c\u53ef\u8df3\u8fc7\u6b64\u6b65\u9aa4\u3002',
  aiDetectedDb: 'AI \u6a21\u578b\u5df2\u914d\u7f6e\uff0c\u53ef\u8df3\u8fc7\u6b64\u6b65\u9aa4\u3002',
  protocol: '\u63a5\u53e3\u534f\u8bae',
  getKey: '\u83b7\u53d6 API Key',
  modelId: '\u6a21\u578b ID',
  advanced: '\u9ad8\u7ea7\u8bbe\u7f6e',
  authMode: '\u8ba4\u8bc1\u65b9\u5f0f',
  testConnection: '\u6d4b\u8bd5\u8fde\u63a5',
  testing: '\u6d4b\u8bd5\u4e2d...',
  connectionError: '\u8fde\u63a5\u5931\u8d25',
  next: '\u4e0b\u4e00\u6b65',
  back: '\u4e0a\u4e00\u6b65',
  servicesTitle: '\u5916\u90e8\u670d\u52a1\uff08\u53ef\u9009\uff09',
  servicesDesc: '\u8fd9\u4e9b\u670d\u52a1\u589e\u5f3a\u5b89\u5168\u626b\u63cf\u548c\u533a\u5757\u94fe\u6570\u636e\u67e5\u8be2\u80fd\u529b\u3002\u53ef\u4ee5\u7a0d\u540e\u5728\u7ba1\u7406\u540e\u53f0\u4e2d\u914d\u7f6e\u3002',
  goplusDesc: '\u63d0\u4f9b\u4ee3\u5e01\u5b89\u5168\u626b\u63cf\u3001\u5730\u5740\u5206\u6790\u3001\u9493\u9c7c\u68c0\u6d4b\u7b49\u529f\u80fd\u3002',
  bscscanDesc: '\u63d0\u4f9b\u4ea4\u6613\u5386\u53f2\u3001\u5408\u7ea6\u6e90\u7801\u3001\u4f59\u989d\u67e5\u8be2\u529f\u80fd\u3002',
  noderealDesc: '\u514d\u8d39 BSC \u589e\u5f3a API\uff08\u6bcf\u6708 100M CU\uff09\u3002BscScan \u66ff\u4ee3\u65b9\u6848\u3002',
  serperDesc: 'Google \u641c\u7d22\u548c\u65b0\u95fb\u7ed3\u679c\uff0c\u7528\u4e8e\u6df1\u5ea6\u4ee3\u5e01\u7814\u7a76\u3002',
  steelDesc: '\u65e0\u5934\u6d4f\u89c8\u5668\uff0c\u7528\u4e8e\u6293\u53d6 SPA \u7f51\u7ad9\u3002',
  displayName: '\u663e\u793a\u540d\u79f0',
  displayNamePlaceholder: '\u4f8b\u5982 Claude Sonnet 4.5',
  advancedServices: '\u9ad8\u7ea7\u914d\u7f6e\uff1a\u94b1\u5305\u767b\u5f55\u4e0e RPC \u8282\u70b9',
  siweLabel: '\u94b1\u5305\u767b\u5f55',
  siweDesc: '\u914d\u7f6e SIWE \u94b1\u5305\u767b\u5f55\u7684\u57df\u540d\u548c\u5141\u8bb8\u7684\u94fe ID\u3002',
  siweDomainPlaceholder: '\u57df\u540d\uff0c\u4f8b\u5982 your-domain.com',
  siweChainIdsPlaceholder: '\u94fe ID\uff0c\u4f8b\u5982 56,204',
  rpcTitle: 'RPC \u8282\u70b9',
  rpcDesc: '\u81ea\u5b9a\u4e49 RPC \u8282\u70b9\u5730\u5740\u3002\u7559\u7a7a\u5c06\u4f7f\u7528\u516c\u5171\u9ed8\u8ba4\u8282\u70b9\u3002',
  detectedFromEnv: '\u5df2\u4ece\u73af\u5883\u53d8\u91cf\u68c0\u6d4b\u5230',
  test: '\u6d4b\u8bd5',
  completeSetup: '\u5b8c\u6210\u914d\u7f6e',
  allSet: '\u914d\u7f6e\u5b8c\u6210\uff01',
  allSetDesc: 'BNBrain \u5df2\u5c31\u7eea\uff0c\u6b63\u5728\u8df3\u8f6c\u5230\u804a\u5929...',
  autoConfigLoading: '\u6b63\u5728\u52a0\u8f7d\u9884\u914d\u7f6e...',
  autoConfigApplied: '\u9884\u914d\u7f6e\u5df2\u5e94\u7528\uff0c\u8bf7\u68c0\u67e5\u5e76\u6839\u636e\u9700\u8981\u8c03\u6574\u3002',
  autoConfigNote: '\u8fd9\u662f\u6211\u4eec\u63d0\u4f9b\u7684\u514d\u8d39\u6d4b\u8bd5\u51ed\u8bc1\uff0c\u989d\u5ea6\u6709\u9650\u3002\u53ef\u7a0d\u540e\u5728\u7ba1\u7406\u540e\u53f0\u66f4\u65b0\u4e3a\u81ea\u5df1\u7684 API Key\u3002',
  walletLoginHint: 'BNBrain \u652f\u6301\u94b1\u5305\u767b\u5f55\u7ba1\u7406\u540e\u53f0\u3002',
  walletLoginHintDetail: '\u8fdb\u5165\u7ba1\u7406\u540e\u53f0 \u2192 \u7ba1\u7406\u5458\u94b1\u5305 \u9875\u9762\uff0c\u6dfb\u52a0\u7ba1\u7406\u5458\u94b1\u5305\u5730\u5740\u5373\u53ef\u542f\u7528\u3002',
  walletConfigured: '\u5df2\u914d\u7f6e\u7ba1\u7406\u5458\u94b1\u5305',
  warningTitle: '\u914d\u7f6e\u7f3a\u5931\u63d0\u9192',
  warningDesc: '\u4ee5\u4e0b\u670d\u52a1\u5c1a\u672a\u914d\u7f6e\uff0c\u53ef\u4ee5\u7a0d\u540e\u5728\u7ba1\u7406\u540e\u53f0\u4e2d\u6dfb\u52a0\u3002',
  warningAI: 'AI \u6a21\u578b \u2014 \u7f3a\u5c11 AI \u6a21\u578b\uff0c\u5b89\u5168\u5206\u6790\u4ee3\u7406\u5c06\u65e0\u6cd5\u5de5\u4f5c\u3002',
  warningGoPlus: 'GoPlus \u2014 \u4ee3\u5e01\u5b89\u5168\u626b\u63cf\u3001\u5730\u5740\u98ce\u9669\u5206\u6790\u5c06\u4e0d\u53ef\u7528\u3002',
  warningBscScan: 'BscScan \u2014 \u4ea4\u6613\u5386\u53f2\u548c\u5408\u7ea6\u9a8c\u8bc1\u5c06\u4e0d\u53ef\u7528\u3002',
  warningNodeReal: 'NodeReal \u2014 BSC \u589e\u5f3a API \u5c06\u4e0d\u53ef\u7528\u3002',
  warningSerper: 'Serper \u2014 \u4ee3\u5e01\u6df1\u5ea6\u7814\u7a76\u7684\u7f51\u9875\u641c\u7d22\u5c06\u4e0d\u53ef\u7528\u3002',
  warningSteel: 'Steel \u2014 DApp \u5206\u6790\u7684\u7f51\u9875\u6293\u53d6\u5c06\u4e0d\u53ef\u7528\u3002',
  warningCancel: '\u8fd4\u56de\u4fee\u6539',
  warningConfirm: '\u7ee7\u7eed\u5b8c\u6210',
};
