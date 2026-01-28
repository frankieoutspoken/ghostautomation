import inquirer from 'inquirer';
import chalk from 'chalk';
import ora from 'ora';
import { chat } from './services/ai.js';
import { generateFromInterview, listAvailableInterviews } from './generators/interview-profile.js';
import { generateThemeRoundup, discoverThemes } from './generators/theme-roundup.js';
import { generateFromInsight, discoverInsights } from './generators/insight-article.js';
import { generateSEOContent, suggestSEOTopics } from './generators/seo-content.js';
import { getExistingArticles } from './services/ghost.js';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

export async function startChat(config: { interviewsFolderId: string }): Promise<void> {
  console.log(chalk.cyan('\n==========================================='));
  console.log(chalk.cyan.bold("  Pretty's Perspectives Content Assistant  "));
  console.log(chalk.cyan('===========================================\n'));

  console.log(chalk.gray('I can help you create articles for your Ghost blog.'));
  console.log(chalk.gray('Type "help" for available commands, or just chat with me.\n'));
  console.log(chalk.gray('Type "exit" to quit.\n'));

  const messages: Message[] = [];

  while (true) {
    const { input } = await inquirer.prompt([
      {
        type: 'input',
        name: 'input',
        message: chalk.green('You:'),
        prefix: '',
      },
    ]);

    const trimmedInput = input.trim().toLowerCase();

    if (trimmedInput === 'exit' || trimmedInput === 'quit') {
      console.log(chalk.cyan('\nGoodbye! Happy content creating.\n'));
      break;
    }

    if (trimmedInput === 'help') {
      printHelp();
      continue;
    }

    if (trimmedInput === 'interviews') {
      await handleListInterviews(config.interviewsFolderId);
      continue;
    }

    if (trimmedInput === 'themes') {
      await handleDiscoverThemes(config.interviewsFolderId);
      continue;
    }

    if (trimmedInput === 'insights') {
      await handleDiscoverInsights(config.interviewsFolderId);
      continue;
    }

    if (trimmedInput === 'existing') {
      await handleListExisting();
      continue;
    }

    if (trimmedInput === 'seo-ideas') {
      handleSEOIdeas();
      continue;
    }

    if (trimmedInput.startsWith('create interview ')) {
      const docId = input.trim().slice('create interview '.length).trim();
      await handleCreateInterview(docId);
      continue;
    }

    if (trimmedInput.startsWith('create theme')) {
      await handleCreateTheme(config.interviewsFolderId);
      continue;
    }

    if (trimmedInput.startsWith('create seo ')) {
      const topic = input.trim().slice('create seo '.length).trim();
      await handleCreateSEO(topic);
      continue;
    }

    // Regular chat
    const spinner = ora('Thinking...').start();

    try {
      messages.push({ role: 'user', content: input });
      const response = await chat(messages);
      messages.push({ role: 'assistant', content: response });

      spinner.stop();
      console.log(chalk.blue('\nAssistant:'), response, '\n');
    } catch (error) {
      spinner.fail('Error getting response');
      console.error(chalk.red(error instanceof Error ? error.message : 'Unknown error'));
    }
  }
}

function printHelp(): void {
  console.log(chalk.cyan('\n--- Available Commands ---\n'));
  console.log(chalk.yellow('interviews') + '        - List available interview documents');
  console.log(chalk.yellow('themes') + '            - Discover themes from interviews');
  console.log(chalk.yellow('insights') + '          - Find insightful quotes from interviews');
  console.log(chalk.yellow('existing') + '          - Show existing Ghost articles');
  console.log(chalk.yellow('seo-ideas') + '         - Get SEO article topic suggestions');
  console.log('');
  console.log(chalk.yellow('create interview <doc-id>') + ' - Create article from interview');
  console.log(chalk.yellow('create theme') + '              - Create theme roundup article');
  console.log(chalk.yellow('create seo <topic>') + '        - Create SEO-focused article');
  console.log('');
  console.log(chalk.yellow('exit') + '              - Quit the assistant');
  console.log('');
  console.log(chalk.gray('Or just type naturally to chat about content ideas!\n'));
}

async function handleListInterviews(folderId: string): Promise<void> {
  const spinner = ora('Fetching interviews...').start();

  try {
    const interviews = await listAvailableInterviews(folderId);
    spinner.stop();

    if (interviews.length === 0) {
      console.log(chalk.yellow('\nNo interviews found in the configured folder.\n'));
      return;
    }

    console.log(chalk.cyan(`\n--- ${interviews.length} Interviews Found ---\n`));

    for (const interview of interviews) {
      console.log(chalk.white(`  ${interview.id}`));
      console.log(chalk.gray(`    ${interview.title}`));
      if (interview.createdAt) {
        console.log(chalk.gray(`    Created: ${interview.createdAt.toLocaleDateString()}`));
      }
      console.log('');
    }
  } catch (error) {
    spinner.fail('Failed to fetch interviews');
    console.error(chalk.red(error instanceof Error ? error.message : 'Unknown error'));
  }
}

async function handleDiscoverThemes(folderId: string): Promise<void> {
  const spinner = ora('Analyzing interviews for themes...').start();

  try {
    const { themes, interviewCount } = await discoverThemes(folderId, { verbose: false });
    spinner.stop();

    if (themes.length === 0) {
      console.log(chalk.yellow('\nNo themes discovered. Need at least 2 interviews.\n'));
      return;
    }

    console.log(chalk.cyan(`\n--- Themes from ${interviewCount} Interviews ---\n`));

    themes.forEach((theme, i) => {
      console.log(chalk.white(`  ${i + 1}. ${theme}`));
    });

    console.log(chalk.gray('\nUse "create theme" to generate a roundup article.\n'));
  } catch (error) {
    spinner.fail('Failed to discover themes');
    console.error(chalk.red(error instanceof Error ? error.message : 'Unknown error'));
  }
}

async function handleDiscoverInsights(folderId: string): Promise<void> {
  const spinner = ora('Extracting insights from interviews...').start();

  try {
    const insights = await discoverInsights(folderId, { verbose: false });
    spinner.stop();

    if (insights.length === 0) {
      console.log(chalk.yellow('\nNo insights found.\n'));
      return;
    }

    console.log(chalk.cyan(`\n--- ${insights.length} Insights Found ---\n`));

    for (const { insight, vendorName } of insights.slice(0, 10)) {
      console.log(chalk.white(`  "${insight.slice(0, 100)}..."`));
      console.log(chalk.gray(`    - ${vendorName}\n`));
    }
  } catch (error) {
    spinner.fail('Failed to discover insights');
    console.error(chalk.red(error instanceof Error ? error.message : 'Unknown error'));
  }
}

async function handleListExisting(): Promise<void> {
  const spinner = ora('Fetching existing articles...').start();

  try {
    const articles = await getExistingArticles();
    spinner.stop();

    console.log(chalk.cyan(`\n--- ${articles.length} Existing Articles ---\n`));

    for (const article of articles.slice(0, 20)) {
      console.log(chalk.white(`  ${article.title}`));
      console.log(chalk.gray(`    /${article.slug}`));
      console.log('');
    }

    if (articles.length > 20) {
      console.log(chalk.gray(`  ... and ${articles.length - 20} more\n`));
    }
  } catch (error) {
    spinner.fail('Failed to fetch articles');
    console.error(chalk.red(error instanceof Error ? error.message : 'Unknown error'));
  }
}

function handleSEOIdeas(): void {
  const topics = suggestSEOTopics();

  console.log(chalk.cyan('\n--- SEO Article Ideas ---\n'));

  topics.forEach((topic, i) => {
    console.log(chalk.white(`  ${i + 1}. ${topic}`));
  });

  console.log(chalk.gray('\nUse "create seo <topic>" to generate an article.\n'));
}

async function handleCreateInterview(docId: string): Promise<void> {
  const spinner = ora('Generating interview article...').start();

  try {
    const result = await generateFromInterview(docId, { verbose: false });
    spinner.stop();

    if (result.success) {
      console.log(chalk.green(`\n✓ ${result.message}`));
      if (result.articleUrl) {
        console.log(chalk.cyan(`  View at: ${result.articleUrl}\n`));
      }
    } else {
      console.log(chalk.yellow(`\n⚠ ${result.message}\n`));
    }
  } catch (error) {
    spinner.fail('Failed to create article');
    console.error(chalk.red(error instanceof Error ? error.message : 'Unknown error'));
  }
}

async function handleCreateTheme(folderId: string): Promise<void> {
  const spinner = ora('Generating theme roundup...').start();

  try {
    const result = await generateThemeRoundup(folderId, undefined, { verbose: false });
    spinner.stop();

    if (result.success) {
      console.log(chalk.green(`\n✓ ${result.message}`));
      if (result.articleUrl) {
        console.log(chalk.cyan(`  View at: ${result.articleUrl}\n`));
      }
    } else {
      console.log(chalk.yellow(`\n⚠ ${result.message}\n`));
    }
  } catch (error) {
    spinner.fail('Failed to create article');
    console.error(chalk.red(error instanceof Error ? error.message : 'Unknown error'));
  }
}

async function handleCreateSEO(topic: string): Promise<void> {
  const spinner = ora('Generating SEO article...').start();

  try {
    const result = await generateSEOContent(topic, undefined, { verbose: false });
    spinner.stop();

    if (result.success) {
      console.log(chalk.green(`\n✓ ${result.message}`));
      if (result.articleUrl) {
        console.log(chalk.cyan(`  View at: ${result.articleUrl}\n`));
      }
    } else {
      console.log(chalk.yellow(`\n⚠ ${result.message}\n`));
    }
  } catch (error) {
    spinner.fail('Failed to create article');
    console.error(chalk.red(error instanceof Error ? error.message : 'Unknown error'));
  }
}
