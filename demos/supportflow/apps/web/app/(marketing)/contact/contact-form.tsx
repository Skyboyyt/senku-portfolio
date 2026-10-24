"use client";

import { CheckCircle2 } from "lucide-react";
import { useState, type FormEvent } from "react";
import { contactSchema } from "@supportflow/shared";
import { Button } from "@/components/ui/button";
import { Field, FormError } from "@/components/ui/field";
import { Input, Textarea } from "@/components/ui/input";
import { ApiError, api } from "@/lib/api";
import { fieldErrors } from "@/lib/forms";

export function ContactForm() {
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [sent, setSent] = useState(false);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(event.currentTarget)) as Record<string, string>;
    const parsed = contactSchema.safeParse(data);
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error));
      return;
    }
    setErrors({});
    setFormError(null);
    setPending(true);
    try {
      await api("/contact", { body: parsed.data });
      setSent(true);
    } catch (error) {
      if (error instanceof ApiError && Object.keys(error.fields).length) setErrors(error.fields);
      else setFormError(error instanceof Error ? error.message : "Your message could not be sent");
    } finally {
      setPending(false);
    }
  };

  if (sent) {
    return (
      <div role="status" className="rounded-xl border border-border bg-surface p-8">
        <CheckCircle2 className="size-6 text-success" aria-hidden />
        <h2 className="mt-4 text-lg font-semibold">Message received</h2>
        <p className="mt-1.5 text-[15px] text-muted">Thanks for getting in touch. We&apos;ll reply to the email address you gave.</p>
      </div>
    );
  }

  return (
    <form onSubmit={submit} noValidate className="space-y-5 rounded-xl border border-border bg-surface p-6 sm:p-8">
      <FormError message={formError} />
      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Name" error={errors.name}>
          <Input name="name" autoComplete="name" required maxLength={80} />
        </Field>
        <Field label="Work email" error={errors.email}>
          <Input name="email" type="email" autoComplete="email" required maxLength={254} />
        </Field>
      </div>
      <Field label="Company" optional error={errors.company}>
        <Input name="company" autoComplete="organization" maxLength={120} />
      </Field>
      <Field label="How can we help?" error={errors.message} hint="At least 10 characters.">
        <Textarea name="message" rows={6} required maxLength={4000} />
      </Field>
      {/* Honeypot: hidden from people, filled in by bots. */}
      <div aria-hidden className="absolute -left-[9999px] h-px w-px overflow-hidden">
        <label>
          Website
          <input name="website" tabIndex={-1} autoComplete="off" />
        </label>
      </div>
      <Button type="submit" loading={pending} size="lg">
        Send message
      </Button>
    </form>
  );
}
