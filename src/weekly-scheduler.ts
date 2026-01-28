#!/usr/bin/env node

import { config } from 'dotenv';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

config();

import { initGoogleClients, listInterviews, getAllInterviewsWithContent } from './services/google-docs.js';
import { initGhostClient, getExistingArticles } from './services/ghost.js';
import { initAIClient, analyzeInterviewsForThemes, chat } from './services/ai.js';
import { initResearchService, researchTopic, searchWeb } from './services/research.js';
import { generateFromInterview } from './generators/interview-profile.js';
import { generateFromInsight } from './generators/insight-article.js';
import { generateSEOContent } from './generators/seo-content.js';
import type { ExistingArticle } from './types/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const PROCESSED_FILE = join(__dirname, '../config/processed-interviews.json');
const WEEK_COUNTER_FILE = join(__dirname, '../config/week-counter.json');

function loadProcessedInterviews(): Set<string> {
  if (existsSync(PROCESSED_FILE)) {
    const data = JSON.parse(readFileSync(PROCESSED_FILE, 'utf-8'));
    return new Set(data.processed || []);
  }
  return new Set();
}

function saveProcessedInterview(id: string): void {
  const processed = loadProcessedInterviews();
  processed.add(id);
  writeFileSync(PROCESSED_FILE, JSON.stringify({ processed: Array.from(processed) }, null, 2));
}

function getWeekCounter(): number {
  if (existsSync(WEEK_COUNTER_FILE)) {
    const data = JSON.parse(readFileSync(WEEK_COUNTER_FILE, 'utf-8'));
    return data.week || 0;
  }
  return 0;
}

function incrementWeekCounter(): number {
  const week = getWeekCounter() + 1;
  writeFileSync(WEEK_COUNTER_FILE, JSON.stringify({ week, lastRun: new Date().toISOString() }, null, 2));
  return week;
}

// Check if a topic is too similar to existing articles
function isTopicAlreadyCovered(topic: string, existingArticles: ExistingArticle[]): boolean {
  const topicLower = topic.toLowerCase();

  // Key phrases that indicate the same topic
  const topicKeyPhrases = extractKeyPhrases(topicLower);

  for (const article of existingArticles) {
    const titleLower = article.title.toLowerCase();
    const titleKeyPhrases = extractKeyPhrases(titleLower);

    // Check for exact key phrase matches
    const matchingPhrases = topicKeyPhrases.filter(phrase =>
      titleKeyPhrases.some(tp => tp === phrase || tp.includes(phrase) || phrase.includes(tp))
    );

    // Need at least 2 matching key phrases to consider it a duplicate
    if (matchingPhrases.length >= 2) {
      console.log(`  ⚠ Topic "${topic}" similar to existing: "${article.title}"`);
      return true;
    }

    // Also check if titles are very similar (>60% word overlap)
    const topicWords = topicLower.split(/\s+/).filter(w => w.length > 4);
    const titleWords = titleLower.split(/\s+/).filter(w => w.length > 4);
    const wordMatches = topicWords.filter(w => titleWords.includes(w)).length;

    if (topicWords.length > 0 && wordMatches / topicWords.length > 0.6) {
      console.log(`  ⚠ Topic "${topic}" similar to existing: "${article.title}"`);
      return true;
    }
  }
  return false;
}

function extractKeyPhrases(text: string): string[] {
  const phrases: string[] = [];

  // Extract meaningful 2-3 word phrases
  const keyTerms = [
    'instagram', 'tiktok', 'social media', 'marketing', 'pricing',
    'client experience', 'vendor relationships', 'wedding photography',
    'wedding planner', 'florist', 'venue', 'videography', 'catering',
    'referrals', 'booking', 'leads', 'seo', 'email marketing',
    'portfolio', 'branding', 'networking', 'collaboration', 'trends',
    'gen z', 'millennial', 'ai tools', 'automation', 'systems'
  ];

  for (const term of keyTerms) {
    if (text.includes(term)) {
      phrases.push(term);
    }
  }

  return phrases;
}

async function initServices(): Promise<boolean> {
  try {
    initGhostClient({
      url: process.env.GHOST_URL!,
      key: process.env.GHOST_ADMIN_API_KEY!,
    });

    await initGoogleClients({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      tokenPath: process.env.GOOGLE_TOKEN_PATH || './config/google-token.json',
      interviewsFolderId: process.env.GOOGLE_INTERVIEWS_FOLDER_ID!,
    });

    initAIClient(process.env.ANTHROPIC_API_KEY!);
    initResearchService(process.env.TAVILY_API_KEY);

    return true;
  } catch (error) {
    console.error('Failed to initialize services:', error);
    return false;
  }
}

async function researchCurrentTrends(weekNumber: number): Promise<{ topic: string; keywords: string[]; research: string }> {
  console.log('  Researching current wedding industry trends...');

  const isVendorSpecificWeek = weekNumber % 2 === 0;

  // Research queries for fresh, specific content
  const generalQueries = [
    'wedding industry marketing trends 2026',
    'Instagram algorithm changes wedding vendors 2026',
    'TikTok wedding business growth strategies',
    'wedding vendor SEO updates 2026',
    'AI tools for wedding professionals',
    'wedding client communication apps trends',
  ];

  const vendorQueries = [
    'wedding photography business trends 2026',
    'wedding planner software tools new',
    'florist business sustainability trends weddings',
    'wedding venue marketing digital strategies',
    'videography trends wedding films 2026',
  ];

  const queries = isVendorSpecificWeek ? vendorQueries : generalQueries;
  const queryIndex = Math.floor((weekNumber / 2) % queries.length);
  const query = queries[queryIndex];

  // Do actual research
  const researchResults = await searchWeb(query, 5);

  let research = '';
  if (researchResults.length > 0) {
    research = researchResults.map(r => `[${r.source}]: ${r.title}\n${r.snippet}`).join('\n\n');
  }

  // Use AI to generate a specific, timely topic based on research
  const topicPrompt = `Based on this recent research about wedding industry trends, suggest ONE specific, actionable article topic for wedding vendors.

The topic should be:
- Specific and timely (not generic advice)
- Focused on a real platform update, trend, or strategy
- Actionable for wedding vendors
- NOT about: generic social media tips, basic pricing, or general business advice

Research:
${research || 'No specific research available - focus on recent 2026 trends'}

${isVendorSpecificWeek ? 'Focus on a SPECIFIC vendor type (photographer, planner, florist, etc.)' : 'Focus on GENERAL business growth applicable to all wedding vendors'}

Return ONLY a JSON object like: {"topic": "Your specific topic title", "keywords": ["keyword1", "keyword2", "keyword3"]}`;

  const response = await chat([{ role: 'user', content: topicPrompt }]);

  try {
    const match = response.match(/\{[\s\S]*\}/);
    if (match) {
      const parsed = JSON.parse(match[0]);
      return { topic: parsed.topic, keywords: parsed.keywords || [], research };
    }
  } catch (e) {
    console.log('  Could not parse AI topic suggestion, using fallback');
  }

  // Fallback
  return {
    topic: isVendorSpecificWeek
      ? 'How Wedding Photographers Can Use AI Editing Tools to Scale in 2026'
      : 'The 2026 Guide to Instagram Reels for Wedding Vendors',
    keywords: ['wedding marketing', '2026 trends'],
    research
  };
}

async function generateWeeklySEO(weekNumber: number, existingArticles: ExistingArticle[]): Promise<void> {
  console.log('\n📝 Generating SEO Article...');

  // Research current trends for a timely topic
  const { topic, keywords, research } = await researchCurrentTrends(weekNumber);

  // Check if similar topic already exists
  if (isTopicAlreadyCovered(topic, existingArticles)) {
    console.log('  Generating alternative topic...');
    // Try with different week number to get different topic
    const alt = await researchCurrentTrends(weekNumber + 10);
    if (isTopicAlreadyCovered(alt.topic, existingArticles)) {
      console.log('  ⚠ Skipping SEO article - similar topics already covered');
      return;
    }
  }

  console.log(`  Topic: ${topic}`);
  console.log(`  Keywords: ${keywords.join(', ')}`);

  const result = await generateSEOContent(topic, keywords, { verbose: true });

  if (result.success) {
    console.log(`  ✓ ${result.message}`);
    if (result.articleUrl) console.log(`  URL: ${result.articleUrl}`);
  } else {
    console.log(`  ⚠ Failed: ${result.message}`);
  }
}

async function generateThemeArticle(existingArticles: ExistingArticle[]): Promise<void> {
  console.log('\n🎨 Generating Theme-Based Article...');

  const folderId = process.env.GOOGLE_INTERVIEWS_FOLDER_ID!;
  const interviews = await getAllInterviewsWithContent(folderId);

  if (interviews.length < 2) {
    console.log('  ⚠ Not enough interviews for theme analysis');
    return;
  }

  // Get themes
  const themes = await analyzeInterviewsForThemes(interviews);

  if (themes.length === 0) {
    console.log('  ⚠ No themes discovered');
    return;
  }

  // Find a theme that hasn't been covered
  let selectedTheme: string | null = null;
  for (const theme of themes) {
    if (!isTopicAlreadyCovered(theme, existingArticles)) {
      selectedTheme = theme;
      break;
    }
  }

  if (!selectedTheme) {
    console.log('  ⚠ All discovered themes already covered in existing articles');
    return;
  }

  console.log(`  Theme: "${selectedTheme}"`);

  // Research the theme for more depth
  const researchContext = await researchTopic(selectedTheme + ' wedding industry');

  const result = await generateFromInsight(
    selectedTheme,
    'wedding industry leaders',
    { verbose: true }
  );

  if (result.success) {
    // Verify the article has a title
    if (result.message.includes('""') || result.message.includes(': ""')) {
      console.log('  ⚠ Article created but title may be missing - check Ghost admin');
    }
    console.log(`  ✓ ${result.message}`);
    if (result.articleUrl) console.log(`  URL: ${result.articleUrl}`);
  } else {
    console.log(`  ⚠ Failed: ${result.message}`);
  }
}

async function generateNewInterviewArticle(existingArticles: ExistingArticle[]): Promise<void> {
  console.log('\n👤 Checking for New Interviews...');

  const folderId = process.env.GOOGLE_INTERVIEWS_FOLDER_ID!;
  const interviews = await listInterviews(folderId);
  const processed = loadProcessedInterviews();

  // Get all existing article titles (including drafts) to check for duplicates
  const existingTitles = existingArticles.map(a => a.title.toLowerCase());

  // Find unprocessed interviews that don't already have articles
  const newInterviews = interviews.filter(interview => {
    // Skip if already processed
    if (processed.has(interview.id)) {
      return false;
    }

    // Extract vendor name from title (e.g., "Michele Interview" -> "Michele")
    const vendorName = interview.title.replace(/\s*interview\s*/i, '').trim().toLowerCase();

    // Check if any existing article mentions this vendor
    const alreadyHasArticle = existingTitles.some(title =>
      title.includes(vendorName) ||
      (vendorName.length > 4 && title.split(/\s+/).some(word => word.includes(vendorName)))
    );

    if (alreadyHasArticle) {
      console.log(`  ℹ Skipping "${interview.title}" - article already exists`);
      saveProcessedInterview(interview.id); // Mark as processed so we don't check again
      return false;
    }

    return true;
  });

  if (newInterviews.length === 0) {
    console.log('  ℹ No new interviews to process');
    return;
  }

  // Process the newest unprocessed interview
  const interview = newInterviews[0];
  console.log(`  Found new interview: ${interview.title}`);

  const result = await generateFromInterview(interview.id, { verbose: true });

  if (result.success) {
    // Check if title is missing
    if (result.message.includes('""') || !result.message.match(/: ".+"/)) {
      console.log('  ⚠ Warning: Article may have empty title - check Ghost admin');
    }
    console.log(`  ✓ ${result.message}`);
    if (result.articleUrl) console.log(`  URL: ${result.articleUrl}`);
    saveProcessedInterview(interview.id);
  } else {
    console.log(`  ⚠ Failed: ${result.message}`);
  }
}

async function runWeeklyGeneration(): Promise<void> {
  console.log('═══════════════════════════════════════════════════');
  console.log('  Pretty Perspectives Weekly Content Generation');
  console.log('  Style Me Pretty');
  console.log('  ' + new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }));
  console.log('═══════════════════════════════════════════════════');

  if (!await initServices()) {
    console.error('Failed to initialize. Exiting.');
    process.exit(1);
  }

  const weekNumber = incrementWeekCounter();
  console.log(`\nWeek #${weekNumber}`);

  // Fetch ALL existing articles (drafts + published) to check for duplicates
  console.log('\n📋 Loading existing articles (drafts + published)...');
  const existingArticles = await getExistingArticles();
  console.log(`  Found ${existingArticles.length} existing articles`);

  try {
    // 1. SEO Article (with real trend research)
    await generateWeeklySEO(weekNumber, existingArticles);

    // 2. Theme-based article from interviews
    await generateThemeArticle(existingArticles);

    // 3. New interview article (only if there's a new one)
    await generateNewInterviewArticle(existingArticles);

    console.log('\n═══════════════════════════════════════════════════');
    console.log('  Weekly generation complete!');
    console.log('  Check Ghost admin for new drafts.');
    console.log('═══════════════════════════════════════════════════\n');

  } catch (error) {
    console.error('\nError during generation:', error);
    process.exit(1);
  }
}

// Run it
runWeeklyGeneration();
