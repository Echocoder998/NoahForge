import { useState } from "react";
import { authClient } from "@/lib/auth/client";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { Button } from "@/components/ui/button";
import { Lab } from "./lab/shell";

export function CloudAccount() {
  const { user, isPending } = useCurrentUserState();
  const [signup, setSignup] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
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
          {error && (
            <p role="alert" className="text-sm text-magenta">
              {error}
            </p>
          )}
          <Button disabled={busy} type="submit">
            {busy ? "Please wait…" : signup ? "Create account" : "Sign in"}
          </Button>
        </form>
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
