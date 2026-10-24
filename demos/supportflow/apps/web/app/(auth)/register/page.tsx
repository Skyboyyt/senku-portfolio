import type { Metadata } from "next";
import { Suspense } from "react";
import { RegisterForm } from "./register-form";

export const metadata: Metadata = {
  title: "Create a workspace",
  description: "Create a free SupportFlow workspace for your support team.",
  alternates: { canonical: "/register" },
};

export default function RegisterPage() {
  return (
    <Suspense>
      <RegisterForm />
    </Suspense>
  );
}
