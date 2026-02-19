'use client';

import { useState, useCallback, useMemo } from 'react';
import { ChevronDown, ChevronRight, Send, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { useFormCompletionStore } from '@/lib/stores/form-completion-store';

interface FormField {
  key: string;
  label: string;
  type: 'text' | 'number' | 'select' | 'switch' | 'address' | 'textarea';
  placeholder?: string;
  defaultValue?: unknown;
  required?: boolean;
  options?: Array<{ label: string; value: string }>;
  dependsOn?: string;
  hint?: string;
  min?: number;
  max?: number;
  suffix?: string;
}

interface FormSection {
  title: string;
  collapsed?: boolean;
  fields: FormField[];
}

interface InputFormData {
  formId: string;
  title: string;
  description?: string;
  sections: FormSection[];
  status: string;
}

function getDefaultValues(sections: FormSection[]): Record<string, unknown> {
  const values: Record<string, unknown> = {};
  for (const section of sections) {
    for (const field of section.fields) {
      if (field.defaultValue !== undefined) {
        values[field.key] = field.defaultValue;
      } else if (field.type === 'switch') {
        values[field.key] = false;
      } else if (field.type === 'number') {
        values[field.key] = field.min ?? 0;
      } else {
        values[field.key] = '';
      }
    }
  }
  return values;
}

function FieldRenderer({
  field,
  value,
  onChange,
  locale,
}: {
  field: FormField;
  value: unknown;
  onChange: (key: string, val: unknown) => void;
  locale: string;
}) {
  const zh = locale === 'zh';

  if (field.type === 'switch') {
    return (
      <div className="flex items-center justify-between rounded-lg border border-border/50 bg-muted/30 px-3 py-2.5">
        <div className="space-y-0.5">
          <Label className="text-sm font-medium">{field.label}</Label>
          {field.hint && <p className="text-xs text-muted-foreground">{field.hint}</p>}
        </div>
        <Switch
          checked={Boolean(value)}
          onCheckedChange={(checked) => onChange(field.key, checked)}
        />
      </div>
    );
  }

  if (field.type === 'select' && field.options) {
    return (
      <div className="space-y-1.5">
        <Label className="text-sm font-medium">
          {field.label}
          {field.required && <span className="text-red-400 ml-0.5">*</span>}
        </Label>
        <select
          value={String(value ?? '')}
          onChange={(e) => onChange(field.key, e.target.value)}
          className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        >
          {field.options.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        {field.hint && <p className="text-xs text-muted-foreground">{field.hint}</p>}
      </div>
    );
  }

  if (field.type === 'textarea') {
    return (
      <div className="space-y-1.5">
        <Label className="text-sm font-medium">
          {field.label}
          {field.required && <span className="text-red-400 ml-0.5">*</span>}
        </Label>
        <textarea
          value={String(value ?? '')}
          onChange={(e) => onChange(field.key, e.target.value)}
          placeholder={field.placeholder}
          rows={3}
          className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-y"
        />
        {field.hint && <p className="text-xs text-muted-foreground">{field.hint}</p>}
      </div>
    );
  }

  // text, number, address
  const hasDefault = field.defaultValue !== undefined && field.defaultValue !== null && field.defaultValue !== '';
  const effectivePlaceholder = field.placeholder
    ?? (hasDefault ? `${zh ? '默认' : 'Default'}: ${field.defaultValue}` : undefined);

  return (
    <div className="space-y-1.5">
      <Label className="text-sm font-medium">
        {field.label}
        {field.required && !hasDefault && <span className="text-red-400 ml-0.5">*</span>}
      </Label>
      <div className="relative">
        <Input
          type={field.type === 'number' ? 'number' : 'text'}
          value={String(value ?? '')}
          onChange={(e) => {
            const raw = e.target.value;
            onChange(field.key, field.type === 'number' ? (raw === '' ? '' : Number(raw)) : raw);
          }}
          placeholder={effectivePlaceholder}
          min={field.min}
          max={field.max}
          className={field.suffix ? 'pr-10' : ''}
        />
        {field.suffix && (
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
            {field.suffix}
          </span>
        )}
      </div>
      {field.hint && <p className="text-xs text-muted-foreground">{field.hint}</p>}
    </div>
  );
}

function SectionBlock({
  section,
  values,
  onChange,
  locale,
}: {
  section: FormSection;
  values: Record<string, unknown>;
  onChange: (key: string, val: unknown) => void;
  locale: string;
}) {
  const [collapsed, setCollapsed] = useState(section.collapsed ?? false);

  const visibleFields = useMemo(
    () =>
      section.fields.filter((f) => {
        if (!f.dependsOn) return true;
        return Boolean(values[f.dependsOn]);
      }),
    [section.fields, values]
  );

  return (
    <div className="space-y-3">
      <button
        type="button"
        onClick={() => setCollapsed(!collapsed)}
        className="flex w-full items-center gap-2 text-sm font-semibold text-foreground hover:text-primary transition-colors"
      >
        {collapsed ? (
          <ChevronRight className="size-4 text-muted-foreground" />
        ) : (
          <ChevronDown className="size-4 text-muted-foreground" />
        )}
        {section.title}
        {collapsed && visibleFields.length > 0 && (
          <Badge variant="outline" className="ml-auto text-[10px]">
            {visibleFields.length}
          </Badge>
        )}
      </button>
      {!collapsed && (
        <div className="space-y-3 pl-6 animate-in fade-in slide-in-from-top-1 duration-200">
          {visibleFields.map((field) => (
            <FieldRenderer
              key={field.key}
              field={field}
              value={values[field.key]}
              onChange={onChange}
              locale={locale}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export interface InputFormModalProps {
  data: InputFormData;
  conversationId?: string;
  readOnly?: boolean;
  locale?: string;
  onSubmit?: (formId: string, values: Record<string, unknown>) => void;
}

export function InputFormModal({
  data,
  conversationId,
  readOnly,
  locale = 'en',
  onSubmit,
}: InputFormModalProps) {
  const zh = locale === 'zh';
  const [open, setOpen] = useState(data.status === 'waiting_for_input' && !readOnly);
  const [submitted, setSubmitted] = useState(data.status !== 'waiting_for_input');
  const [values, setValues] = useState<Record<string, unknown>>(() =>
    getDefaultValues(data.sections)
  );

  const handleChange = useCallback((key: string, val: unknown) => {
    setValues((prev) => ({ ...prev, [key]: val }));
  }, []);

  const handleSubmit = useCallback(() => {
    setSubmitted(true);
    setOpen(false);
    // Fill empty fields with their defaults before sending
    const finalValues: Record<string, unknown> = { ...values };
    for (const section of data.sections) {
      for (const field of section.fields) {
        const val = finalValues[field.key];
        if ((val === '' || val === undefined || val === null) && field.defaultValue !== undefined) {
          finalValues[field.key] = field.defaultValue;
        }
      }
    }
    if (conversationId) {
      useFormCompletionStore.getState().push({
        conversationId,
        formId: data.formId,
        values: finalValues,
      });
    }
    onSubmit?.(data.formId, finalValues);
  }, [data.formId, data.sections, values, onSubmit, conversationId]);

  // Quick check for required fields — fields with defaultValue are never "missing"
  const missingRequired = useMemo(() => {
    for (const section of data.sections) {
      for (const field of section.fields) {
        if (!field.required) continue;
        if (field.dependsOn && !values[field.dependsOn]) continue;
        // If the field has a default, the user can leave it empty (default will be used)
        if (field.defaultValue !== undefined && field.defaultValue !== null && field.defaultValue !== '') continue;
        const val = values[field.key];
        if (val === '' || val === undefined || val === null) return true;
      }
    }
    return false;
  }, [data.sections, values]);

  if (submitted) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-400">
        <Send className="size-3.5" />
        <span>{zh ? '已提交，AI 正在处理…' : 'Submitted, AI is processing…'}</span>
      </div>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => !readOnly && setOpen(true)}
        className="flex w-full items-center gap-2 rounded-lg border border-primary/30 bg-primary/10 px-3 py-2.5 text-sm font-medium text-primary hover:bg-primary/15 transition-colors cursor-pointer"
      >
        <Send className="size-4" />
        {data.title}
        <Badge variant="outline" className="ml-auto text-[10px]">
          {zh ? '待填写' : 'Pending'}
        </Badge>
      </button>

      <Dialog open={open} onOpenChange={readOnly ? undefined : setOpen}>
        <DialogContent className="max-w-lg flex flex-col max-h-[85vh]">
          <DialogHeader className="shrink-0">
            <DialogTitle>{data.title}</DialogTitle>
            {data.description && (
              <DialogDescription>{data.description}</DialogDescription>
            )}
          </DialogHeader>

          <div className="space-y-5 py-2 overflow-y-auto min-h-0 flex-1 px-0.5">
            {data.sections.map((section, i) => (
              <SectionBlock
                key={`${section.title}-${i}`}
                section={section}
                values={values}
                onChange={handleChange}
                locale={locale}
              />
            ))}
          </div>

          <div className="shrink-0 flex items-center gap-3 pt-4 border-t border-border/60">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setOpen(false)}
              className="text-muted-foreground"
            >
              {zh ? '取消' : 'Cancel'}
            </Button>
            <Button
              size="default"
              onClick={handleSubmit}
              disabled={missingRequired}
              className="ml-auto gap-2"
            >
              <Send className="size-4" />
              {zh ? '确认提交' : 'Submit'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
