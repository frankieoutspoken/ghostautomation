import { google } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';
import { writeFileSync, existsSync, readFileSync } from 'fs';
import { createServer } from 'http';
import { parse } from 'url';
import open from 'open';
import type { Interview, ArticleIdea } from '../types/index.js';

const SCOPES = [
  'https://www.googleapis.com/auth/documents.readonly',
  'https://www.googleapis.com/auth/drive.readonly',
];

let oauth2Client: OAuth2Client | null = null;
let docsClient: ReturnType<typeof google.docs> | null = null;
let driveClient: ReturnType<typeof google.drive> | null = null;

export interface GoogleOAuthConfig {
  clientId: string;
  clientSecret: string;
  tokenPath: string;
  interviewsFolderId: string;
  ideasFolderId?: string;
}

export async function initGoogleClients(config: GoogleOAuthConfig): Promise<void> {
  oauth2Client = new OAuth2Client(config.clientId, config.clientSecret, 'http://localhost:3000/oauth2callback');

  // Check for existing token
  if (existsSync(config.tokenPath)) {
    const token = JSON.parse(readFileSync(config.tokenPath, 'utf-8'));
    oauth2Client.setCredentials(token);

    // Refresh if expired
    if (token.expiry_date && token.expiry_date < Date.now()) {
      console.log('Token expired, refreshing...');
      const { credentials: newCredentials } = await oauth2Client.refreshAccessToken();
      oauth2Client.setCredentials(newCredentials);
      writeFileSync(config.tokenPath, JSON.stringify(newCredentials));
    }
  } else {
    // Need to authorize
    await authorizeWithBrowser(oauth2Client, config.tokenPath);
  }

  docsClient = google.docs({ version: 'v1', auth: oauth2Client });
  driveClient = google.drive({ version: 'v3', auth: oauth2Client });
}

async function authorizeWithBrowser(client: OAuth2Client, tokenPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const authUrl = client.generateAuthUrl({
      access_type: 'offline',
      scope: SCOPES,
      prompt: 'consent',
    });

    console.log('\n📋 Opening browser for Google authorization...');
    console.log('If browser doesn\'t open, visit this URL:\n');
    console.log(authUrl);
    console.log('');

    // Create a simple server to receive the callback
    const server = createServer(async (req, res) => {
      try {
        const urlParts = parse(req.url || '', true);
        if (urlParts.pathname === '/oauth2callback') {
          const code = urlParts.query.code as string;

          if (!code) {
            res.writeHead(400);
            res.end('No authorization code received');
            reject(new Error('No authorization code'));
            return;
          }

          const { tokens } = await client.getToken(code);
          client.setCredentials(tokens);

          // Save token for future use
          writeFileSync(tokenPath, JSON.stringify(tokens));

          res.writeHead(200);
          res.end('Authorization successful! You can close this window and return to the terminal.');

          server.close();
          resolve();
        }
      } catch (error) {
        res.writeHead(500);
        res.end('Authorization failed');
        reject(error);
      }
    });

    server.listen(3000, () => {
      open(authUrl).catch(() => {
        console.log('Could not open browser automatically.');
      });
    });

    // Timeout after 5 minutes
    setTimeout(() => {
      server.close();
      reject(new Error('Authorization timed out'));
    }, 300000);
  });
}

export async function listInterviews(folderId: string): Promise<Interview[]> {
  if (!driveClient) throw new Error('Google clients not initialized');

  const response = await driveClient.files.list({
    q: `'${folderId}' in parents and mimeType='application/vnd.google-apps.document' and trashed=false`,
    fields: 'files(id, name, createdTime)',
    orderBy: 'createdTime desc',
  });

  const files = response.data.files || [];

  return files.map(file => ({
    id: file.id!,
    title: file.name!,
    content: '',
    createdAt: file.createdTime ? new Date(file.createdTime) : undefined,
  }));
}

export async function getDocumentContent(documentId: string): Promise<string> {
  if (!docsClient) throw new Error('Google clients not initialized');

  const response = await docsClient.documents.get({
    documentId,
  });

  const document = response.data;
  let content = '';

  if (document.body?.content) {
    content = extractTextFromContent(document.body.content);
  }

  return content;
}

function extractTextFromContent(content: any[]): string {
  let text = '';

  for (const element of content) {
    if (element.paragraph) {
      for (const paragraphElement of element.paragraph.elements || []) {
        if (paragraphElement.textRun?.content) {
          text += paragraphElement.textRun.content;
        }
      }
    } else if (element.table) {
      for (const row of element.table.tableRows || []) {
        for (const cell of row.tableCells || []) {
          if (cell.content) {
            text += extractTextFromContent(cell.content);
          }
        }
        text += '\n';
      }
    }
  }

  return text;
}

export async function getInterview(documentId: string): Promise<Interview> {
  if (!driveClient) throw new Error('Google clients not initialized');

  const fileResponse = await driveClient.files.get({
    fileId: documentId,
    fields: 'id, name, createdTime',
  });

  const file = fileResponse.data;
  const content = await getDocumentContent(documentId);

  const titleParts = file.name?.split(/[-–—]/).map(s => s.trim()) || [];
  let vendorName: string | undefined;
  let vendorType: string | undefined;

  if (titleParts.length >= 2) {
    vendorName = titleParts[1];
  }
  if (titleParts.length >= 3) {
    vendorType = titleParts[2];
  }

  return {
    id: file.id!,
    title: file.name!,
    content,
    vendorName,
    vendorType,
    createdAt: file.createdTime ? new Date(file.createdTime) : undefined,
  };
}

export async function listArticleIdeas(folderId: string): Promise<ArticleIdea[]> {
  if (!driveClient) throw new Error('Google clients not initialized');

  const response = await driveClient.files.list({
    q: `'${folderId}' in parents and mimeType='application/vnd.google-apps.document' and trashed=false`,
    fields: 'files(id, name, createdTime)',
    orderBy: 'createdTime desc',
  });

  const files = response.data.files || [];

  return files.map(file => ({
    id: file.id!,
    title: file.name!,
    content: '',
    createdAt: file.createdTime ? new Date(file.createdTime) : undefined,
  }));
}

export async function getIdea(documentId: string): Promise<ArticleIdea> {
  if (!driveClient) throw new Error('Google clients not initialized');

  const fileResponse = await driveClient.files.get({
    fileId: documentId,
    fields: 'id, name, createdTime',
  });

  const file = fileResponse.data;
  const content = await getDocumentContent(documentId);

  return {
    id: file.id!,
    title: file.name!,
    content,
    createdAt: file.createdTime ? new Date(file.createdTime) : undefined,
  };
}

export async function getAllInterviewsWithContent(folderId: string): Promise<Interview[]> {
  const interviews = await listInterviews(folderId);

  const interviewsWithContent = await Promise.all(
    interviews.map(async (interview) => {
      const content = await getDocumentContent(interview.id);
      return { ...interview, content };
    })
  );

  return interviewsWithContent;
}
