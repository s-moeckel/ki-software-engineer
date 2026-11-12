import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';

const bookSchema = z.object({
  id: z.string(),
  isbn: z.string(),
  title: z.string(),
  subtitle: z.string().optional(),
  author: z.string(),
  publisher: z.string(),
  numPages: z.number().int().positive(),
  price: z.string(),
  cover: z.string(),
  abstract: z.string(),
  userId: z.number().int()
});

const limitSchema = z
  .number()
  .int()
  .nonnegative()
  .max(Number.MAX_SAFE_INTEGER)
  .optional()
  .describe('Maximale Trefferzahl; ohne Angabe alle Bücher, 0 liefert keine Treffer.');
const annotations = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };

export interface BookServerOptions {
  apiUrl?: string;
  timeoutMs?: number;
  fetch?: typeof globalThis.fetch;
}

export function createBookServer(options: BookServerOptions = {}) {
  const baseUrl = new URL(options.apiUrl ?? 'http://localhost:4730');
  if (
    !['http:', 'https:'].includes(baseUrl.protocol) ||
    baseUrl.username ||
    baseUrl.password ||
    baseUrl.search ||
    baseUrl.hash
  ) {
    throw new Error('BOOKMONKEY_API_URL muss eine HTTP(S)-Basisadresse ohne Zugangsdaten, Query oder Fragment sein.');
  }
  if (!baseUrl.pathname.endsWith('/')) baseUrl.pathname += '/';
  const fetchApi = options.fetch ?? globalThis.fetch;
  const timeoutMs = options.timeoutMs ?? 15_000;
  const server = new McpServer({ name: 'bookmonkey-mcp', version: '1.0.0' });

  async function request<T>(path: string, schema: z.ZodType<T>, signal: AbortSignal): Promise<CallToolResult> {
    try {
      const response = await fetchApi(new URL(path, baseUrl), {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.any([signal, AbortSignal.timeout(timeoutMs)]),
        redirect: 'error'
      });
      if (!response.ok) {
        return failure(
          response.status === 404
            ? 'Buch nicht gefunden (HTTP 404).'
            : `Die Buch-API meldet HTTP ${response.status}. Bitte erneut versuchen.`
        );
      }
      const parsed = schema.safeParse(await response.json());
      if (!parsed.success) return failure('Die Buch-API hat ein ungültiges Buchformat geliefert.');
      return { content: [{ type: 'text', text: JSON.stringify(parsed.data, null, 2) }] };
    } catch (error) {
      if (signal.aborted) return failure('Buchanfrage abgebrochen.');
      if (error instanceof Error && error.name === 'TimeoutError') {
        return failure('Zeitüberschreitung beim Abruf der Buch-API. Bitte erneut versuchen.');
      }
      if (error instanceof SyntaxError) return failure('Die Buch-API hat ungültiges JSON geliefert.');
      return failure('Buch-API nicht erreichbar. Backend mit npm run backend starten und BOOKMONKEY_API_URL prüfen.');
    }
  }

  server.registerTool(
    'list_books',
    {
      title: 'Buchbibliothek auflisten',
      description:
        'Liest den aktuellen Buchbestand, stabil nach ID sortiert. Ohne limit wird die gesamte Bibliothek geliefert.',
      inputSchema: { limit: limitSchema },
      annotations
    },
    async ({ limit }, { signal }) => {
      const params = new URLSearchParams();
      if (limit !== undefined) params.set('_limit', String(limit));
      return request(`books?${params}`, z.array(bookSchema), signal);
    }
  );

  server.registerTool(
    'search_books',
    {
      title: 'Bücher suchen',
      description:
        'Sucht eine zusammenhängende Teilzeichenfolge in Titel, Untertitel, Autor, Verlag, Beschreibung oder ISBN. Groß-/Kleinschreibung wird ignoriert; Filterung erfolgt vor limit.',
      inputSchema: {
        query: z.string().max(500).trim().min(1).describe('Suchtext, maximal 500 Zeichen.'),
        limit: limitSchema
      },
      annotations
    },
    async ({ query, limit }, { signal }) => {
      const params = new URLSearchParams({ q: query });
      if (limit !== undefined) params.set('_limit', String(limit));
      return request(`books?${params}`, z.array(bookSchema), signal);
    }
  );

  server.registerTool(
    'get_book',
    {
      title: 'Buchdetails abrufen',
      description:
        'Liest ein vollständiges Buch anhand seiner exakten ISBN aus der Bibliothek. Die ISBN aus list_books oder search_books unverändert übernehmen.',
      inputSchema: { isbn: z.string().trim().min(1).max(100).describe('ISBN des Buchs als API-Schlüssel.') },
      annotations
    },
    async ({ isbn }, { signal }) => request(`books/${encodeURIComponent(isbn)}`, bookSchema, signal)
  );

  return server;
}

function failure(message: string): CallToolResult {
  return { isError: true, content: [{ type: 'text', text: message }] };
}
