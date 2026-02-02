export interface PasswordValidationResult {
  valid: boolean;
  score: number; // 0-4 (0 = weak, 4 = strong)
  errors: string[];
  suggestions: string[];
}

const COMMON_PASSWORDS = [
  "password", "123456", "password123", "admin", "letmein",
  "welcome", "monkey", "dragon", "master", "qwerty",
  "login", "passw0rd", "hello", "freedom", "whatever",
];

export function validatePassword(password: string): PasswordValidationResult {
  const errors: string[] = [];
  const suggestions: string[] = [];
  let score = 0;

  // Minimum length check (passphrases should be longer)
  if (password.length < 12) {
    errors.push("Password must be at least 12 characters");
  } else {
    score += 1;
  }

  // Bonus for longer passwords (encouraging passphrases)
  if (password.length >= 16) {
    score += 1;
  }
  if (password.length >= 20) {
    score += 1;
  }

  // Check for common passwords
  if (COMMON_PASSWORDS.some(common =>
    password.toLowerCase().includes(common)
  )) {
    errors.push("Password contains a common word or pattern");
  }

  // Check for basic variety (not all same case or all numbers)
  const hasLower = /[a-z]/.test(password);
  const hasUpper = /[A-Z]/.test(password);
  const hasNumber = /[0-9]/.test(password);
  const hasSpace = /\s/.test(password);

  // Encourage passphrases with spaces
  if (hasSpace && password.length >= 16) {
    score += 1;
    suggestions.push("Great! Using a passphrase with spaces is excellent for security.");
  }

  // Check for some variety
  if (hasLower && hasUpper) {
    score = Math.min(4, score + 0.5);
  }
  if (hasNumber) {
    score = Math.min(4, score + 0.5);
  }

  // Suggestions for improvement
  if (password.length < 16 && !hasSpace) {
    suggestions.push("Try a passphrase: 3-4 random words like \"correct horse battery staple\"");
  }
  if (password.length >= 12 && password.length < 16) {
    suggestions.push("Longer is better - aim for 16+ characters");
  }

  // Final score calculation
  score = Math.floor(Math.min(4, score));

  return {
    valid: errors.length === 0 && password.length >= 12,
    score,
    errors,
    suggestions: errors.length === 0 ? suggestions : [],
  };
}

export function getPasswordStrengthLabel(score: number): string {
  switch (score) {
    case 0: return "Very Weak";
    case 1: return "Weak";
    case 2: return "Fair";
    case 3: return "Strong";
    case 4: return "Very Strong";
    default: return "Unknown";
  }
}

export function getPasswordStrengthColor(score: number): string {
  switch (score) {
    case 0: return "bg-red-500";
    case 1: return "bg-orange-500";
    case 2: return "bg-yellow-500";
    case 3: return "bg-lime-500";
    case 4: return "bg-emerald-500";
    default: return "bg-zinc-500";
  }
}
