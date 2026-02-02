# Smart Scales Tracker

A personal weight tracking application built with Next.js 16, featuring AI-powered insights and comprehensive body composition metrics.

## Features

- **Weight & Body Composition Tracking** - Log weight, BMI, body fat %, muscle mass, and more
- **AI Chat Assistant** - Get insights about your progress using Google Gemini
- **Secure Authentication** - Email/password login with NextAuth.js v5
- **Password Recovery** - Email-based password reset via Resend
- **Strong Password Validation** - Encourages passphrases (12+ characters)
- **Data Visualization** - Charts and trends for your metrics

## Tech Stack

- **Framework**: Next.js 16 (App Router)
- **Database**: SQLite with Prisma ORM
- **Authentication**: NextAuth.js v5 (JWT sessions)
- **Email**: Resend (transactional emails)
- **Styling**: Tailwind CSS
- **UI Components**: shadcn/ui

## Getting Started

### Prerequisites

- Node.js 18+
- npm or yarn

### Installation

1. Clone the repository:
   ```bash
   git clone <your-repo-url>
   cd smart-scales-app
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Set up environment variables:
   ```bash
   cp .env.example .env.local
   ```

   Edit `.env.local` and add:
   ```env
   AUTH_SECRET="<generate-with-openssl-rand-base64-32>"
   RESEND_API_KEY="re_xxxxx"  # Get from https://resend.com/api-keys
   GOOGLE_GENERATIVE_AI_API_KEY="<your-gemini-key>"  # Optional, for AI chat
   ```

4. Set up the database:
   ```bash
   npx prisma migrate dev
   ```

5. Run the development server:
   ```bash
   npm run dev
   ```

6. Open [http://localhost:3000](http://localhost:3000) and create an account.

## Authentication

The app includes a complete authentication system:

- **Sign up** (`/signup`) - Create account with email/password
- **Sign in** (`/login`) - Email/password login
- **Forgot password** (`/forgot-password`) - Request password reset email
- **Reset password** (`/reset-password/[token]`) - Set new password

### Password Requirements

- Minimum 12 characters
- No common passwords (password123, admin, etc.)
- Passphrases encouraged (e.g., "purple monkey dishwasher cloud")

## Project Structure

```
src/
├── app/
│   ├── api/auth/        # NextAuth API routes
│   ├── forgot-password/ # Password recovery
│   ├── login/           # Sign in page
│   ├── reset-password/  # Password reset page
│   ├── signup/          # Registration page
│   └── page.tsx         # Dashboard
├── lib/
│   ├── auth.ts          # NextAuth configuration
│   ├── email.ts         # Resend email service
│   ├── password.ts      # Password validation
│   └── prisma.ts        # Database client
└── proxy.ts             # Route protection
```

## License

Private - All rights reserved
