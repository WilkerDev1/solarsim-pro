import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { parseChatMarkdown } from '../features/assistant/chatMarkdown';
import { ChatMessage } from '../features/assistant/components/ChatMessage';

// 1. Block structure.
assert.deepEqual(parseChatMarkdown('Hola **mundo**'), [{ type: 'p', inlines: [{ t: 'text', v: 'Hola ' }, { t: 'b', v: 'mundo' }] }]);
assert.deepEqual(parseChatMarkdown('## Resumen\n- uno\n- *dos*\n\n1. a\n2. `b`').map((b) => b.type), ['h', 'ul', 'ol']);
const list = parseChatMarkdown('- uno\n- *dos*')[0];
assert(list.type === 'ul' && list.items.length === 2 && list.items[1][0].t === 'i');
assert.deepEqual(parseChatMarkdown('línea 1\nlínea 2')[0], { type: 'p', inlines: [{ t: 'text', v: 'línea 1' }, { t: 'br', v: '' }, { t: 'text', v: 'línea 2' }] });
assert.deepEqual(parseChatMarkdown(''), []);
assert.deepEqual(parseChatMarkdown('a ** b'), [{ type: 'p', inlines: [{ t: 'text', v: 'a ** b' }] }], 'unbalanced markers stay literal');

// 2. Rendering never injects HTML and links are not clickable.
const html = renderToStaticMarkup(React.createElement(ChatMessage, { role: 'assistant', text: '<img src=x onerror=alert(1)> **ok** [sitio](https://evil.invalid)' }));
assert(!html.includes('<img'), 'markup is escaped');
assert(html.includes('&lt;img'));
assert(html.includes('<strong>ok</strong>'));
assert(!html.includes('<a '), 'no anchors');
// 3. User text stays plain.
const user = renderToStaticMarkup(React.createElement(ChatMessage, { role: 'user', text: '**literal**' }));
assert(user.includes('**literal**'));
console.log('PASS: chat markdown subset (paragraphs, headings, lists, bold, italic, code) rendered without HTML or links.');
