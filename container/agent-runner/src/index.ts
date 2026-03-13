/**
 * MikoClaw Agent Runner — Direct OpenRouter API via openai npm package
 */
import fs from 'fs';
import path from 'path';
import OpenAI from 'openai';

interface ContainerInput {
  prompt: string;
  sessionId?: string;
  groupFolder: string;
  chatJid: string;
  isMain: boolean;
  isScheduledTask?: boolean;
  assistantName?: string;
}

interface ContainerOutput {
  status: 'success' | 'error';
  result: string | null;
  error?: string;
}

const IPC_INPUT_DIR = '/workspace/ipc/input';
const IPC_INPUT_CLOSE_SENTINEL = path.join(IPC_INPUT_DIR, '_close');
const IPC_POLL_MS = 500;
const OUTPUT_START_MARKER = '---NANOCLAW_OUTPUT_START---';
const OUTPUT_END_MARKER = '---NANOCLAW_OUTPUT_END---';

async function readStdin(): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', chunk => { data += chunk; });
    process.stdin.on('end', () => resolve(data));
    process.stdin.on('error', reject);
  });
}

function writeOutput(output: ContainerOutput): void {
  console.log(OUTPUT_START_MARKER);
  console.log(JSON.stringify(output));
  console.log(OUTPUT_END_MARKER);
}

function log(message: string): void {
  console.error(`[agent-runner] ${message}`);
}

function shouldClose(): boolean {
  if (fs.existsSync(IPC_INPUT_CLOSE_SENTINEL)) {
    try { fs.unlinkSync(IPC_INPUT_CLOSE_SENTINEL); } catch { /* ignore */ }
    return true;
  }
  return false;
}

function drainIpcInput(): string[] {
  try {
    fs.mkdirSync(IPC_INPUT_DIR, { recursive: true });
    const files = fs.readdirSync(IPC_INPUT_DIR)
      .filter(f => f.endsWith('.json'))
      .sort();
    const messages: string[] = [];
    for (const file of files) {
      const filePath = path.join(IPC_INPUT_DIR, file);
      try {
        const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
        fs.unlinkSync(filePath);
        if (data.type === 'message' && data.text) messages.push(data.text);
      } catch { /* skip */ }
    }
    return messages;
  } catch { return []; }
}

function waitForIpcMessage(): Promise<string | null> {
  return new Promise((resolve) => {
    const poll = () => {
      if (shouldClose()) { resolve(null); return; }
      const msgs = drainIpcInput();
      if (msgs.length > 0) { resolve(msgs.join('\n')); return; }
      setTimeout(poll, IPC_POLL_MS);
    };
    poll();
  });
}

function buildSystemPrompt(input: ContainerInput): string {
  const name = input.assistantName || 'Assistant';
  const parts = [
    `You are ${name}, a helpful AI assistant.`,
    `Respond directly and conversationally. Be concise but helpful.`,
  ];
  for (const p of ['/workspace/global/CLAUDE.md', '/workspace/group/CLAUDE.md']) {
    if (fs.existsSync(p)) parts.push('', fs.readFileSync(p, 'utf-8'));
  }
  return parts.join('\n');
}

const history: OpenAI.Chat.ChatCompletionMessageParam[] = [];

async function runQuery(
  client: OpenAI, systemPrompt: string, userMessage: string, model: string,
): Promise<void> {
  log(`Running query (${userMessage.length} chars)...`);
  history.push({ role: 'user', content: userMessage });

  const response = await client.chat.completions.create({
    model,
    messages: [{ role: 'system', content: systemPrompt }, ...history],
    max_tokens: 2048,
  });

  const text = response.choices?.[0]?.message?.content || null;
  log(`Query complete. Result: ${text ? text.slice(0, 200) : '(empty)'}`);

  if (text) history.push({ role: 'assistant', content: text });
  writeOutput({ status: 'success', result: text });
}

async function main(): Promise<void> {
  let containerInput: ContainerInput;
  try {
    containerInput = JSON.parse(await readStdin());
    log(`Received input for group: ${containerInput.groupFolder}`);
  } catch (err) {
    writeOutput({ status: 'error', result: null, error: `Failed to parse input: ${err}` });
    process.exit(1);
  }

  fs.mkdirSync(IPC_INPUT_DIR, { recursive: true });
  try { fs.unlinkSync(IPC_INPUT_CLOSE_SENTINEL); } catch { /* ignore */ }

  // Connect directly to OpenRouter (via credential proxy)
  const client = new OpenAI({
    baseURL: process.env.OPENAI_BASE_URL || 'https://openrouter.ai/api/v1',
    apiKey: process.env.OPENAI_API_KEY || 'placeholder',
  });

  const model = process.env.OPENROUTER_MODEL || 'deepseek/deepseek-chat-v3-0324';
  const systemPrompt = buildSystemPrompt(containerInput);

  let prompt = containerInput.prompt;
  if (containerInput.isScheduledTask) prompt = `[SCHEDULED TASK]\n\n${prompt}`;
  const pending = drainIpcInput();
  if (pending.length > 0) prompt += '\n' + pending.join('\n');

  try {
    while (true) {
      await runQuery(client, systemPrompt, prompt, model);
      if (shouldClose()) { log('Close sentinel, exiting'); break; }
      writeOutput({ status: 'success', result: null });
      const next = await waitForIpcMessage();
      if (next === null) { log('Close sentinel, exiting'); break; }
      prompt = next;
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log(`Error: ${msg}`);
    writeOutput({ status: 'error', result: null, error: msg });
    process.exit(1);
  }
}

main();
