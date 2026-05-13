import { marked } from 'marked';
import hljs from 'highlight.js';
import katex from 'katex';
import { invoke } from '@tauri-apps/api/core';

// Configure marked with GFM and highlight.js
marked.setOptions({
  gfm: true,
  breaks: false,
  pedantic: false,
});

// Custom renderer for code blocks
const renderer = new marked.Renderer();

renderer.image = function ({ href, title, text }) {
  const altText = text || '';
  const titleAttr = title ? ` title="${title.replace(/"/g, '&quot;')}"` : '';
  // Mark href for post-processing; keep original so we can resolve relative paths
  return `<img data-src="${href}" alt="${altText.replace(/"/g, '&quot;')}"${titleAttr}>`;
};

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
 * Resolve image sources in rendered content.
 * - Absolute URLs (http/https/data/file) are passed through
 * - Relative paths are resolved against the markdown file's directory
 *   and loaded as data URLs via the Tauri backend
 */
export async function resolveImages(container, currentFilePath) {
  const images = container.querySelectorAll('img[data-src]');
  if (images.length === 0) return;

  const baseDir = currentFilePath
    ? currentFilePath.substring(0, currentFilePath.lastIndexOf('/'))
    : '';

  for (const img of images) {
    const src = img.getAttribute('data-src');
    img.removeAttribute('data-src');

    if (!src) continue;

    // Pass through remote/data/file URLs
    if (/^(https?:|data:|file:)/.test(src)) {
      img.src = src;
      continue;
    }

    // Resolve absolute or relative local paths
    let absolutePath;
    if (src.startsWith('/')) {
      absolutePath = src;
    } else if (baseDir) {
      absolutePath = `${baseDir}/${src}`;
    } else {
      img.alt = `${img.alt || ''} (image path cannot be resolved: ${src})`;
      continue;
    }

    // Normalize "../" and "./"
    const parts = absolutePath.split('/');
    const normalized = [];
    for (const part of parts) {
      if (part === '..') normalized.pop();
      else if (part !== '.' && part !== '') normalized.push(part);
    }
    absolutePath = '/' + normalized.join('/');

    try {
      const dataUrl = await invoke('read_image_as_data_url', { path: absolutePath });
      img.src = dataUrl;
    } catch (err) {
      console.warn(`Failed to load image ${absolutePath}:`, err);
      img.alt = `${img.alt || ''} (image not found: ${src})`;
    }
  }
}

/**
 * Initialize mermaid diagrams in the rendered content.
 * Lazy-loads mermaid only if needed.
 */
let mermaidLoaded = false;
let mermaidSandbox = null;

function getMermaidSandbox() {
  if (mermaidSandbox && mermaidSandbox.isConnected) return mermaidSandbox;
  mermaidSandbox = document.createElement('div');
  mermaidSandbox.id = 'mermaid-sandbox';
  mermaidSandbox.style.cssText =
    'position:absolute;left:-100000px;top:-100000px;width:0;height:0;overflow:hidden;visibility:hidden;pointer-events:none;';
  document.body.appendChild(mermaidSandbox);
  return mermaidSandbox;
}

function cleanupMermaidOrphans() {
  // Mermaid v11 leaves <div id="dmermaid-*"> and orphan SVGs in body on parse error.
  document.querySelectorAll('body > div[id^="dmermaid-"], body > div[id^="dmermaid_"]').forEach((n) => n.remove());
  document.querySelectorAll('body > svg[id^="mermaid-"], body > svg[aria-roledescription]').forEach((n) => {
    if (n.parentElement === document.body) n.remove();
  });
}

export async function renderMermaidDiagrams(container) {
  const mermaidElements = container.querySelectorAll('.mermaid');
  if (mermaidElements.length === 0) return;

  if (!mermaidLoaded) {
    const mermaid = await import('mermaid');
    mermaid.default.initialize({
      startOnLoad: false,
      theme: window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'default',
      securityLevel: 'loose',
      suppressErrorRendering: true,
    });
    window.__mermaid = mermaid.default;
    mermaidLoaded = true;
  }

  const sandbox = getMermaidSandbox();

  for (let i = 0; i < mermaidElements.length; i++) {
    const el = mermaidElements[i];
    const code = el.textContent;
    try {
      const { svg } = await window.__mermaid.render(`mermaid-${Date.now()}-${i}`, code, sandbox);
      el.innerHTML = svg;
    } catch (err) {
      el.innerHTML = `<pre class="mermaid-error">Mermaid error: ${err.message}</pre>`;
    }
  }

  sandbox.innerHTML = '';
  cleanupMermaidOrphans();
}
