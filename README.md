# Ghost Content Agent for Style Me Pretty

## TL;DR

An AI-powered content automation system for Pretty Perspectives by Style Me Pretty. It reads vendor interviews from Google Docs, generates articles matching SMP's brand voice, and publishes drafts to Ghost CMS. Runs automatically every Monday at 9am ET, creating 3 articles: one SEO piece, one theme-based article, and one interview profile (if new interviews exist).

```bash
# Run manually anytime
cd /Users/frankie_macbook/ghostautomation && npm run weekly

# Or generate a single article
npm run dev -- interview <google-doc-id>
```

---

## What It Does

### Weekly Automation (Mondays 9am ET)
1. **SEO Article** - Researches current trends and creates timely, actionable content
   - Odd weeks: General business topics (marketing, pricing, systems)
   - Even weeks: Vendor-specific topics (photographers, planners, florists)

2. **Theme Article** - Analyzes all interviews, finds common themes, and creates insight pieces

3. **Interview Profile** - If there's a new interview in Google Drive, generates a vendor spotlight

### Smart Duplicate Detection
- Checks ALL existing Ghost articles (drafts + published)
- Skips topics already covered
- Skips interviews that already have articles
- Tracks processed interviews to avoid duplicates

### Brand Voice
- Matches Style Me Pretty's warm, professional tone
- Uses proper Ghost HTML formatting (callout cards, CTAs, image placeholders)
- Includes Style Me Pretty vendor directory CTAs
- Never mentions competitors (The Knot, WeddingWire, Zola, Brides)

---

## Commands

```bash
# Weekly generation (all 3 article types)
npm run weekly

# Generate from specific interview
npm run dev -- interview <google-doc-id>

# Find themes across interviews
npm run dev -- themes

# Create theme roundup
npm run dev -- themes --create

# Generate SEO article
npm run dev -- seo "Your topic here"

# Interactive chat mode
npm run dev -- chat

# List available interviews
npm run dev -- ideas

# Check existing Ghost articles
npm run dev -- existing

# Preview without creating (dry run)
npm run dev -- interview <id> --dry-run
```

---

## Project Structure

```
ghostautomation/
├── src/
│   ├── index.ts              # CLI entry point
│   ├── chat.ts               # Interactive chat mode
│   ├── weekly-scheduler.ts   # Monday automation script
│   ├── services/
│   │   ├── google-docs.ts    # Google Docs/Drive API
│   │   ├── ghost.ts          # Ghost Admin API
│   │   ├── ai.ts             # Claude API for content generation
│   │   └── research.ts       # Web research with competitor blocklist
│   ├── generators/
│   │   ├── interview-profile.ts   # Vendor spotlight articles
│   │   ├── theme-roundup.ts       # Multi-interview theme pieces
│   │   ├── insight-article.ts     # Quote-based research articles
│   │   └── seo-content.ts         # SEO-focused how-to content
│   ├── types/
│   │   └── index.ts          # TypeScript types
│   └── utils/
│       ├── blocklist.ts      # Competitor domain filtering
│       └── metadata.ts       # Slug, excerpt, tag helpers
├── config/
│   ├── blocklist.json        # Competitor domains to exclude
│   ├── brand-voice.md        # Style Me Pretty voice guide
│   ├── prompts/              # AI prompt templates
│   │   ├── interview-profile.txt
│   │   ├── theme-roundup.txt
│   │   ├── insight-article.txt
│   │   └── seo-content.txt
│   ├── google-token.json     # OAuth token (auto-generated)
│   ├── processed-interviews.json  # Tracking file
│   └── week-counter.json     # Week number tracking
├── dist/                     # Compiled JavaScript
├── logs/                     # Weekly run logs
├── .env                      # API keys and config
└── com.stylemepretty.ghost-agent.plist  # macOS scheduler
```

---

## Configuration (.env)

```env
# Ghost CMS
GHOST_URL=https://pretty-perspectives-by-stylemepretty.ghost.io
GHOST_ADMIN_API_KEY=your-admin-api-key

# Google OAuth
GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-client-secret
GOOGLE_TOKEN_PATH=./config/google-token.json
GOOGLE_INTERVIEWS_FOLDER_ID=your-folder-id

# Anthropic (Claude API)
ANTHROPIC_API_KEY=your-anthropic-key

# Research (optional)
TAVILY_API_KEY=your-tavily-key
```

---

## Schedule Setup (macOS)

The weekly automation is configured to run every Monday at 9am ET.

```bash
# Install the scheduled job
cp com.stylemepretty.ghost-agent.plist ~/Library/LaunchAgents/

# Load it
launchctl load ~/Library/LaunchAgents/com.stylemepretty.ghost-agent.plist

# Verify it's running
launchctl list | grep stylemepretty

# Unload if needed
launchctl unload ~/Library/LaunchAgents/com.stylemepretty.ghost-agent.plist
```

Logs are written to:
- `logs/weekly.log` - Standard output
- `logs/weekly-error.log` - Errors

---

## Article Formats

### Interview Profile
- TL;DR callout card at top
- Origin story section
- Philosophy/approach (with quotes)
- Advice for vendors
- Style Me Pretty CTA block
- Closing section

### SEO Article
- TL;DR callout card
- Why this matters section
- 3-5 actionable strategies
- Style Me Pretty CTA block
- Key takeaways

### Theme Roundup
- TL;DR callout card
- Multiple vendor quotes per insight
- Cross-interview analysis
- Practical applications

---

## Competitor Blocklist

Research excludes these domains (config/blocklist.json):
- theknot.com
- weddingwire.com
- zola.com
- brides.com
- marthastewartweddings.com
- And others...

---

## Troubleshooting

### Google Auth Issues
If you get auth errors, delete `config/google-token.json` and run any command - it will re-prompt for browser authorization.

### Ghost API Errors
Verify your Ghost URL matches exactly where you access the admin panel. The API key should be from Settings → Integrations → Custom Integration.

### Missing Interviews
Make sure the Google Drive folder ID is correct and the OAuth account has access to the folder.

---

## Built With
- **Claude API** (Anthropic) - Content generation
- **Ghost Admin API** - Publishing
- **Google Docs/Drive API** - Interview source
- **Tavily API** - Web research (optional)
- **TypeScript/Node.js** - Runtime
