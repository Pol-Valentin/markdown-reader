import { marked } from 'marked';
import hljs from 'highlight.js';
import katex from 'katex';

// Configure marked with GFM and highlight.js
marked.setOptions({
  gfm: true,
  breaks: false,
  pedantic: false,
});

// Custom renderer for code blocks
const renderer = new marked.Renderer();

renderer.code = function ({ text, lang }) {
  // Mermaid blocks are handled separately
  if (lang === 'mermaid') {
    const escaped = text.replace(/"/g, '&quot;');
    return `<div class="mermaid" data-source="${escaped}">${text}</div>`;
  }

  let highlighted;
  if (lang && hljs.getLanguage(lang)) {
    highlighted = hljs.highlight(text, { language: lang }).value;
  } else {
    highlighted = hljs.highlightAuto(text).value;
  }
  const escapedCode = text.replace(/"/g, '&quot;');
  return `<pre data-source="${escapedCode}"><code class="hljs language-${lang || 'plaintext'}">${highlighted}</code></pre>`;
};

marked.use({ renderer });

// KaTeX extension for marked
const katexBlock = {
  name: 'katexBlock',
  level: 'block',
  start(src) { return src.indexOf('$$'); },
  tokenizer(src) {
    const match = src.match(/^\$\$([\s\S]+?)\$\$/);
    if (match) {
      return { type: 'katexBlock', raw: match[0], text: match[1].trim() };
    }
  },
  renderer(token) {
    try {
      return `<div class="katex-block">${katex.renderToString(token.text, { displayMode: true, throwOnError: false })}</div>`;
    } catch {
      return `<div class="katex-error">${token.text}</div>`;
    }
  }
};

const katexInline = {
  name: 'katexInline',
  level: 'inline',
  start(src) { return src.indexOf('$'); },
  tokenizer(src) {
    const match = src.match(/^\$([^\$\n]+?)\$/);
    if (match) {
      return { type: 'katexInline', raw: match[0], text: match[1].trim() };
    }
  },
  renderer(token) {
    try {
      return katex.renderToString(token.text, { displayMode: false, throwOnError: false });
    } catch {
      return `<span class="katex-error">${token.text}</span>`;
    }
  }
};

marked.use({ extensions: [katexBlock, katexInline] });

/**
 * Strip YAML front matter from markdown content
 */
function stripFrontMatter(content) {
  const match = content.match(/^---\n([\s\S]*?)\n---\n?/);
  if (match) {
    return content.slice(match[0].length);
  }
  return content;
}

/**
 * Generate table of contents from headings
 */
export function generateTOC(content) {
  const headings = [];
  const tokens = marked.lexer(stripFrontMatter(content));

  for (const token of tokens) {
    if (token.type === 'heading') {
      const id = token.text.toLowerCase().replace(/[^\w]+/g, '-');
      headings.push({ level: token.depth, text: token.text, id });
    }
  }

  return headings;
}

/**
 * Render markdown content to HTML
 */
export function renderMarkdown(content) {
  const stripped = stripFrontMatter(content);
  return marked.parse(stripped);
}

/**
 * Initialize mermaid diagrams in the rendered content.
 * Lazy-loads mermaid only if needed.
 */
let mermaidLoaded = false;
export async function renderMermaidDiagrams(container) {
  const mermaidElements = container.querySelectorAll('.mermaid');
  if (mermaidElements.length === 0) return;

  if (!mermaidLoaded) {
    const mermaid = await import('mermaid');
    mermaid.default.initialize({
      startOnLoad: false,
      theme: window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'default',
      securityLevel: 'loose',
    });
    window.__mermaid = mermaid.default;
    mermaidLoaded = true;
  }

  // Re-render mermaid diagrams
  for (let i = 0; i < mermaidElements.length; i++) {
    const el = mermaidElements[i];
    const code = el.textContent;
    try {
      const { svg } = await window.__mermaid.render(`mermaid-${Date.now()}-${i}`, code);
      el.innerHTML = svg;
    } catch (err) {
      el.innerHTML = `<pre class="mermaid-error">Mermaid error: ${err.message}</pre>`;
    }
  }
}
