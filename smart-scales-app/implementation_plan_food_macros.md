# Implementation Plan: Food & Macro Tracking with OpenFoodFacts & NLP

## 1. Objective
Enable users to log their daily food intake using natural language. The system will automatically parse food items, look up nutritional data (calories, protein, fats, carbs) from the Open Food Facts API, and visualize consumption behaviors and macro trends over time.

## 2. Architecture & Technologies
- **Database**: Prisma (SQLite for local dev) to store nutrition logs.
- **External API**: [Open Food Facts JSON API](https://openfoodfacts.github.io/openfoodfacts-server/api/).
- **AI/NLP**: Google Gemini (via Vercel AI SDK) to parse user natural language inputs (e.g., "I ate 2 eggs and a slice of toast") into search queries, and then select the best match from API results.
- **Frontend**: Next.js + Tailwind CSS.
- **Visualization**: `recharts` for graphs (Daily Macros, Consumption Frequency).

## 3. Database Schema Design (Prisma)

We need a new model to track food entries.

```prisma
// Add to prisma/schema.prisma

model NutritionEntry {
  id        String   @id @default(cuid())
  userId    String
  timestamp DateTime @default(now())
  
  // Food Details
  foodName      String   // The user's term or API product name
  brandName     String?  // Optional brand
  servingSize   String?  // e.g., "100g", "1 slice"
  servingCount  Float    @default(1.0)
  
  // Macros (per total entry, or normalized? Storing calculated totals is usually easier for querying)
  calories      Float    // kcal
  protein       Float    // g
  carbohydrates Float    // g
  fats          Float    // g
  fiber         Float?   // g (optional)
  sugar         Float?   // g (optional)
  
  // Meta
  sourceId      String?  // OpenFoodFacts barcode/ID if available
  tags          String?  // Comma-separated or JSON array of tags (e.g., "breakfast", "dairy", "high-protein")
  
  user          User     @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId])
  @@index([timestamp])
}
```

## 4. API & AI Integration Strategy

### A. Open Food Facts Utility (`src/lib/openfoodfacts.ts`)
Create helper functions to interface with the API.
- `searchProduct(query: string)`: Calls `https://world.openfoodfacts.org/cgi/search.pl?search_terms=...&json=1`.
- `getProductDetails(id: string)`: Fetches specific macro data if search is insufficient.

### B. NLP Pipeline (in `src/app/api/chat/route.ts`)
We will add a new tool `logFood` or enhance the existing system prompt. A better approach for "finding the best match" is an interactive tool loop:
1. **User**: "I had a bowl of cheerios with milk."
2. **AI**: Parses to ["Cheerios", "Milk"].
3. **Tool (`searchFood`)**: Searches OpenFoodFacts for "Cheerios" and "Milk". Returns top 3 hits for each with macros.
4. **AI**: Selects the most likely matches (e.g., "General Mills Cheerios" and "Whole Milk") or asks user for clarification if ambiguous.
5. **AI**: Calls `saveNutritionLog` with the calculated macros.

For this MVP, we will aim for **Best Match Auto-Selection** by the AI to reduce friction, unless confidence is low.

## 5. UI Features

### A. Input Interface
- A conversational or form-based input where users type their meal.
- "Smart Log" button.

### B. Dashboard / Analytics (`src/components/analytics/`)
1. **Macro History (Time Series)**:
   - Line/Bar chart showing Calories, Protein, Carbs, Fat over time (Day/Week/Month).
   - Use `recharts` `<BarChart>` or `<AreaChart>`.
2. **Common Foods (Frequency)**:
   - "Graph view of most common foodstuffs".
   - A Node Graph or simple Bar Chart showing most frequently logged `foodName`.
   - Tag cloud or Pie chart for tags (e.g., "Breakfast", "Snack").

## 6. Implementation Steps

### Phase 1: Database & Backend
1. Modify `prisma/schema.prisma` to add `NutritionEntry`.
2. Run `npx prisma migrate dev --name add_nutrition_entry`.
3. Create `src/lib/openfoodfacts.ts` implementation.

### Phase 2: AI Logic
1. Update `src/app/api/chat/route.ts` to include `lookupNutrition` tool.
2. Implement logic to extract macros from API response (handling 100g normalization vs user serving size).

### Phase 3: Frontend Visualization
1. Create `NutritionDashboard.tsx`.
2. Implement `DailyMacrosChart` component.
3. Implement `FoodFrequencyChart` component.
4. Integrate these into the user's main dashboard or a `/nutrition` page.

## 7. Next Actions
- Approve this plan?
- Do you want to try to infer serving sizes (complex) or default to "1 serving / 100g" for now?
