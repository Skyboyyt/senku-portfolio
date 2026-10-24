"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, type FormEvent } from "react";
import { loginSchema } from "@supportflow/shared";
import { AuthCard } from "@/components/shared/auth-card";
import { Button } from "@/components/ui/button";
import { Field, FormError } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { ApiError, api } from "@/lib/api";
import { fieldErrors, safeNext } from "@/lib/forms";

export function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const parsed = loginSchema.safeParse(Object.fromEntries(new FormData(event.currentTarget)));
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error));
      return;
    }
    setErrors({});
    setFormError(null);
    setPending(true);
    try {
      await api("/auth/login", { body: parsed.data });
      router.replace(safeNext(params.get("next")));
      router.refresh();
    } catch (error) {
      setPending(false);
      if (error instanceof ApiError && Object.keys(error.fields).length) setErrors(error.fields);
      else setFormError(error instanceof Error ? error.message : "Sign-in failed");
    }
  };

  return (
    <AuthCard
      title="Sign in"
      subtitle="Welcome back to SupportFlow."
      footer={
        <>
          New to SupportFlow?{" "}
          <Link href="/register" className="font-medium text-primary underline-offset-4 hover:underline">
            Create a workspace
          </Link>
        </>
      }
    >
      <form onSubmit={submit} noValidate className="space-y-4">
        <FormError message={formError} />
        <Field label="Email" error={errors.email}>
          <Input name="email" type="email" autoComplete="email" required autoFocus />
        </Field>
        <Field label="Password" error={errors.password}>
          <Input name="password" type="password" autoComplete="current-password" required />
        </Field>
        <Button type="submit" className="w-full" size="lg" loading={pending}>
          Sign in
        </Button>
      </form>
    </AuthCard>
  );
}
