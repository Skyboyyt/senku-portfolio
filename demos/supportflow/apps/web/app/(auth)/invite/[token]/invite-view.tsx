"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import useSWR from "swr";
import { LABELS, registerWithInviteSchema, type Role, type SessionDto } from "@supportflow/shared";
import { AuthCard } from "@/components/shared/auth-card";
import { Button, buttonVariants } from "@/components/ui/button";
import { Field, FormError } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { ApiError, api, errorMessage } from "@/lib/api";
import { fieldErrors } from "@/lib/forms";

interface InvitationInfo {
  organizationName: string;
  email: string;
  role: Role;
  hasAccount: boolean;
  expiresAt: string;
}

export function InviteView({ token }: { token: string }) {
  const router = useRouter();
  const invite = useSWR<InvitationInfo>(`/invitations/${encodeURIComponent(token)}`);
  const session = useSWR<SessionDto>("/auth/session", { shouldRetryOnError: false });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  if (invite.isLoading) {
    return (
      <div className="space-y-3" role="status" aria-label="Loading invitation">
        <Skeleton className="h-7 w-3/4" />
        <Skeleton className="h-4 w-1/2" />
        <Skeleton className="mt-6 h-10 w-full" />
      </div>
    );
  }
  if (invite.error || !invite.data) {
    const expired = invite.error instanceof ApiError && invite.error.status === 410;
    return (
      <AuthCard
        title={expired ? "This invitation has expired" : "Invitation not found"}
        subtitle={expired ? "Ask the person who invited you to send a new one." : "It may have been used already or withdrawn."}
      >
        <Link href="/login" className={buttonVariants({ variant: "secondary" })}>Go to sign in</Link>
      </AuthCard>
    );
  }

  const info = invite.data;
  const signedInAs = session.data?.user.email;
  const matches = signedInAs?.toLowerCase() === info.email.toLowerCase();

  const accept = async () => {
    setPending(true);
    setFormError(null);
    try {
      await api("/invitations/accept", { body: { token } });
      router.replace("/app");
    } catch (error) {
      setFormError(errorMessage(error));
      setPending(false);
    }
  };

  const registerAndJoin = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const parsed = registerWithInviteSchema.safeParse({ ...Object.fromEntries(new FormData(event.currentTarget)), token });
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error));
      return;
    }
    setErrors({});
    setPending(true);
    try {
      await api("/invitations/register", { body: parsed.data });
      router.replace("/app?welcome=1");
    } catch (error) {
      setPending(false);
      if (error instanceof ApiError && Object.keys(error.fields).length) setErrors(error.fields);
      else setFormError(errorMessage(error));
    }
  };

  const subtitle = (
    <>
      You&apos;ve been invited to <strong className="text-text">{info.organizationName}</strong> as{" "}
      an {LABELS.role[info.role].toLowerCase()}.
    </>
  );

  if (matches) {
    return (
      <AuthCard title={`Join ${info.organizationName}`} subtitle={subtitle}>
        <FormError message={formError} />
        <p className="mb-5 text-sm text-muted">Signed in as {signedInAs}.</p>
        <Button size="lg" className="w-full" loading={pending} onClick={accept}>
          Accept invitation
        </Button>
      </AuthCard>
    );
  }

  if (info.hasAccount || signedInAs) {
    return (
      <AuthCard title={`Join ${info.organizationName}`} subtitle={subtitle}>
        <FormError message={formError} />
        <p className="text-sm text-muted">
          {signedInAs
            ? `You're signed in as ${signedInAs}, but this invitation is for ${info.email}. Sign in with that address to accept it.`
            : `Sign in as ${info.email} to accept this invitation.`}
        </p>
        <Link
          href={`/login?next=${encodeURIComponent(`/invite/${token}`)}`}
          className={`${buttonVariants({ size: "lg" })} mt-5 w-full`}
        >
          Sign in as {info.email}
        </Link>
      </AuthCard>
    );
  }

  return (
    <AuthCard title={`Join ${info.organizationName}`} subtitle={subtitle}>
      <form onSubmit={registerAndJoin} noValidate className="space-y-4">
        <FormError message={formError} />
        <Field label="Email">
          <Input value={info.email} readOnly disabled />
        </Field>
        <Field label="Your name" error={errors.name}>
          <Input name="name" autoComplete="name" required autoFocus maxLength={80} />
        </Field>
        <Field label="Password" error={errors.password} hint="At least 10 characters.">
          <Input name="password" type="password" autoComplete="new-password" required minLength={10} />
        </Field>
        <Button type="submit" size="lg" className="w-full" loading={pending}>
          Create account and join
        </Button>
      </form>
    </AuthCard>
  );
}
