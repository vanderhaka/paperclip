import { useMemo, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Link, useNavigate, useSearchParams } from "@/lib/router";
import { Sparkles } from "lucide-react";
import { authApi } from "../api/auth";
import { Button } from "@/components/ui/button";
import { AsciiArtAnimation } from "@/components/AsciiArtAnimation";

/**
 * /auth/reset-password?token=... — completes the Better Auth reset flow.
 *
 * The token is delivered via the reset link. If the link was invalid or expired,
 * Better Auth redirects here with `?error=INVALID_TOKEN` — we surface that to the
 * user instead of silently failing.
 */
export function ResetPasswordPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const token = useMemo(() => searchParams.get("token") ?? "", [searchParams]);
  const tokenError = useMemo(() => searchParams.get("error"), [searchParams]);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const mutation = useMutation({
    mutationFn: () => authApi.resetPassword({ token, newPassword: password }),
    onSuccess: () => {
      setError(null);
      setSuccess(true);
      setTimeout(() => navigate("/auth", { replace: true }), 1500);
    },
    onError: (err) => {
      setError(err instanceof Error ? err.message : "Unable to reset password.");
    },
  });

  const passwordsMatch = password.length > 0 && password === confirm;
  const passwordLongEnough = password.length >= 8;
  const canSubmit = !!token && passwordsMatch && passwordLongEnough && !mutation.isPending;

  return (
    <div className="fixed inset-0 flex bg-background">
      <div className="w-full md:w-1/2 flex flex-col overflow-y-auto">
        <div className="w-full max-w-md mx-auto my-auto px-8 py-12">
          <div className="flex items-center gap-2 mb-8">
            <Sparkles className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium">Paperclip</span>
          </div>

          <h1 className="text-xl font-semibold">Choose a new password</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Use at least 8 characters. You&apos;ll sign in with the new password next.
          </p>

          {tokenError === "INVALID_TOKEN" || !token ? (
            <div className="mt-6 space-y-4">
              <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-3 text-sm text-destructive">
                This reset link is invalid or has expired. Request a new one to continue.
              </div>
              <Link
                to="/auth/forgot-password"
                className="inline-flex text-sm text-foreground underline underline-offset-2"
              >
                Request a new reset link
              </Link>
            </div>
          ) : success ? (
            <div className="mt-6 rounded-md border border-border bg-accent/30 px-3 py-3 text-sm">
              Password updated. Redirecting to sign in…
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
                <label htmlFor="password" className="text-xs text-muted-foreground mb-1 block">
                  New password
                </label>
                <input
                  id="password"
                  name="password"
                  type="password"
                  autoComplete="new-password"
                  autoFocus
                  className="w-full rounded-md border border-border bg-transparent px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-ring placeholder:text-muted-foreground/50"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                />
              </div>
              <div>
                <label htmlFor="confirm" className="text-xs text-muted-foreground mb-1 block">
                  Confirm password
                </label>
                <input
                  id="confirm"
                  name="confirm"
                  type="password"
                  autoComplete="new-password"
                  className="w-full rounded-md border border-border bg-transparent px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-ring placeholder:text-muted-foreground/50"
                  value={confirm}
                  onChange={(event) => setConfirm(event.target.value)}
                />
              </div>
              {password.length > 0 && !passwordLongEnough && (
                <p className="text-xs text-muted-foreground">Must be at least 8 characters.</p>
              )}
              {confirm.length > 0 && !passwordsMatch && (
                <p className="text-xs text-destructive">Passwords don&apos;t match.</p>
              )}
              {error && <p className="text-xs text-destructive">{error}</p>}
              <Button
                type="submit"
                disabled={!canSubmit}
                aria-disabled={!canSubmit}
                className={`w-full ${!canSubmit ? "opacity-50" : ""}`}
              >
                {mutation.isPending ? "Updating…" : "Update password"}
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
