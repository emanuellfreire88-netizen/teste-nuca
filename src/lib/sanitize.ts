/**
 * HTML sanitization utility to prevent XSS attacks.
 * Uses isomorphic-dompurify (works on both server and client).
 *
 * IMPORTANT: Always use this before rendering any user-provided HTML
 * with dangerouslySetInnerHTML.
 */
import DOMPurify from 'isomorphic-dompurify';

/**
 * Sanitize HTML to prevent XSS attacks.
 * Allows safe tags and attributes needed for rich text documents,
 * strips all dangerous content (scripts, event handlers, etc.).
 *
 * @param html - The HTML string to sanitize
 * @returns Sanitized HTML safe to render with dangerouslySetInnerHTML
 */
export function sanitizeHtml(html: string): string {
  if (!html) return '';

  return DOMPurify.sanitize(html, {
    // Allow common formatting tags used in rich text editors
    ALLOWED_TAGS: [
      'p', 'br', 'strong', 'b', 'em', 'i', 'u', 's', 'strike',
      'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
      'ul', 'ol', 'li',
      'blockquote', 'code', 'pre',
      'a', 'img',
      'table', 'thead', 'tbody', 'tr', 'th', 'td',
      'div', 'span', 'hr',
      'sub', 'sup', 'small',
    ],
    // Allow safe attributes
    ALLOWED_ATTR: [
      'href', 'src', 'alt', 'title', 'width', 'height',
      'class', 'style',
      'target', 'rel',
      'colspan', 'rowspan',
      'align', 'valign',
    ],
    // Force rel="noopener noreferrer" on target="_blank" links
    ALLOW_DATA_ATTR: false,
    FORBID_TAGS: ['script', 'iframe', 'object', 'embed', 'form', 'input', 'style'],
    FORBID_ATTR: ['onerror', 'onload', 'onclick', 'onmouseover', 'onfocus', 'onblur'],
  });
}
