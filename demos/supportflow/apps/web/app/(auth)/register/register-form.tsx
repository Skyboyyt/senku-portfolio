"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, type FormEvent } from "react";
import { PLAN_IDS, registerSchema } from "@supportflow/shared";
import { AuthCard } from "@/components/shared/auth-card";
import { Button } from "@/components/ui/button";
import { Field, FormError } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { ApiError, api } from "@/lib/api";
import { fieldErrors } from "@/lib/forms";

export function RegisterForm() {
  const router = useRouter();
  const params = useSearchParams();
  const plan = params.get("plan");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const parsed = registerSchema.safeParse(Object.fromEntries(new FormData(event.currentTarget)));
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error));
      return;
    }
    setErrors({});
    setFormError(null);
    setPending(true);
    try {
      await api("/auth/register", { body: parsed.data });
      const wantsPlan = plan && (PLAN_IDS as readonly string[]).includes(plan) && plan !== "free";
      router.replace(wantsPlan ? `/app/billing?plan=${plan}` : "/app?welcome=1");
      router.refresh();
    } catch (error) {
      setPending(false);
      if (error instanceof ApiError && Object.keys(error.fields).length) setErrors(error.fields);
      else setFormError(error instanceof Error ? error.message : "Sign-up failed");
    }
  };

  return (
    <AuthCard
      title="Create your workspace"
      subtitle="Free plan, no card required."
      footer={
        <>
          Already have an account?{" "}
          <Link href="/login" className="font-medium text-primary underline-offset-4 hover:underline">
            Sign in
          </Link>
        </>
      }
    >
      <form onSubmit={submit} noValidate className="space-y-4">
        <FormError message={formError} />
        <Field label="Your name" error={errors.name}>
          <Input name="name" autoComplete="name" required autoFocus maxLength={80} />
        </Field>
        <Field label="Work email" error={errors.email}>
          <Input name="email" type="email" autoComplete="email" required maxLength={254} />
        </Field>
        <Field label="Password" error={errors.password} hint="At least 10 characters.">
          <Input name="password" type="password" autoComplete="new-password" required minLength={10} maxLength={200} />
        </Field>
        <Field label="Workspace name" error={errors.organizationName} hint="Usually your company or team name.">
          <Input name="organizationName" autoComplete="organization" required maxLength={80} />
        </Field>
        <Button type="submit" className="w-full" size="lg" loading={pending}>
          Create workspace
        </Button>
        <p className="text-[13px] leading-relaxed text-subtle">
          By creating a workspace you agree to the{" "}
          <Link href="/terms" className="underline underline-offset-2 hover:text-text">terms</Link> and{" "}
          <Link href="/privacy" className="underline underline-offset-2 hover:text-text">privacy policy</Link>.
        </p>
      </form>
    </AuthCard>
  );
}
