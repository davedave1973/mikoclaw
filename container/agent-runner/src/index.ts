/**
 * MikoClaw Agent Runner — Direct OpenRouter API with function calling
 * Supports: model switching, conversation history, Brave web search
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
  model?: string;
  history?: Array<{ role: string; content: string }>;
  braveApiKey?: string;
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
    const files = fs.readdirSync(IPC_INPUT_DIR).filter(f => f.endsWith('.json')).sort();
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
  const name = input.assistantName || 'WizDudeBot';
  const parts = [
    `You are ${name}, a helpful AI assistant on Telegram.`,
    `IMPORTANT: Always respond in English unless the user explicitly writes in another language.`,
    `You have a web_search tool available. ALWAYS use it when users ask about news, current events, scores, prices, or anything that requires up-to-date information. Do NOT say you can't access the web — use the web_search tool instead.`,
    `Respond conversationally. Be concise but helpful. Use emoji naturally.`,
  ];
  for (const p of ['/workspace/global/CLAUDE.md', '/workspace/group/CLAUDE.md']) {
    if (fs.existsSync(p)) parts.push('', fs.readFileSync(p, 'utf-8'));
  }
  return parts.join('\n');
}

// --- Brave Search Tool ---
async function braveSearch(query: string, apiKey: string): Promise<string> {
  log(`Brave search: "${query}"`);
  try {
    const url = `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=5`;
    const res = await fetch(url, {
      headers: { 'Accept': 'application/json', 'X-Subscription-Token': apiKey },
    });
    if (!res.ok) return `Search error: ${res.status} ${res.statusText}`;
    const data = await res.json() as any;
    const results = (data.web?.results || []).slice(0, 5);
    if (results.length === 0) return 'No search results found.';
    return results.map((r: any, i: number) =>
      `${i + 1}. **${r.title}**\n   ${r.url}\n   ${r.description || ''}`
    ).join('\n\n');
  } catch (err) {
    return `Search failed: ${err}`;
  }
}

const TOOLS: OpenAI.Chat.ChatCompletionTool[] = [
  {
    type: 'function',
    function: {
      name: 'web_search',
      description: 'Search the web for current information, news, weather, or any live data. Use this when the user asks about something that requires up-to-date information.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'The search query' },
        },
        required: ['query'],
      },
    },
  },
];

async function runQuery(
  client: OpenAI, systemPrompt: string, userMessage: string,
  model: string, history: OpenAI.Chat.ChatCompletionMessageParam[],
  braveApiKey: string | undefined,
): Promise<string | null> {
  log(`Running query (${userMessage.length} chars) with model ${model}...`);
  history.push({ role: 'user', content: userMessage });

  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    { role: 'system', content: systemPrompt },
    ...history,
  ];

  // First call — may return tool calls or direct response
  let response = await client.chat.completions.create({
    model,
    messages,
    tools: braveApiKey ? TOOLS : undefined,
    max_tokens: 2048,
  });

  let choice = response.choices?.[0];
  let maxToolRounds = 3;

  // Handle tool calls (function calling loop)
  while (choice?.finish_reason === 'tool_calls' && choice.message.tool_calls && maxToolRounds > 0) {
    maxToolRounds--;
    const toolCalls = choice.message.tool_calls;
    
    // Add assistant message with tool calls
    history.push(choice.message as any);

    // Execute each tool call
    for (const tc of toolCalls) {
      let result = 'Unknown tool';
      if (tc.function.name === 'web_search' && braveApiKey) {
        const args = JSON.parse(tc.function.arguments);
        result = await braveSearch(args.query, braveApiKey);
      }
      history.push({ role: 'tool', tool_call_id: tc.id, content: result } as any);
    }

    // Call again with tool results
    response = await client.chat.completions.create({
      model,
      messages: [{ role: 'system', content: systemPrompt }, ...history],
      tools: braveApiKey ? TOOLS : undefined,
      max_tokens: 2048,
    });
    choice = response.choices?.[0];
  }

  const text = choice?.message?.content || null;
  if (text) history.push({ role: 'assistant', content: text });
  log(`Query complete. Result: ${text ? text.slice(0, 200) : '(empty)'}`);
  return text;
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

  const client = new OpenAI({
    baseURL: process.env.OPENAI_BASE_URL || 'https://openrouter.ai/api/v1',
    apiKey: process.env.OPENAI_API_KEY || 'placeholder',
  });

  const model = containerInput.model || 'deepseek/deepseek-chat-v3-0324';
  const systemPrompt = buildSystemPrompt(containerInput);
  const braveApiKey = containerInput.braveApiKey;

  // Seed conversation history from previous sessions (persistent memory)
  const history: OpenAI.Chat.ChatCompletionMessageParam[] = [];
  if (containerInput.history && containerInput.history.length > 0) {
    log(`Loading ${containerInput.history.length} messages from history`);
    for (const msg of containerInput.history) {
      history.push({ role: msg.role as 'user' | 'assistant', content: msg.content });
    }
  }

  let prompt = containerInput.prompt;
  if (containerInput.isScheduledTask) prompt = `[SCHEDULED TASK]\n\n${prompt}`;
  const pending = drainIpcInput();
  if (pending.length > 0) prompt += '\n' + pending.join('\n');

  try {
    while (true) {
      const text = await runQuery(client, systemPrompt, prompt, model, history, braveApiKey);
      writeOutput({ status: 'success', result: text });
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
