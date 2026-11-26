"use client";

import { FormEvent, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { ArrowRight, Sparkles } from "lucide-react";

export default function LoginPage() {
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [isError, setIsError] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setMessage("");
    setIsError(false);

    try {
      const supabase = createClient();
      const result = mode === "signin"
        ? await supabase.auth.signInWithPassword({ email, password })
        : await supabase.auth.signUp({ email, password });

      if (result.error) throw result.error;

      if (mode === "signup" && !result.data.session) {
        setMessage("Account created. Check your email for the confirmation link, then sign in.");
        return;
      }

      window.location.assign("/");
    } catch (error) {
      setIsError(true);
      setMessage(error instanceof Error ? error.message : "Authentication failed. Try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#090c12] px-5 py-12 text-slate-100">
      <section className="w-full max-w-md">
        <div className="mb-8 flex items-center justify-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-violet-300/20 bg-violet-400/10 text-violet-200"><Sparkles size={20}/></div>
          <div><p className="text-sm font-semibold tracking-[0.18em]">SIDEKICK</p><p className="mt-1 text-[10px] tracking-[0.2em] text-slate-500">PERSONAL AI WORKSPACE</p></div>
        </div>

        <div className="rounded-3xl border border-white/10 bg-[#10151f] p-7 shadow-2xl shadow-black/30 sm:p-9">
          <h1 className="text-2xl font-medium">{mode === "signin" ? "Welcome back" : "Create your account"}</h1>
          <p className="mt-2 text-sm leading-6 text-slate-400">
            {mode === "signin" ? "Sign in to open your private workspace." : "Create an account to set up your private workspace."}
          </p>

          <form onSubmit={submit} className="mt-8 space-y-5">
            <label className="block text-xs font-medium text-slate-300">
              Email address
              <input
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className="mt-2 w-full rounded-xl border border-white/10 bg-[#0b1018] px-4 py-3 text-sm text-slate-100 outline-none transition placeholder:text-slate-600 focus:border-violet-300/40"
                placeholder="you@example.com"
              />
            </label>
            <label className="block text-xs font-medium text-slate-300">
              Password
              <input
                type="password"
                required
                minLength={8}
                autoComplete={mode === "signin" ? "current-password" : "new-password"}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="mt-2 w-full rounded-xl border border-white/10 bg-[#0b1018] px-4 py-3 text-sm text-slate-100 outline-none transition placeholder:text-slate-600 focus:border-violet-300/40"
                placeholder="At least 8 characters"
              />
            </label>

            {message && <p role="status" className={`rounded-xl border px-3 py-3 text-xs leading-5 ${isError ? "border-rose-400/20 bg-rose-400/[0.06] text-rose-200" : "border-emerald-400/20 bg-emerald-400/[0.06] text-emerald-200"}`}>{message}</p>}

            <button type="submit" disabled={loading} className="flex w-full items-center justify-center gap-2 rounded-xl bg-violet-300 px-4 py-3 text-sm font-semibold text-[#11111a] transition hover:bg-violet-200 disabled:cursor-not-allowed disabled:opacity-50">
              {loading ? "Please wait..." : mode === "signin" ? "Sign in" : "Create account"}
              {!loading && <ArrowRight size={16}/>}
            </button>
          </form>

          <div className="mt-6 border-t border-white/[0.07] pt-5 text-center text-xs text-slate-500">
            {mode === "signin" ? "New to Sidekick?" : "Already have an account?"}
            <button onClick={() => { setMode(mode === "signin" ? "signup" : "signin"); setMessage(""); }} className="ml-2 font-medium text-violet-200 hover:text-violet-100">
              {mode === "signin" ? "Create an account" : "Sign in"}
            </button>
          </div>
        </div>
        <p className="mt-5 text-center text-[10px] leading-5 text-slate-600">Your workspace is private to your account. Keep your password and API keys confidential.</p>
      </section>
    </main>
  );
}
