'use client';

import { useState, useCallback } from 'react';
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
  initialConfig: {
    goplus: { appKey: string; appSecret: string } | null;
    bscscan: { apiKey: string } | null;
    envVars: {
      hasGoplusKey: boolean;
      hasBscscanKey: boolean;
    };
  };
}

export function AdminSettingsContent({
  initialConfig,
}: AdminSettingsContentProps) {
  const { locale } = useI18n();
  const t = locale === 'zh' ? zh : en;

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

  const [saving, setSaving] = useState(false);
  const [saveResult, setSaveResult] = useState<string | null>(null);

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
      });
    } catch {
      setBscscanValidation({ status: 'error', message: t.connectionError });
    }
  }, [bscscanKey, t]);

  const handleSave = useCallback(async () => {
    setSaving(true);
    setSaveResult(null);
    try {
      const res = await fetch('/api/setup/save', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          skipModel: true,
          services: {
            goplus:
              goplusKey && goplusSecret
                ? { appKey: goplusKey, appSecret: goplusSecret }
                : undefined,
            bscscan: bscscanKey ? { apiKey: bscscanKey } : undefined,
          },
        }),
      });
      const data = await res.json();
      setSaveResult(data.ok ? t.saved : data.error || t.saveFailed);
    } catch {
      setSaveResult(t.saveFailed);
    } finally {
      setSaving(false);
    }
  }, [goplusKey, goplusSecret, bscscanKey, t]);

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
        {initialConfig.envVars.hasGoplusKey && (
          <div className="mb-3 flex items-center gap-2 rounded-lg bg-emerald-500/10 px-3 py-2 text-xs text-emerald-400">
            <CheckCircle2 className="size-3 shrink-0" />
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
          <div className="relative">
            <input
              type={showGoplusSecret ? 'text' : 'password'}
              value={goplusSecret}
              onChange={(e) => {
                setGoplusSecret(e.target.value);
                setGoplusValidation({ status: 'idle', message: '' });
              }}
              placeholder="App Secret"
              className="w-full rounded-lg border border-border bg-background px-3 py-2 pr-10 text-base text-foreground placeholder:text-muted-foreground/40 focus:border-primary focus:outline-none md:text-sm"
            />
            <button
              type="button"
              onClick={() => setShowGoplusSecret(!showGoplusSecret)}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              {showGoplusSecret ? (
                <EyeOff className="size-4" />
              ) : (
                <Eye className="size-4" />
              )}
            </button>
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
        {initialConfig.envVars.hasBscscanKey && (
          <div className="mb-3 flex items-center gap-2 rounded-lg bg-emerald-500/10 px-3 py-2 text-xs text-emerald-400">
            <CheckCircle2 className="size-3 shrink-0" />
            {t.detectedFromEnv}
          </div>
        )}
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
              className="w-full rounded-lg border border-border bg-background px-3 py-2 pr-10 text-base text-foreground placeholder:text-muted-foreground/40 focus:border-primary focus:outline-none md:text-sm"
            />
            <button
              type="button"
              onClick={() => setShowBscscanKey(!showBscscanKey)}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              {showBscscanKey ? (
                <EyeOff className="size-4" />
              ) : (
                <Eye className="size-4" />
              )}
            </button>
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
  detectedFromEnv: '同时已从环境变量检测到',
  test: '测试',
  saveSettings: '保存设置',
  saved: '设置保存成功',
  saveFailed: '保存设置失败',
};
