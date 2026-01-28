#!/usr/bin/env node

import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { config } from 'dotenv';

// Load environment variables
config();

import { initGoogleClients } from './services/google-docs.js';
import { initGhostClient, getExistingArticles, searchExistingArticles } from './services/ghost.js';
import { initAIClient } from './services/ai.js';
import { initResearchService } from './services/research.js';
import { generateFromInterview, listAvailableInterviews } from './generators/interview-profile.js';
import { generateThemeRoundup, discoverThemes } from './generators/theme-roundup.js';
import { generateFromInsight, discoverInsights } from './generators/insight-article.js';
import { generateSEOContent, suggestSEOTopics } from './generators/seo-content.js';
import { startChat } from './chat.js';

const program = new Command();

// Initialize services
async function initializeServices(): Promise<boolean> {
  const errors: string[] = [];

  // Ghost
  if (!process.env.GHOST_URL || !process.env.GHOST_ADMIN_API_KEY) {
    errors.push('Missing GHOST_URL or GHOST_ADMIN_API_KEY');
  } else {
    initGhostClient({
      url: process.env.GHOST_URL,
      key: process.env.GHOST_ADMIN_API_KEY,
    });
  }

  // Google (OAuth)
  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
    errors.push('Missing GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET');
  } else if (!process.env.GOOGLE_INTERVIEWS_FOLDER_ID) {
    errors.push('Missing GOOGLE_INTERVIEWS_FOLDER_ID');
  } else {
    try {
      await initGoogleClients({
        clientId: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        tokenPath: process.env.GOOGLE_TOKEN_PATH || './config/google-token.json',
        interviewsFolderId: process.env.GOOGLE_INTERVIEWS_FOLDER_ID,
        ideasFolderId: process.env.GOOGLE_IDEAS_FOLDER_ID,
      });
    } catch (error) {
      errors.push(`Google auth failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  // AI
  if (!process.env.ANTHROPIC_API_KEY) {
    errors.push('Missing ANTHROPIC_API_KEY');
  } else {
    initAIClient(process.env.ANTHROPIC_API_KEY);
  }

  // Research (optional)
  initResearchService(process.env.TAVILY_API_KEY);

  if (errors.length > 0) {
    console.error(chalk.red('\nConfiguration errors:'));
    errors.forEach(e => console.error(chalk.red(`  - ${e}`)));
    console.error(chalk.yellow('\nCreate a .env file based on .env.example\n'));
    return false;
  }

  return true;
}

program
  .name('ghost-agent')
  .description("AI-powered content generation for Pretty's Perspectives")
  .version('1.0.0');

// Interview command
program
  .command('interview <documentId>')
  .description('Generate article from a Google Docs interview')
  .option('-d, --dry-run', 'Preview without creating draft')
  .option('-v, --verbose', 'Show detailed progress')
  .action(async (documentId, options) => {
    if (!await initializeServices()) return;

    const spinner = ora('Generating interview article...').start();

    try {
      const result = await generateFromInterview(documentId, {
        dryRun: options.dryRun,
        verbose: options.verbose,
      });

      spinner.stop();

      if (result.success) {
        console.log(chalk.green(`\n✓ ${result.message}`));
        if (result.articleUrl) {
          console.log(chalk.cyan(`  Draft URL: ${result.articleUrl}`));
        }
      } else {
        console.log(chalk.yellow(`\n⚠ ${result.message}`));
      }
    } catch (error) {
      spinner.fail('Failed');
      console.error(chalk.red(error instanceof Error ? error.message : 'Unknown error'));
    }
  });

// Themes command
program
  .command('themes')
  .description('Discover themes across all interviews')
  .option('-c, --create', 'Create a roundup article from the top theme')
  .option('-d, --dry-run', 'Preview without creating draft')
  .option('-v, --verbose', 'Show detailed progress')
  .action(async (options) => {
    if (!await initializeServices()) return;

    const folderId = process.env.GOOGLE_INTERVIEWS_FOLDER_ID;
    if (!folderId) {
      console.error(chalk.red('Missing GOOGLE_INTERVIEWS_FOLDER_ID'));
      return;
    }

    const spinner = ora('Analyzing interviews...').start();

    try {
      const { themes, interviewCount } = await discoverThemes(folderId, {
        verbose: options.verbose,
      });

      spinner.stop();

      if (themes.length === 0) {
        console.log(chalk.yellow('\nNo themes discovered. Need at least 2 interviews.'));
        return;
      }

      console.log(chalk.cyan(`\n--- Themes from ${interviewCount} Interviews ---\n`));
      themes.forEach((theme, i) => {
        console.log(`  ${i + 1}. ${theme}`);
      });

      if (options.create) {
        const createSpinner = ora('Creating theme roundup...').start();
        const result = await generateThemeRoundup(folderId, themes[0], {
          dryRun: options.dryRun,
          verbose: options.verbose,
        });
        createSpinner.stop();

        if (result.success) {
          console.log(chalk.green(`\n✓ ${result.message}`));
          if (result.articleUrl) {
            console.log(chalk.cyan(`  Draft URL: ${result.articleUrl}`));
          }
        } else {
          console.log(chalk.yellow(`\n⚠ ${result.message}`));
        }
      } else {
        console.log(chalk.gray('\nUse --create to generate a roundup article.\n'));
      }
    } catch (error) {
      spinner.fail('Failed');
      console.error(chalk.red(error instanceof Error ? error.message : 'Unknown error'));
    }
  });

// Insight command
program
  .command('insight <quote>')
  .description('Generate article expanding on a quote or insight')
  .option('-n, --vendor-name <name>', 'Name of the vendor who said this', 'A wedding professional')
  .option('-d, --dry-run', 'Preview without creating draft')
  .option('-v, --verbose', 'Show detailed progress')
  .action(async (quote, options) => {
    if (!await initializeServices()) return;

    const spinner = ora('Generating insight article...').start();

    try {
      const result = await generateFromInsight(quote, options.vendorName, {
        dryRun: options.dryRun,
        verbose: options.verbose,
      });

      spinner.stop();

      if (result.success) {
        console.log(chalk.green(`\n✓ ${result.message}`));
        if (result.articleUrl) {
          console.log(chalk.cyan(`  Draft URL: ${result.articleUrl}`));
        }
      } else {
        console.log(chalk.yellow(`\n⚠ ${result.message}`));
      }
    } catch (error) {
      spinner.fail('Failed');
      console.error(chalk.red(error instanceof Error ? error.message : 'Unknown error'));
    }
  });

// SEO command
program
  .command('seo <topic>')
  .description('Generate SEO-optimized article on a topic')
  .option('-k, --keywords <keywords>', 'Comma-separated target keywords')
  .option('-d, --dry-run', 'Preview without creating draft')
  .option('-v, --verbose', 'Show detailed progress')
  .action(async (topic, options) => {
    if (!await initializeServices()) return;

    const keywords = options.keywords
      ? options.keywords.split(',').map((k: string) => k.trim())
      : undefined;

    const spinner = ora('Generating SEO article...').start();

    try {
      const result = await generateSEOContent(topic, keywords, {
        dryRun: options.dryRun,
        verbose: options.verbose,
      });

      spinner.stop();

      if (result.success) {
        console.log(chalk.green(`\n✓ ${result.message}`));
        if (result.articleUrl) {
          console.log(chalk.cyan(`  Draft URL: ${result.articleUrl}`));
        }
      } else {
        console.log(chalk.yellow(`\n⚠ ${result.message}`));
      }
    } catch (error) {
      spinner.fail('Failed');
      console.error(chalk.red(error instanceof Error ? error.message : 'Unknown error'));
    }
  });

// Ideas command
program
  .command('ideas')
  .description('List article ideas from Google Drive folder')
  .action(async () => {
    if (!await initializeServices()) return;

    const folderId = process.env.GOOGLE_INTERVIEWS_FOLDER_ID;
    if (!folderId) {
      console.error(chalk.red('Missing GOOGLE_INTERVIEWS_FOLDER_ID'));
      return;
    }

    const spinner = ora('Fetching interviews...').start();

    try {
      const interviews = await listAvailableInterviews(folderId);
      spinner.stop();

      console.log(chalk.cyan(`\n--- ${interviews.length} Interview Documents ---\n`));

      for (const interview of interviews) {
        console.log(chalk.white(`  ${interview.title}`));
        console.log(chalk.gray(`    ID: ${interview.id}`));
        if (interview.createdAt) {
          console.log(chalk.gray(`    Date: ${interview.createdAt.toLocaleDateString()}`));
        }
        console.log('');
      }

      console.log(chalk.cyan('\n--- SEO Topic Suggestions ---\n'));
      suggestSEOTopics().forEach((topic, i) => {
        console.log(`  ${i + 1}. ${topic}`);
      });
      console.log('');
    } catch (error) {
      spinner.fail('Failed');
      console.error(chalk.red(error instanceof Error ? error.message : 'Unknown error'));
    }
  });

// Existing command
program
  .command('existing')
  .description('List existing articles on Ghost')
  .option('-s, --search <query>', 'Search for specific articles')
  .action(async (options) => {
    if (!await initializeServices()) return;

    const spinner = ora('Fetching articles...').start();

    try {
      let articles;
      if (options.search) {
        articles = await searchExistingArticles(options.search);
        spinner.stop();
        console.log(chalk.cyan(`\n--- Articles matching "${options.search}" ---\n`));
      } else {
        articles = await getExistingArticles();
        spinner.stop();
        console.log(chalk.cyan(`\n--- ${articles.length} Total Articles ---\n`));
      }

      for (const article of articles.slice(0, 30)) {
        console.log(chalk.white(`  ${article.title}`));
        console.log(chalk.gray(`    /${article.slug}`));
        if (article.publishedAt) {
          console.log(chalk.gray(`    Published: ${new Date(article.publishedAt).toLocaleDateString()}`));
        }
        console.log('');
      }

      if (articles.length > 30) {
        console.log(chalk.gray(`  ... and ${articles.length - 30} more\n`));
      }
    } catch (error) {
      spinner.fail('Failed');
      console.error(chalk.red(error instanceof Error ? error.message : 'Unknown error'));
    }
  });

// Chat command
program
  .command('chat')
  .description('Start interactive chat mode')
  .action(async () => {
    if (!await initializeServices()) return;

    const folderId = process.env.GOOGLE_INTERVIEWS_FOLDER_ID;
    if (!folderId) {
      console.error(chalk.red('Missing GOOGLE_INTERVIEWS_FOLDER_ID'));
      return;
    }

    await startChat({ interviewsFolderId: folderId });
  });

// Insights discovery command
program
  .command('insights')
  .description('Discover notable insights from interviews')
  .action(async () => {
    if (!await initializeServices()) return;

    const folderId = process.env.GOOGLE_INTERVIEWS_FOLDER_ID;
    if (!folderId) {
      console.error(chalk.red('Missing GOOGLE_INTERVIEWS_FOLDER_ID'));
      return;
    }

    const spinner = ora('Extracting insights from interviews...').start();

    try {
      const insights = await discoverInsights(folderId, { verbose: false });
      spinner.stop();

      if (insights.length === 0) {
        console.log(chalk.yellow('\nNo insights found.'));
        return;
      }

      console.log(chalk.cyan(`\n--- ${insights.length} Insights Discovered ---\n`));

      for (const { insight, vendorName } of insights) {
        console.log(chalk.white(`  "${insight}"`));
        console.log(chalk.gray(`    — ${vendorName}\n`));
      }

      console.log(chalk.gray('Use `ghost-agent insight "<quote>"` to create an article.\n'));
    } catch (error) {
      spinner.fail('Failed');
      console.error(chalk.red(error instanceof Error ? error.message : 'Unknown error'));
    }
  });

program.parse();
