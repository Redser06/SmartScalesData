"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Scale, Mail, Lock, User, Info } from "lucide-react";
import { registerUser } from "./actions";
import {
  validatePassword,
  getPasswordStrengthLabel,
  getPasswordStrengthColor,
} from "@/lib/password";

export default function SignupPage() {
  const router = useRouter();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const passwordValidation = useMemo(
    () => validatePassword(password),
    [password]
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    if (!passwordValidation.valid) {
      setError(passwordValidation.errors[0] || "Please choose a stronger password");
      setLoading(false);
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match");
      setLoading(false);
      return;
    }

    try {
      const result = await registerUser({ name, email, password });

      if (result.error) {
        setError(result.error);
      } else {
        router.push("/login?registered=true");
      }
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-black flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-zinc-900 border border-zinc-800 rounded-xl p-8">
        <div className="text-center mb-8">
          <div className="mx-auto h-12 w-12 rounded-full bg-indigo-500/10 flex items-center justify-center mb-4">
            <Scale className="h-6 w-6 text-indigo-400" />
          </div>
          <h1 className="text-2xl font-bold text-white">Create Account</h1>
          <p className="text-zinc-400 mt-1">Start tracking your weight loss journey</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="p-3 text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg">
              {error}
            </div>
          )}

          <div className="space-y-2">
            <label className="text-sm text-zinc-400">Name</label>
            <div className="relative">
              <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
              <Input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="John Doe"
                className="pl-10 bg-zinc-800 border-zinc-700 text-white"
                required
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm text-zinc-400">Email</label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="pl-10 bg-zinc-800 border-zinc-700 text-white"
                required
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm text-zinc-400">Password</label>
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
                placeholder="Confirm your password"
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
            {loading ? "Creating account..." : "Create Account"}
          </Button>
        </form>

        <div className="mt-6 text-center text-sm text-zinc-400">
          Already have an account?{" "}
          <Link href="/login" className="text-indigo-400 hover:text-indigo-300">
            Sign in
          </Link>
        </div>
      </div>
    </div>
  );
}
