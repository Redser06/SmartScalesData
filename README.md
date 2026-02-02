# Smart Scales Tracker

A Next.js application for tracking weight and body composition data from smart scales, featuring an AI-powered chat assistant.

## Features

- **Weight Tracking Dashboard**: Visualize weight trends with interactive charts
- **Body Composition Metrics**: Track body fat %, muscle mass, BMI, visceral fat, and more
- **AI Chat Assistant**: Gemini 2.0-powered assistant that can:
  - Log new weight entries via natural language
  - Analyze your weight history and trends
  - Provide motivational feedback
- **CSV Import**: Import data from body fat scale CSV exports
- **Predictions**: View projected weight based on recent trends
- **Manual Entry Management**: Add and delete weight entries

## Tech Stack

- **Framework**: Next.js 16 with App Router
- **Database**: SQLite with Prisma ORM
- **AI**: Google Gemini 2.0 Flash via Vercel AI SDK v6
- **UI**: Tailwind CSS, Radix UI, Lucide Icons
- **Charts**: Recharts

## Getting Started

### Prerequisites

- Node.js 18+
- Google AI API key (for Gemini)

### Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/Redser06/SmartScalesData.git
   cd SmartScalesData/smart-scales-app
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Set up environment variables:
   ```bash
   cp .env.example .env
   ```

   Add your Google AI API key to `.env`:
   ```
   DATABASE_URL="file:./prisma/dev.db"
   GOOGLE_GENERATIVE_AI_API_KEY="your-api-key-here"
   ```

4. Initialize the database:
   ```bash
   npx prisma generate
   npx prisma db push
   ```

5. Run the development server:
   ```bash
   npm run dev
   ```

6. Open [http://localhost:3000](http://localhost:3000)

## Importing Data

Place your body fat scale CSV export in the project root and run the import script:

```bash
npx tsx scripts/import-csv.ts
```

## Project Structure

```
smart-scales-app/
├── src/
│   ├── app/
│   │   ├── api/chat/route.ts    # AI chat API endpoint
│   │   ├── actions.ts           # Server actions (CRUD)
│   │   └── page.tsx             # Main dashboard
│   ├── components/
│   │   ├── chat-interface.tsx   # AI chat widget
│   │   └── ui/                  # Shadcn UI components
│   └── lib/
│       ├── prisma.ts            # Database client
│       └── predictions.ts       # Weight projection logic
├── prisma/
│   └── schema.prisma            # Database schema
└── scripts/
    └── import-csv.ts            # CSV import script
```

## AI Chat Commands

The chat assistant understands natural language. Examples:

- "Log my weight as 95.5kg"
- "How much weight have I lost this month?"
- "Show me my recent entries"
- "What's my average weight this week?"

## License

MIT
