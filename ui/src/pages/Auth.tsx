import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useSearchParams } from "@/lib/router";
import { authApi } from "../api/auth";
import { queryKeys } from "../lib/queryKeys";
import { Button } from "@/components/ui/button";
import { Users, ListChecks, LineChart } from "lucide-react";

const DOCS_URL = "https://paperclip.ing/docs";
const REPO_URL = "https://github.com/paperclipai/paperclip";

type AuthMode = "sign_in" | "sign_up";

export function AuthPage() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [mode, setMode] = useState<AuthMode>("sign_in");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  const nextPath = useMemo(() => searchParams.get("next") || "/", [searchParams]);
  const { data: session, isLoading: isSessionLoading } = useQuery({
    queryKey: queryKeys.auth.session,
    queryFn: () => authApi.getSession(),
    retry: false,
  });

  useEffect(() => {
    if (session) {
      navigate(nextPath, { replace: true });
    }
  }, [session, navigate, nextPath]);

  const mutation = useMutation({
    mutationFn: async () => {
      if (mode === "sign_in") {
        await authApi.signInEmail({ email: email.trim(), password });
        return;
      }
      await authApi.signUpEmail({
        name: name.trim(),
        email: email.trim(),
        password,
      });
    },
    onSuccess: async () => {
      setError(null);
      await queryClient.invalidateQueries({ queryKey: queryKeys.auth.session });
      await queryClient.invalidateQueries({ queryKey: queryKeys.companies.all });
      navigate(nextPath, { replace: true });
    },
    onError: (err) => {
      setError(err instanceof Error ? err.message : "Authentication failed");
    },
  });

  const canSubmit =
    email.trim().length > 0 &&
    password.trim().length > 0 &&
    (mode === "sign_in" || (name.trim().length > 0 && password.trim().length >= 8));

  if (isSessionLoading) {
    return (
      <div className="fixed inset-0 flex items-center justify-center">
        <p className="text-sm text-muted-foreground">Loading…</p>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 flex flex-col md:flex-row bg-background overflow-y-auto">
      {/* Left column (desktop) / top (mobile) — welcome panel */}
      <section
        aria-labelledby="paperclip-heading"
        className="w-full md:w-1/2 flex flex-col border-b border-border md:border-b-0 md:border-r"
      >
        <div className="w-full max-w-lg mx-auto my-auto px-8 py-12 md:py-16">
          <div className="flex items-center gap-2 mb-8">
            <img
              src="/favicon.svg"
              alt=""
              aria-hidden="true"
              className="h-5 w-5"
            />
            <span className="text-sm font-medium tracking-tight">Paperclip</span>
          </div>

          <h1
            id="paperclip-heading"
            className="text-3xl font-semibold tracking-tight"
          >
            Run your team of AI agents — together.
          </h1>
          <p className="mt-3 text-sm text-muted-foreground leading-relaxed">
            Paperclip is open-source orchestration for autonomous companies.
            Assign goals, delegate work, and keep every agent accountable from
            one dashboard.
          </p>

          <h2 className="sr-only">What Paperclip does</h2>
          <ul className="mt-8 space-y-4">
            <li className="flex items-start gap-3">
              <Users className="mt-0.5 h-4 w-4 flex-none text-muted-foreground" aria-hidden="true" />
              <span className="text-sm">Hire agents for any role</span>
            </li>
            <li className="flex items-start gap-3">
              <ListChecks className="mt-0.5 h-4 w-4 flex-none text-muted-foreground" aria-hidden="true" />
              <span className="text-sm">Delegate tasks and review decisions</span>
            </li>
            <li className="flex items-start gap-3">
              <LineChart className="mt-0.5 h-4 w-4 flex-none text-muted-foreground" aria-hidden="true" />
              <span className="text-sm">Track spend and performance in one place</span>
            </li>
          </ul>

          <div className="mt-10 space-y-2 text-xs text-muted-foreground">
            <p>
              New here?{" "}
              <a
                href={DOCS_URL}
                target="_blank"
                rel="noreferrer"
                className="font-medium text-foreground underline underline-offset-2"
              >
                Read the docs
              </a>
            </p>
            <p>
              Paperclip is open source.{" "}
              <a
                href={REPO_URL}
                target="_blank"
                rel="noreferrer"
                className="font-medium text-foreground underline underline-offset-2"
              >
                Self-host guide
              </a>
            </p>
          </div>
        </div>
      </section>

      {/* Right column (desktop) / bottom (mobile) — sign-in form */}
      <section
        aria-labelledby="auth-heading"
        className="w-full md:w-1/2 flex flex-col"
      >
        <div className="w-full max-w-md mx-auto my-auto px-8 py-12 md:py-16">
          <h2 id="auth-heading" className="text-xl font-semibold tracking-tight">
            {mode === "sign_in" ? "Sign in to Paperclip" : "Create your Paperclip account"}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {mode === "sign_in"
              ? "Use your email and password to access this instance."
              : "Create an account for this instance. Email confirmation is not required in v1."}
          </p>

          <form
            className="mt-6 space-y-4"
            method="post"
            action={mode === "sign_up" ? "/api/auth/sign-up/email" : "/api/auth/sign-in/email"}
            onSubmit={(event) => {
              event.preventDefault();
              if (mutation.isPending) return;
              if (!canSubmit) {
                setError("Please fill in all required fields.");
                return;
              }
              mutation.mutate();
            }}
          >
            {mode === "sign_up" && (
              <div>
                <label htmlFor="name" className="text-xs text-muted-foreground mb-1 block">Name</label>
                <input
                  id="name"
                  name="name"
                  className="w-full rounded-md border border-border bg-transparent px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-ring placeholder:text-muted-foreground/50"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  autoComplete="name"
                  autoFocus
                />
              </div>
            )}
            <div>
              <label htmlFor="email" className="text-xs text-muted-foreground mb-1 block">Email</label>
              <input
                id="email"
                name="email"
                className="w-full rounded-md border border-border bg-transparent px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-ring placeholder:text-muted-foreground/50"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                autoComplete="email"
                autoFocus={mode === "sign_in"}
              />
            </div>
            <div>
              <label htmlFor="password" className="text-xs text-muted-foreground mb-1 block">Password</label>
              <input
                id="password"
                name="password"
                className="w-full rounded-md border border-border bg-transparent px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-ring placeholder:text-muted-foreground/50"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete={mode === "sign_in" ? "current-password" : "new-password"}
              />
            </div>
            {error && <p className="text-xs text-destructive">{error}</p>}
            <Button
              type="submit"
              disabled={mutation.isPending}
              aria-disabled={!canSubmit || mutation.isPending}
              className={`w-full ${!canSubmit && !mutation.isPending ? "opacity-50" : ""}`}
            >
              {mutation.isPending
                ? "Working…"
                : mode === "sign_in"
                  ? "Sign In"
                  : "Create Account"}
            </Button>
            {mode === "sign_in" && (
              <div className="text-center text-xs">
                <Link
                  to="/auth/forgot-password"
                  className="text-muted-foreground underline underline-offset-2 hover:text-foreground"
                >
                  Forgot password?
                </Link>
              </div>
            )}
          </form>

          <div className="mt-5 text-sm text-muted-foreground">
            {mode === "sign_in" ? "Need an account?" : "Already have an account?"}{" "}
            <button
              type="button"
              className="font-medium text-foreground underline underline-offset-2"
              onClick={() => {
                setError(null);
                setMode(mode === "sign_in" ? "sign_up" : "sign_in");
              }}
            >
              {mode === "sign_in" ? "Create one" : "Sign in"}
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
