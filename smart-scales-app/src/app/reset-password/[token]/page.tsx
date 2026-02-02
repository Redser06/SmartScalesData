"use client";

import { useState, useEffect, useMemo, use } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Scale, Lock, ArrowLeft, AlertCircle, Info } from "lucide-react";
import { verifyResetToken, resetPassword } from "@/app/forgot-password/actions";
import {
  validatePassword,
  getPasswordStrengthLabel,
  getPasswordStrengthColor,
} from "@/lib/password";

interface PageProps {
  params: Promise<{ token: string }>;
}

export default function ResetPasswordPage({ params }: PageProps) {
  const { token } = use(params);
  const router = useRouter();

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [verifying, setVerifying] = useState(true);
  const [tokenValid, setTokenValid] = useState(false);
  const [tokenError, setTokenError] = useState("");

  const passwordValidation = useMemo(
    () => validatePassword(password),
    [password]
  );

  useEffect(() => {
    async function checkToken() {
      const result = await verifyResetToken(token);
      setVerifying(false);
      if (result.valid) {
        setTokenValid(true);
      } else {
        setTokenError(result.error || "Invalid reset link");
      }
    }
    checkToken();
  }, [token]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!passwordValidation.valid) {
      setError(passwordValidation.errors[0] || "Please choose a stronger password");
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    setLoading(true);

    try {
      const result = await resetPassword(token, password);

      if (result.error) {
        setError(result.error);
      } else {
        router.push("/login?reset=true");
      }
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  if (verifying) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center p-4">
        <div className="w-full max-w-md bg-zinc-900 border border-zinc-800 rounded-xl p-8 text-center">
          <div className="animate-pulse">
            <div className="mx-auto h-12 w-12 rounded-full bg-zinc-800 mb-4" />
            <div className="h-6 bg-zinc-800 rounded w-3/4 mx-auto mb-2" />
            <div className="h-4 bg-zinc-800 rounded w-1/2 mx-auto" />
          </div>
        </div>
      </div>
    );
  }

  if (!tokenValid) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center p-4">
        <div className="w-full max-w-md bg-zinc-900 border border-zinc-800 rounded-xl p-8">
          <div className="text-center mb-6">
            <div className="mx-auto h-12 w-12 rounded-full bg-red-500/10 flex items-center justify-center mb-4">
              <AlertCircle className="h-6 w-6 text-red-400" />
            </div>
            <h1 className="text-2xl font-bold text-white">Invalid Link</h1>
            <p className="text-zinc-400 mt-2">{tokenError}</p>
          </div>
          <Link href="/forgot-password">
            <Button className="w-full bg-indigo-600 hover:bg-indigo-700">
              Request New Reset Link
            </Button>
          </Link>
          <div className="mt-4 text-center">
            <Link href="/login" className="text-sm text-indigo-400 hover:text-indigo-300">
              Back to Sign In
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-zinc-900 border border-zinc-800 rounded-xl p-8">
        <div className="text-center mb-8">
          <div className="mx-auto h-12 w-12 rounded-full bg-indigo-500/10 flex items-center justify-center mb-4">
            <Scale className="h-6 w-6 text-indigo-400" />
          </div>
          <h1 className="text-2xl font-bold text-white">Set New Password</h1>
          <p className="text-zinc-400 mt-1">Choose a strong passphrase</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="p-3 text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg">
              {error}
            </div>
          )}

          <div className="space-y-2">
            <label className="text-sm text-zinc-400">New Password</label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Use a passphrase: 3-4 random words"
                className="pl-10 bg-zinc-800 border-zinc-700 text-white"
                required
              />
            </div>

            {/* Password strength indicator */}
            {password.length > 0 && (
              <div className="space-y-2 mt-2">
                <div className="flex gap-1">
                  {[0, 1, 2, 3].map((i) => (
                    <div
                      key={i}
                      className={`h-1 flex-1 rounded-full transition-colors ${
                        i < passwordValidation.score
                          ? getPasswordStrengthColor(passwordValidation.score)
                          : "bg-zinc-700"
                      }`}
                    />
                  ))}
                </div>
                <div className="flex justify-between items-center text-xs">
                  <span className="text-zinc-500">
                    {getPasswordStrengthLabel(passwordValidation.score)}
                  </span>
                  <span className="text-zinc-500">{password.length} characters</span>
                </div>

                {/* Errors */}
                {passwordValidation.errors.length > 0 && (
                  <div className="text-xs text-red-400">
                    {passwordValidation.errors[0]}
                  </div>
                )}

                {/* Suggestions */}
                {passwordValidation.suggestions.length > 0 && (
                  <div className="text-xs text-zinc-400 flex items-start gap-1">
                    <Info className="h-3 w-3 mt-0.5 shrink-0" />
                    <span>{passwordValidation.suggestions[0]}</span>
                  </div>
                )}
              </div>
            )}

            {/* Passphrase hint when field is empty */}
            {password.length === 0 && (
              <p className="text-xs text-zinc-500 mt-1">
                Tip: Use a passphrase like &quot;purple monkey dishwasher cloud&quot;
              </p>
            )}
          </div>

          <div className="space-y-2">
            <label className="text-sm text-zinc-400">Confirm Password</label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
              <Input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Confirm your new password"
                className="pl-10 bg-zinc-800 border-zinc-700 text-white"
                required
              />
            </div>
            {confirmPassword.length > 0 && password !== confirmPassword && (
              <p className="text-xs text-red-400">Passwords do not match</p>
            )}
          </div>

          <Button
            type="submit"
            disabled={loading || !passwordValidation.valid}
            className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50"
          >
            {loading ? "Resetting..." : "Reset Password"}
          </Button>
        </form>

        <div className="mt-6 text-center">
          <Link
            href="/login"
            className="text-sm text-zinc-400 hover:text-zinc-300 inline-flex items-center"
          >
            <ArrowLeft className="h-4 w-4 mr-1" />
            Back to Sign In
          </Link>
        </div>
      </div>
    </div>
  );
}
