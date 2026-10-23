"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { useSWRConfig } from "swr";
import { createOrgSchema } from "@supportflow/shared";
import { Logo } from "@/components/shared/logo";
import { Button } from "@/components/ui/button";
import { Field, FormError } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { ApiError, api } from "@/lib/api";
import { fieldErrors } from "@/lib/forms";
import { useSession } from "./session";

export function CreateWorkspace({ firstTime = false }: { firstTime?: boolean }) {
  const router = useRouter();
  const { mutate } = useSession();
  const { mutate: mutateAll } = useSWRConfig();
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const parsed = createOrgSchema.safeParse(Object.fromEntries(new FormData(event.currentTarget)));
    if (!parsed.success) return setErrors(fieldErrors(parsed.error));
    setErrors({});
    setPending(true);
    try {
      const session = await api("/orgs", { body: parsed.data });
      await mutate(session as never, { revalidate: true });
      await mutateAll((key) => key !== "/auth/session", undefined, { revalidate: true });
      router.push("/app?welcome=1");
    } catch (error) {
      setPending(false);
      if (error instanceof ApiError && Object.keys(error.fields).length) setErrors(error.fields);
      else setFormError(error instanceof Error ? error.message : "Couldn't create the workspace");
    }
  };

  return (
    <div className={firstTime ? "grid min-h-dvh place-items-center px-4" : "px-4 py-10 sm:px-8"}>
      <div className="w-full max-w-md">
        {firstTime && <Logo className="mb-8" />}
        <h1 className="text-xl font-semibold tracking-[-0.015em]">{firstTime ? "Create a workspace" : "New workspace"}</h1>
        <p className="mt-1.5 text-sm text-muted">
          {firstTime
            ? "You're not a member of any workspace. Create one to start, or ask a teammate to invite you."
            : "Each workspace has its own inbox, help centre, team and billing. You'll be its owner."}
        </p>
        <form onSubmit={submit} noValidate className="mt-6 space-y-4">
          <FormError message={formError} />
          <Field label="Workspace name" error={errors.name}>
            <Input name="name" required maxLength={80} autoFocus />
          </Field>
          <Button type="submit" loading={pending}>Create workspace</Button>
        </form>
      </div>
    </div>
  );
}
