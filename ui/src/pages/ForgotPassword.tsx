import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Link } from "@/lib/router";
import { Sparkles } from "lucide-react";
import { authApi } from "../api/auth";
import { Button } from "@/components/ui/button";
import { AsciiArtAnimation } from "@/components/AsciiArtAnimation";

/**
 * /auth/forgot-password — requests a Better Auth password reset link.
 *
 * NOTE on email delivery:
 * No outbound email transport is configured in this instance yet. The server's
 * `sendResetPassword` callback logs the reset URL so an admin can hand it to the
 * user manually. We surface that expectation here so the user isn't left waiting
 * for an email that will never arrive. Once SMTP/Resend/etc is wired up, this
 * page continues to work unchanged.
 */
export function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const redirectTo =
    typeof window !== "undefined"
      ? `${window.location.origin}/auth/reset-password`
      : "/auth/reset-password";

  const mutation = useMutation({
    mutationFn: () =>
      authApi.requestPasswordReset({ email: email.trim(), redirectTo }),
    onSuccess: () => {
      setError(null);
      setSubmitted(true);
    },
    onError: (err) => {
      setError(err instanceof Error ? err.message : "Unable to request reset.");
    },
  });

  const canSubmit = email.trim().length > 0 && !mutation.isPending;

  return (
    <div className="fixed inset-0 flex bg-background">
      <div className="w-full md:w-1/2 flex flex-col overflow-y-auto">
        <div className="w-full max-w-md mx-auto my-auto px-8 py-12">
          <div className="flex items-center gap-2 mb-8">
            <Sparkles className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium">Paperclip</span>
          </div>

          <h1 className="text-xl font-semibold">Reset your password</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Enter the email on your account. We&apos;ll send a reset link to that address.
          </p>

          {submitted ? (
            <div className="mt-6 space-y-4">
              <div className="rounded-md border border-border bg-accent/30 px-3 py-3 text-sm">
                <p className="font-medium">Request received.</p>
                <p className="mt-1 text-muted-foreground">
                  If an account exists for <span className="font-mono">{email.trim()}</span>, a reset
                  link is on its way. If email delivery isn&apos;t configured on this instance yet,
                  ask your admin to pull the reset URL from the server log.
                </p>
              </div>
              <Link
                to="/auth"
                className="inline-flex text-sm text-foreground underline underline-offset-2"
              >
                Back to sign in
              </Link>
            </div>
          ) : (
            <form
              className="mt-6 space-y-4"
              onSubmit={(event) => {
                event.preventDefault();
                if (!canSubmit) return;
                mutation.mutate();
              }}
            >
              <div>
                <label htmlFor="email" className="text-xs text-muted-foreground mb-1 block">
                  Email
                </label>
                <input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  autoFocus
                  className="w-full rounded-md border border-border bg-transparent px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-ring placeholder:text-muted-foreground/50"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                />
              </div>
              {error && <p className="text-xs text-destructive">{error}</p>}
              <Button
                type="submit"
                disabled={!canSubmit}
                aria-disabled={!canSubmit}
                className={`w-full ${!canSubmit ? "opacity-50" : ""}`}
              >
                {mutation.isPending ? "Sending…" : "Send reset link"}
              </Button>
              <div className="text-center text-xs">
                <Link
                  to="/auth"
                  className="text-muted-foreground underline underline-offset-2 hover:text-foreground"
                >
                  Back to sign in
                </Link>
              </div>
            </form>
          )}
        </div>
      </div>
      <div className="hidden md:block w-1/2 overflow-hidden">
        <AsciiArtAnimation />
      </div>
    </div>
  );
}
