/**
 * Snapshot engine for agent-tauri.
 * Creates an accessibility / interactive element tree with unique reference markers (@e1, @e2, ...)
 * and enables visual annotation overlays for multimodal models.
 */

async function collectElements(page, options = {}) {
  const interactiveOnly = options.interactive === true;

  const snapshotData = await page.evaluate((isInteractiveOnly) => {
    // Clear any previous references
    const prevTagged = document.querySelectorAll('[data-agent-ref]');
    prevTagged.forEach((el) => el.removeAttribute('data-agent-ref'));

    let refCounter = 1;
    const elements = [];

    // Helper to test visibility
    function isVisible(el) {
      if (!el) return false;
      const style = window.getComputedStyle(el);
      if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
        return false;
      }
      const rect = el.getBoundingClientRect();
      if (rect.width <= 0 && rect.height <= 0) {
        return false;
      }
      return true;
    }

    // Helper to determine if an element is interactive
    function isInteractive(el) {
      const tag = el.tagName.toLowerCase();
      const role = el.getAttribute('role') || '';
      const tabIndex = el.getAttribute('tabindex');

      if (['button', 'input', 'select', 'textarea', 'a', 'summary'].includes(tag)) {
        return true;
      }
      if (['button', 'link', 'checkbox', 'radio', 'combobox', 'textbox', 'menuitem', 'tab', 'switch'].includes(role)) {
        return true;
      }
      if (tabIndex !== null && !isNaN(parseInt(tabIndex, 10)) && parseInt(tabIndex, 10) >= 0) {
        return true;
      }
      if (el.isContentEditable) {
        return true;
      }
      if (typeof el.onclick === 'function' || el.hasAttribute('onclick')) {
        return true;
      }
      return false;
    }

    // Helper to get accessible text
    function getAccessibleText(el) {
      const ariaLabel = el.getAttribute('aria-label');
      if (ariaLabel && ariaLabel.trim()) return ariaLabel.trim();

      const ariaLabelledby = el.getAttribute('aria-labelledby');
      if (ariaLabelledby) {
        const lbl = document.getElementById(ariaLabelledby);
        if (lbl && lbl.textContent.trim()) return lbl.textContent.trim();
      }

      if (el.tagName.toLowerCase() === 'input') {
        const type = el.getAttribute('type') || 'text';
        if (['button', 'submit', 'reset'].includes(type) && el.value) {
          return el.value.trim();
        }
        if (el.placeholder) return el.placeholder.trim();
      }

      // Check textContent
      const text = (el.innerText || el.textContent || '').trim();
      // Normalize whitespace
      return text.replace(/\s+/g, ' ').substring(0, 100);
    }

    // Tree walker or querySelectorAll for all potential targets
    const all = document.querySelectorAll('*');
    for (const el of all) {
      if (!isVisible(el)) continue;

      const interactive = isInteractive(el);
      const tag = el.tagName.toLowerCase();
      const isHeading = /^h[1-6]$/.test(tag);
      const isImportantSemantic = isHeading || tag === 'dialog' || tag === 'main' || tag === 'form';

      if (isInteractiveOnly && !interactive) {
        continue;
      }

      // If not interactive and not important semantic, skip if it has no direct text or child elements
      if (!interactive && !isImportantSemantic) {
        // Only include non-interactive if it has short, direct text content
        const directText = Array.from(el.childNodes)
          .filter(n => n.nodeType === Node.TEXT_NODE)
          .map(n => n.textContent.trim())
          .join(' ')
          .trim();
        if (!directText || directText.length > 80) continue;
      }

      const refId = `e${refCounter++}`;
      el.setAttribute('data-agent-ref', refId);

      const rect = el.getBoundingClientRect();
      const role = el.getAttribute('role') || tag;
      const text = getAccessibleText(el);
      const disabled = el.hasAttribute('disabled') || el.getAttribute('aria-disabled') === 'true';
      const checked = el.checked ?? (el.getAttribute('aria-checked') === 'true' ? true : undefined);
      const value = el.value !== undefined ? el.value : undefined;
      const placeholder = el.getAttribute('placeholder') || undefined;

      elements.push({
        ref: `@${refId}`,
        refId,
        tag,
        role,
        text,
        interactive,
        disabled,
        checked,
        value,
        placeholder,
        box: {
          x: Math.round(rect.x),
          y: Math.round(rect.y),
          width: Math.round(rect.width),
          height: Math.round(rect.height),
        },
      });
    }

    return {
      title: document.title || 'Untitled',
      url: window.location.href,
      elements,
    };
  }, interactiveOnly);

  return snapshotData;
}

function formatSnapshotText(snapshotData, options = {}) {
  const { title, url, elements } = snapshotData;
  const lines = [];

  lines.push(`Window: "${title}" (${url})`);
  lines.push('------------------------------------------------------------');

  if (elements.length === 0) {
    lines.push('  (No matching interactive elements found)');
    return lines.join('\n');
  }

  for (const el of elements) {
    const parts = [];
    parts.push(`- [${el.ref}]`);

    // Element type / role
    if (el.role && el.role !== el.tag) {
      parts.push(`[${el.role}]`);
    } else {
      parts.push(`[${el.tag}]`);
    }

    // Accessible text or placeholder
    if (el.text) {
      parts.push(`"${el.text}"`);
    }

    // Extra details
    const extras = [];
    if (el.placeholder && !el.text) {
      extras.push(`placeholder="${el.placeholder}"`);
    }
    if (el.value !== undefined && el.value !== '') {
      extras.push(`value="${el.value}"`);
    }
    if (el.checked !== undefined) {
      extras.push(`checked=${el.checked}`);
    }
    if (el.disabled) {
      extras.push('disabled');
    }

    if (extras.length > 0) {
      parts.push(`(${extras.join(', ')})`);
    }

    lines.push(`  ${parts.join(' ')}`);
  }

  return lines.join('\n');
}

/**
 * Overlay visual bounding boxes and ref badges for visual screenshot annotation.
 */
async function injectAnnotations(page) {
  await page.evaluate(() => {
    const container = document.createElement('div');
    container.id = '__agent_tauri_annotations__';
    container.style.position = 'fixed';
    container.style.top = '0';
    container.style.left = '0';
    container.style.width = '100vw';
    container.style.height = '100vh';
    container.style.pointerEvents = 'none';
    container.style.zIndex = '2147483647';

    const tagged = document.querySelectorAll('[data-agent-ref]');
    tagged.forEach((el) => {
      const refId = el.getAttribute('data-agent-ref');
      const rect = el.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;

      const box = document.createElement('div');
      box.style.position = 'absolute';
      box.style.left = `${rect.left}px`;
      box.style.top = `${rect.top}px`;
      box.style.width = `${rect.width}px`;
      box.style.height = `${rect.height}px`;
      box.style.border = '2px solid #ef4444';
      box.style.boxSizing = 'border-box';

      const badge = document.createElement('div');
      badge.textContent = `@${refId}`;
      badge.style.position = 'absolute';
      badge.style.top = '-18px';
      badge.style.left = '0';
      badge.style.background = '#ef4444';
      badge.style.color = '#ffffff';
      badge.style.fontSize = '11px';
      badge.style.fontWeight = 'bold';
      badge.style.padding = '1px 4px';
      badge.style.borderRadius = '3px';
      badge.style.whiteSpace = 'nowrap';
      badge.style.lineHeight = '14px';

      box.appendChild(badge);
      container.appendChild(box);
    });

    document.body.appendChild(container);
  });
}

/**
 * Remove visual annotations overlay.
 */
async function removeAnnotations(page) {
  await page.evaluate(() => {
    const container = document.getElementById('__agent_tauri_annotations__');
    if (container) {
      container.remove();
    }
  });
}

module.exports = {
  collectElements,
  formatSnapshotText,
  injectAnnotations,
  removeAnnotations,
};
