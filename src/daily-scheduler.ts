#!/usr/bin/env node

import { config } from 'dotenv';

config();

import { initGoogleClients, listInterviews, listArticleIdeas, getIdea } from './services/google-docs.js';
import { initGhostClient, getExistingArticles } from './services/ghost.js';
import { initAIClient } from './services/ai.js';
import { initResearchService } from './services/research.js';
import { runContentAgent } from './strands-agent/agent.js';
import type { ExistingArticle } from './types/index.js';

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

// Extract key terms from interview title for matching
function extractInterviewKeyTerms(interviewTitle: string): string[] {
  // "Nigel - Gloster House Interview" -> ["nigel", "gloster", "house"]
  // "Tiffany (Hunter Ryan) Interview" -> ["tiffany", "hunter", "ryan"]
  const cleaned = interviewTitle
    .replace(/\s*interview\s*/gi, '')
    .replace(/[()]/g, ' ')
    .replace(/[-–—]/g, ' ')
    .toLowerCase();

  return cleaned.split(/\s+/).filter(word => word.length > 2);
}

// Check if an article title contains key terms from interview
function articleMatchesInterview(articleTitle: string, interviewKeyTerms: string[]): boolean {
  const articleLower = articleTitle.toLowerCase();
  // Need at least one key term to match
  return interviewKeyTerms.some(term => articleLower.includes(term));
}

async function processNewInterviews(existingArticles: ExistingArticle[]): Promise<number> {
  console.log('\n👤 Checking for New Interviews...');

  const folderId = process.env.GOOGLE_INTERVIEWS_FOLDER_ID!;
  const interviews = await listInterviews(folderId);

  // Find interviews that don't already have an article in Ghost
  const newInterviews = interviews.filter(interview => {
    const keyTerms = extractInterviewKeyTerms(interview.title);

    const hasExistingArticle = existingArticles.some(article =>
      articleMatchesInterview(article.title, keyTerms)
    );

    if (hasExistingArticle) {
      console.log(`  ℹ "${interview.title}" - already has article in Ghost`);
      return false;
    }

    return true;
  });

  if (newInterviews.length === 0) {
    console.log('  ℹ No new interviews to process');
    return 0;
  }

  let processedCount = 0;
  const ideasFolderId = process.env.GOOGLE_IDEAS_FOLDER_ID;

  for (const interview of newInterviews) {
    console.log(`  Found new interview: ${interview.title}`);

    // Use the agent to process the interview
    const agentRequest = `Create an article from the interview "${interview.title}" (document ID: ${interview.id}).

Follow the standard interview article workflow:
1. Check for duplicates first
2. Read the interview content
3. Generate the article in the correct Pretty Perspectives HTML format
4. Create the draft in Ghost`;

    try {
      const result = await runContentAgent(agentRequest, folderId, ideasFolderId);
      console.log(`  ✓ Agent completed`);
      processedCount++;
    } catch (error) {
      console.log(`  ⚠ Failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  return processedCount;
}

// Extract key terms from idea title for matching
function extractIdeaKeyTerms(ideaTitle: string): string[] {
  // "Piece on AI tools" -> ["piece", "ai", "tools"]
  const cleaned = ideaTitle
    .replace(/[()]/g, ' ')
    .replace(/[-–—]/g, ' ')
    .toLowerCase();

  // Filter out common words
  const stopWords = ['piece', 'on', 'about', 'the', 'a', 'an', 'for', 'and', 'or', 'article'];
  return cleaned.split(/\s+/).filter(word => word.length > 2 && !stopWords.includes(word));
}

// Check if an article title contains key terms from idea
function articleMatchesIdea(articleTitle: string, ideaKeyTerms: string[]): boolean {
  const articleLower = articleTitle.toLowerCase();
  // Need at least half of key terms to match
  const matchCount = ideaKeyTerms.filter(term => articleLower.includes(term)).length;
  return matchCount >= Math.ceil(ideaKeyTerms.length / 2);
}

async function processNewIdeas(existingArticles: ExistingArticle[]): Promise<number> {
  console.log('\n💡 Checking for New Ideas...');

  const ideasFolderId = process.env.GOOGLE_IDEAS_FOLDER_ID;
  if (!ideasFolderId) {
    console.log('  ℹ Ideas folder not configured (GOOGLE_IDEAS_FOLDER_ID)');
    return 0;
  }

  const ideas = await listArticleIdeas(ideasFolderId);

  // Find ideas that don't already have an article in Ghost
  const newIdeas = ideas.filter(idea => {
    const keyTerms = extractIdeaKeyTerms(idea.title);

    const hasExistingArticle = existingArticles.some(article =>
      articleMatchesIdea(article.title, keyTerms)
    );

    if (hasExistingArticle) {
      console.log(`  ℹ "${idea.title}" - already has article in Ghost`);
      return false;
    }

    return true;
  });

  if (newIdeas.length === 0) {
    console.log('  ℹ No new ideas to process');
    return 0;
  }

  let processedCount = 0;
  const interviewsFolderId = process.env.GOOGLE_INTERVIEWS_FOLDER_ID!;

  for (const ideaSummary of newIdeas) {
    console.log(`  Found new idea: ${ideaSummary.title}`);

    // Read the full idea content
    const idea = await getIdea(ideaSummary.id);
    console.log(`  Instructions: ${idea.content.substring(0, 200)}${idea.content.length > 200 ? '...' : ''}`);

    // Use the agent to process the idea
    const agentRequest = `Process this article idea and create a draft article.

## Idea
Title: ${idea.title}
Instructions: ${idea.content}

## Required Workflow
1. **Check for duplicates first** - Use check_duplicate with the topic/title to make sure we haven't already written about this
2. **Research the topic** - Use web_search to find current trends, statistics, and insights about this topic (search for "[topic] wedding industry 2026" or similar)
3. **Read relevant interviews** - If the idea mentions quotes or interviews, use list_interviews then read_interview to find relevant vendor perspectives and quotes to include
4. **Generate the article** - Write complete HTML following the Pretty Perspectives format:
   - Start with TL;DR callout card
   - Include proper H2 sections with <hr> dividers
   - Add image placeholders with photographer credits
   - Include the CTA block about 2/3 through
   - Use bullet lists for takeaways
   - End with "The Bottom Line" section
5. **Create the draft** - Use create_draft with title, full HTML, excerpt, metaDescription, and tags

Make sure to incorporate research findings and interview quotes (if applicable) into the article. Never fabricate statistics.`;

    try {
      const result = await runContentAgent(agentRequest, interviewsFolderId, ideasFolderId);
      console.log(`  ✓ Agent completed`);
      processedCount++;
    } catch (error) {
      console.log(`  ⚠ Failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  return processedCount;
}

async function runDailyCheck(): Promise<void> {
  console.log('═══════════════════════════════════════════════════');
  console.log('  Pretty Perspectives Daily Content Check');
  console.log('  Style Me Pretty');
  console.log('  ' + new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }));
  console.log('═══════════════════════════════════════════════════');

  if (!await initServices()) {
    console.error('Failed to initialize. Exiting.');
    process.exit(1);
  }

  // Fetch ALL existing articles (drafts + published) to check for duplicates
  console.log('\n📋 Loading existing articles (drafts + published)...');
  const existingArticles = await getExistingArticles();
  console.log(`  Found ${existingArticles.length} existing articles`);

  try {
    // 1. Check for new interviews
    const newInterviewCount = await processNewInterviews(existingArticles);

    // 2. Check for new ideas
    const newIdeaCount = await processNewIdeas(existingArticles);

    console.log('\n═══════════════════════════════════════════════════');
    console.log(`  Daily check complete!`);
    console.log(`  New interviews processed: ${newInterviewCount}`);
    console.log(`  New ideas processed: ${newIdeaCount}`);
    if (newInterviewCount > 0 || newIdeaCount > 0) {
      console.log('  Check Ghost admin for new drafts.');
    }
    console.log('═══════════════════════════════════════════════════\n');

  } catch (error) {
    console.error('\nError during daily check:', error);
    process.exit(1);
  }
}

// Run it
runDailyCheck();
