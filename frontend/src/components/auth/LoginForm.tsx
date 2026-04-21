"use client";

import { useState } from "react";
import { signIn } from "aws-amplify/auth";
import { AlertCircle, ArrowRight, Loader2 } from "lucide-react";

interface LoginFormProps {
  onLogin: () => void;
}

export default function LoginForm({ onLogin }: LoginFormProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    if (loading) return;
    setError("");
    setLoading(true);
    try {
      const { isSignedIn } = await signIn({ username: email, password });
      if (isSignedIn) {
        setTimeout(() => onLogin(), 100);
      } else {
        setError("Sign-in incomplete. Check your credentials.");
      }
    } catch (err: unknown) {
      console.error("Login error:", err);
      const message = err instanceof Error ? err.message : "An error occurred during login.";
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="notiver-canvas min-h-screen flex items-center justify-center px-4"
      style={{ background: "var(--surface-0)" }}
    >
      <div
        className="w-full max-w-[380px] rounded-[14px] p-8"
        style={{
          background: "var(--surface-1)",
          border: "1px solid var(--line-1)",
          boxShadow: "var(--shadow-3)",
        }}
      >
        {/* Brand */}
        <div className="flex items-center gap-3 mb-8">
          <div
            className="w-10 h-10 rounded-[10px] grid place-items-center text-[15px] font-semibold"
            style={{
              background: "linear-gradient(145deg, #6366f1 0%, #4f46e5 100%)",
              color: "white",
              boxShadow: "0 6px 20px -8px var(--accent-ring), inset 0 1px 0 rgba(255,255,255,0.18)",
            }}
          >
            N
          </div>
          <div>
            <div className="text-[15px] font-semibold" style={{ color: "var(--text-0)", letterSpacing: "-0.01em" }}>
              Notiver
            </div>
            <div className="text-[10.5px] uppercase tracking-[0.16em]" style={{ color: "var(--text-3)" }}>
              Cross-event intelligence
            </div>
          </div>
        </div>

        <h1 className="text-[20px] font-semibold mb-1" style={{ color: "var(--text-0)", letterSpacing: "-0.01em" }}>
          Welcome back
        </h1>
        <p className="text-[13px] mb-6" style={{ color: "var(--text-2)" }}>
          Sign in to your intelligence workspace.
        </p>

        <form
          className="space-y-3"
          onSubmit={(e) => { e.preventDefault(); handleLogin(); }}
        >
          <label className="block">
            <span className="block text-[11px] font-semibold uppercase tracking-[0.14em] mb-1.5" style={{ color: "var(--text-3)" }}>
              Email
            </span>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="w-full h-10 px-3 rounded-[10px] text-[13.5px] outline-none transition-colors"
              style={{
                background: "var(--surface-2)",
                color: "var(--text-0)",
                border: "1px solid var(--line-2)",
              }}
            />
          </label>

          <label className="block">
            <span className="block text-[11px] font-semibold uppercase tracking-[0.14em] mb-1.5" style={{ color: "var(--text-3)" }}>
              Password
            </span>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full h-10 px-3 rounded-[10px] text-[13.5px] outline-none transition-colors"
              style={{
                background: "var(--surface-2)",
                color: "var(--text-0)",
                border: "1px solid var(--line-2)",
              }}
            />
          </label>

          {error && (
            <div
              className="flex items-start gap-2 px-3 py-2.5 rounded-[10px] text-[12.5px]"
              style={{ background: "var(--danger-soft)", color: "var(--danger)" }}
            >
              <AlertCircle size={13} strokeWidth={2} className="mt-[1px] shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full h-10 rounded-[10px] text-[13.5px] font-semibold inline-flex items-center justify-center gap-2 transition-transform hover:-translate-y-[1px] disabled:opacity-60 disabled:cursor-not-allowed disabled:translate-y-0"
            style={{
              background: "var(--accent)",
              color: "white",
              boxShadow: "0 8px 20px -10px var(--accent-ring)",
            }}
          >
            {loading ? (
              <><Loader2 size={14} strokeWidth={2.25} className="animate-spin" /> Signing in…</>
            ) : (
              <>Sign in <ArrowRight size={13} strokeWidth={2.25} /></>
            )}
          </button>
        </form>

        <p className="text-[11.5px] mt-6 text-center" style={{ color: "var(--text-4)" }}>
          Protected by AWS Cognito · Notiver CEIMS
        </p>
      </div>
    </div>
  );
}
