import { useEffect, useState } from "react";
import { authClient } from "@/lib/auth/client";
import { googleSignInStatus } from "@/lib/google-sign-in";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { Button } from "@/components/ui/button";
import { Lab } from "./lab/shell";

export function CloudAccount() {
  const { user, isPending } = useCurrentUserState();
  const [signup, setSignup] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    if (new URLSearchParams(window.location.search).has("error"))
      setError("Google sign-in did not complete. Try again or use email and password.");
  }, []);
  if (isPending)
    return (
      <main className="p-8" role="status">
        Loading your account…
      </main>
    );
  if (user) return <Lab key={user.id} />;
  return (
    <main className="grid min-h-screen place-items-center p-6">
      <section className="w-full max-w-sm rounded-xl border border-line bg-panel p-6">
        <img src="/precision-noah-forge.png" alt="Noah Forge" width={72} height={72} />
        <h1 className="mt-4 text-2xl font-semibold">
          {signup ? "Create your account" : "Sign in to Noah Forge"}
        </h1>
        <p className="my-4 text-sm text-dust">
          Your projects, designs, notes, and restore points are saved privately in the cloud and
          available on your other devices.
        </p>
        <Button
          className="mb-4 w-full"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            setError("");
            try {
              const status = await googleSignInStatus();
              if (!status.configured)
                throw new Error(
                  "Google sign-in is temporarily unavailable. Please use email and password.",
                );
              const result = await authClient.signIn.social({
                provider: "google",
                callbackURL: "/",
                errorCallbackURL: "/?error=google",
              });
              if (result.error)
                throw new Error(result.error.message || "Unable to start Google sign-in.");
            } catch (err) {
              setError(err instanceof Error ? err.message : "Unable to start Google sign-in.");
            } finally {
              setBusy(false);
            }
          }}
        >
          Continue with Google
        </Button>
        <p className="mb-4 text-center text-xs text-dust">or continue with email</p>
        <form
          className="grid gap-4"
          onSubmit={async (event) => {
            event.preventDefault();
            setBusy(true);
            setError("");
            const data = new FormData(event.currentTarget);
            const email = String(data.get("email"));
            const password = String(data.get("password"));
            try {
              const result = signup
                ? await authClient.signUp.email({ email, password, name: String(data.get("name")) })
                : await authClient.signIn.email({ email, password });
              if (result.error) throw new Error(result.error.message || "Sign-in failed.");
              window.location.assign("/");
            } catch (err) {
              setError(err instanceof Error ? err.message : "Unable to sign in.");
            } finally {
              setBusy(false);
            }
          }}
        >
          {signup && (
            <label className="grid gap-1 text-sm">
              Name
              <input
                className="rounded border border-line p-3"
                name="name"
                autoComplete="name"
                required
                maxLength={80}
              />
            </label>
          )}
          <label className="grid gap-1 text-sm">
            Email
            <input
              className="rounded border border-line p-3"
              name="email"
              type="email"
              autoComplete="email"
              required
            />
          </label>
          <label className="grid gap-1 text-sm">
            Password
            <input
              className="rounded border border-line p-3"
              name="password"
              type="password"
              minLength={8}
              maxLength={128}
              autoComplete={signup ? "new-password" : "current-password"}
              required
            />
          </label>
          <Button disabled={busy} type="submit">
            {busy ? "Please wait…" : signup ? "Create account" : "Sign in"}
          </Button>
        </form>
        {error && (
          <p role="alert" className="mt-4 text-sm text-magenta">
            {error}
          </p>
        )}
        <Button
          className="mt-4"
          variant="ghost"
          disabled={busy}
          onClick={() => {
            setSignup(!signup);
            setError("");
          }}
        >
          {signup ? "Already have an account? Sign in" : "New here? Create an account"}
        </Button>
      </section>
    </main>
  );
}
