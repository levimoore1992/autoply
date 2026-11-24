// Content script for Autoply Copilot
// Works entirely client-side using Chrome's autocomplete attribute + semantic matching
// No AI needed for basic form filling - this is how simplify.jobs works
import {
  canRememberField,
  normalizeAnswerQuestion,
  checkboxResponse,
} from '../utils/answer-memory';
import { resumeInputPriority } from './utils/resume-input';
import { applicationIdentity, isSubmissionConfirmation } from '../utils/submission-confirmation';

// Observe SPA confirmation screens as well as confirmations present at page load.
if (window.top === window && applicationIdentity(location.href)) {
  let reported = false;
  let checking = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const checkSubmission = async () => {
    if (reported || checking) return;
    const hasSubmit = Array.from(document.querySelectorAll('button, input[type="submit"]')).some(
      (el) =>
        isVisible(el) &&
        /submit application|apply now/i.test(el.textContent || (el as HTMLInputElement).value || '')
    );
    if (hasSubmit) return;
    const confirmation = Array.from(
      document.querySelectorAll('[role="status"], [role="alert"], h1, h2, h3')
    )
      .filter(isVisible)
      .map(
        (el) =>
          (el.matches('h1,h2,h3') ? el.parentElement?.innerText : (el as HTMLElement).innerText) ||
          ''
      )
      .find((text) => text.length <= 1000 && isSubmissionConfirmation(text));
    if (!confirmation) return;
    checking = true;
    try {
      const result = await chrome.runtime.sendMessage({
        type: 'SUBMISSION_CONFIRMED',
        url: location.href,
        confirmation,
      });
      reported = result?.success === true;
    } catch {
      /* An extension reload or unavailable worker can be retried. */
    } finally {
      checking = false;
    }
  };
  const observer = new MutationObserver(() => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      void checkSubmission();
    }, 500);
  });
  observer.observe(document.documentElement, {
    childList: true,
    characterData: true,
    subtree: true,
  });
  void checkSubmission();
}

const checkboxAnswers = new WeakMap<HTMLInputElement, boolean>();
const DEBUG = false;
function debugLog(...args: unknown[]) {
  if (DEBUG) {
    console.log(...args);
  }
}

const AUTOCOMPLETE_TO_PROFILE_KEY: Record<string, string> = {
  'given-name': 'firstName',
  'additional-name': 'middleName',
  'family-name': 'lastName',
  name: 'fullName',
  email: 'email',
  tel: 'phone',
  'tel-national': 'phone',
  url: 'url',
  photo: 'photoUrl',
  nickname: 'nickname',
};

// Map name attributes to profile keys (handles Workable, Ashby, etc.)
const NAME_TO_PROFILE_KEY: Record<string, string> = {
  firstname: 'firstName',
  first_name: 'firstName',
  lastname: 'lastName',
  last_name: 'lastName',
  email: 'email',
  phone: 'phone',
  telephone: 'phone',
  mobile: 'phone',
  headline: 'headline',
  address: 'address',
  city: 'city',
  location: 'location',
  postcode: 'postcode',
  zip: 'postcode',
  zipcode: 'postcode',
  country: 'country',
  state: 'location',
  province: 'location',
  linkedin: 'linkedin',
  github: 'github',
  portfolio: 'portfolio',
  website: 'portfolio',
  url: 'url',
  name: 'fullName',
  fullname: 'fullName',
  full_name: 'fullName',
  // Ashby system field keys
  systemfieldname: 'fullName',
  systemfieldemail: 'email',
  systemfieldphone: 'phone',
  systemfieldlocation: 'location',
  systemfieldlinkedin: 'linkedin',
  systemfieldgithub: 'github',
  systemfieldportfolio: 'portfolio',
  systemfieldwebsite: 'portfolio',
  systemfieldurls: 'portfolio',
  systemfieldresume: 'resumeUrl',
};

interface Profile {
  // Standard fields
  firstName: string;
  lastName: string;
  fullName: string;
  middleName?: string;
  email: string;
  phone: string;
  location?: string;
  linkedin?: string;
  github?: string;
  portfolio?: string;
  photoUrl?: string;
  nickname?: string;
  resumeUrl?: string;
  // Extended fields (Workable, Ashby, etc.)
  address?: string;
  city?: string;
  postcode?: string;
  country?: string;
  state?: string;
  headline?: string;
}

const HUMAN_ONLY_PATTERNS = [
  /gender|sex/i,
  /ethnicity|race/i,
  /veteran/i,
  /disability/i,
  /ssn|social.*security/i,
  /salary.*expectation|expected.*salary|desired.*salary/i,
  /date.*birth|dob/i,
  /street.*address|address.*line/i,
  /passport/i,
];

function shouldSkipField(label: string): boolean {
  return HUMAN_ONLY_PATTERNS.some((pattern) => pattern.test(label));
}

function isFormElement(el: Element): boolean {
  const tagName = el.tagName;
  if (!['INPUT', 'TEXTAREA', 'SELECT'].includes(tagName)) {
    const role = el.getAttribute('role');
    const popup = el.getAttribute('aria-haspopup');
    if (role === 'combobox' || popup === 'listbox') return true;
    return false;
  }

  const input = el as HTMLInputElement;
  if (
    ['hidden', 'submit', 'button', 'reset', 'image'].includes(input.type) &&
    input.getAttribute('role') !== 'combobox'
  )
    return false;

  return true;
}

function isVisible(el: Element): boolean {
  const style = window.getComputedStyle(el);
  if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0')
    return false;
  const rect = (el as HTMLElement).getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}

function getFieldLabel(el: Element): string {
  const input = el as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;

  // Try aria-label
  const ariaLabel = input.getAttribute('aria-label');
  if (ariaLabel) return ariaLabel;

  const labelledBy = input.getAttribute('aria-labelledby');
  if (labelledBy) {
    const label = labelledBy
      .split(/\s+/)
      .map((id) => document.getElementById(id)?.textContent ?? '')
      .join(' ')
      .trim();
    if (label) return label;
  }

  // Try associated label
  const id = input.id;
  if (id) {
    const label = document.querySelector(`label[for="${CSS.escape(id)}"]`);
    if (label?.textContent) return label.textContent.trim();
  }

  // Try parent label
  const parentLabel = input.closest('label');
  if (parentLabel?.textContent) return parentLabel.textContent.trim();

  // Try field container label (Ashby, Greenhouse, Lever, Workday)
  const container = input.closest(
    '.ashby-application-form-field, .ashby-application-form-field-entry, [data-field-path], [data-testid*="field"], [data-testid*="question"], [class*="form-field"], [class*="FormField"], fieldset, [role="group"]'
  );
  if (container) {
    const labelEl = container.querySelector(
      'label, [class*="label"], [data-testid*="label"], legend, span[class*="Label"]'
    );
    if (labelEl?.textContent) {
      const text = labelEl.textContent.trim();
      if (text) return text;
    }
  }

  const autocomplete = input.getAttribute('autocomplete');
  if (autocomplete && !['off', 'on'].includes(autocomplete)) return autocomplete;

  const placeholder = input.getAttribute('placeholder');
  if (placeholder && !/^type here|select|choose/i.test(placeholder)) return placeholder;

  // Try name attribute
  const name = input.name;
  if (name) return name;

  return '';
}

const CHOICE_SELECTOR = 'button[aria-pressed], [role="radio"]';

function choiceButtons(group: Element): HTMLElement[] {
  return Array.from(group.querySelectorAll<HTMLElement>(CHOICE_SELECTOR)).filter(
    (button) => isVisible(button) && button.getAttribute('type') !== 'submit'
  );
}

function collectChoiceGroups(): Element[] {
  const groups = new Set<Element>();
  for (const button of Array.from(document.querySelectorAll(CHOICE_SELECTOR))) {
    const group = button.closest(
      'fieldset, [role="radiogroup"], .ashby-application-form-field, .ashby-application-form-field-entry, [data-field-path], [class*="FormField"], [role="group"]'
    );
    if (group && choiceButtons(group).length > 1 && getFieldLabel(group)) groups.add(group);
  }
  return [...groups];
}

function choiceText(button: HTMLElement): string {
  return (button.getAttribute('aria-label') || button.textContent || '').trim();
}

function choiceSelected(button: HTMLElement): boolean {
  return (
    button.getAttribute('aria-pressed') === 'true' || button.getAttribute('aria-checked') === 'true'
  );
}

function dispatchReactEvents(el: Element): void {
  const target = el as HTMLElement;

  // React/Angular/Vue all listen to these events
  target.dispatchEvent(new FocusEvent('focus', { bubbles: true }));
  target.dispatchEvent(new InputEvent('input', { bubbles: true, cancelable: true }));
  target.dispatchEvent(new Event('change', { bubbles: true }));
  target.dispatchEvent(new FocusEvent('blur', { bubbles: true }));
}

function setNativeInputValue(input: HTMLInputElement | HTMLTextAreaElement, value: string): void {
  if (input instanceof HTMLInputElement) {
    // Get the native value setter from HTMLInputElement prototype
    const nativeValueSetter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      'value'
    )?.set;

    if (nativeValueSetter) {
      // Use native setter (works for React controlled components)
      nativeValueSetter.call(input, value);
    } else {
      // Fallback
      input.value = value;
    }
  } else {
    // HTMLTextAreaElement
    input.value = value;
  }

  // React needs these specific events
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
}

async function fillTextInput(el: Element, value: string): Promise<boolean> {
  try {
    const input = el as HTMLInputElement | HTMLTextAreaElement;

    // Check if it's a custom dropdown
    if (isCustomDropdown(el as HTMLElement)) {
      return fillCustomDropdown(el as HTMLElement, value);
    }

    input.focus();
    await humanJitter(20, 80); // brief pause after focus — mimics human reading the field
    input.select?.();
    setNativeInputValue(input, value);

    return true;
  } catch {
    return false;
  }
}

function isCustomDropdown(el: HTMLElement): boolean {
  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
    const input = el as HTMLInputElement;
    const type = input.type?.toLowerCase();
    const isStandardTextInput =
      ['text', 'email', 'tel', 'url', 'password', 'number', 'search'].includes(type) ||
      input.tagName === 'TEXTAREA';

    const role = input.getAttribute('role')?.toLowerCase();
    const hasPopup = input.getAttribute('aria-haspopup');
    const isReadOnly = input.readOnly;

    if (isStandardTextInput && !isReadOnly && role !== 'combobox' && !hasPopup) {
      return false;
    }
  }

  const role = el.getAttribute('role');
  if (role === 'combobox' || role === 'listbox') return true;

  const parent = el.closest(
    '[role="combobox"], [aria-haspopup="listbox"], [data-testid*="select"], [class*="react-select"], [class*="custom-select"], [class*="Select-control"]'
  );
  return parent !== null;
}

// Small random delay to mimic human reaction time and avoid bot-detection heuristics.
// Kept short (30–120ms) so it doesn't noticeably slow fills but breaks timing fingerprints.
function humanJitter(minMs = 30, maxMs = 120): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, minMs + Math.random() * (maxMs - minMs)));
}

function waitForElement(selector: string, timeoutMs = 400): Promise<Element | null> {
  return new Promise((resolve) => {
    const existing = document.querySelector(selector);
    if (existing) return resolve(existing);

    const observer = new MutationObserver(() => {
      const el = document.querySelector(selector);
      if (el) {
        observer.disconnect();
        resolve(el);
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
    setTimeout(() => {
      observer.disconnect();
      resolve(null);
    }, timeoutMs);
  });
}

async function fillCustomDropdown(el: HTMLElement, value: string): Promise<boolean> {
  try {
    el.click();

    // Wait for options to appear rather than sleeping a fixed time
    const optionEl = await waitForElement(
      '[role="option"], [role="listbox"] li, [class*="option"], [class*="menu"] li, ul[role="listbox"] li, [data-testid*="option"]'
    );

    if (optionEl) {
      const allOptions = Array.from(
        document.querySelectorAll(
          '[role="option"], [role="listbox"] li, [class*="option"], [class*="menu"] li, ul[role="listbox"] li, [data-testid*="option"]'
        )
      );
      const lv = value.toLowerCase();
      for (const option of allOptions) {
        const text = option.textContent?.toLowerCase() || '';
        if (text.includes(lv) || lv.includes(text)) {
          await humanJitter(60, 180); // pause before selecting — mimics scanning the list
          (option as HTMLElement).click();
          return true;
        }
      }
    }

    // Fallback: type to filter via combobox input
    const combobox = document.querySelector(
      '[role="combobox"], input[class*="select"]'
    ) as HTMLInputElement | null;
    if (combobox) {
      combobox.value = value;
      combobox.dispatchEvent(new InputEvent('input', { bubbles: true }));

      const firstOption = await waitForElement('[role="option"], [data-testid*="option"]');
      if (firstOption) {
        (firstOption as HTMLElement).click();
        return true;
      }
    }

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    return false;
  } catch {
    return false;
  }
}

async function fillSelect(el: Element, value: string): Promise<boolean> {
  try {
    if (isCustomDropdown(el as HTMLElement)) {
      return fillCustomDropdown(el as HTMLElement, value);
    }

    const select = el as HTMLSelectElement;
    const normalizedValue = value.toLowerCase().trim();

    const options = Array.from(select.options);
    const matched =
      options.find((opt) => opt.value.toLowerCase() === normalizedValue) ||
      options.find((opt) => opt.textContent?.toLowerCase().includes(normalizedValue));

    if (matched) {
      select.value = matched.value;
      dispatchReactEvents(el);
      return true;
    }

    return false;
  } catch {
    return false;
  }
}

async function fillRadio(el: Element, value: string): Promise<boolean> {
  try {
    const radio = el as HTMLInputElement;
    const normalizedValue = value.toLowerCase().trim();

    const name = radio.name;
    const radios = name
      ? Array.from(document.querySelectorAll(`input[type="radio"][name="${name}"]`))
      : [radio];

    for (const r of radios) {
      const radioEl = r as HTMLInputElement;
      const radioValue = radioEl.value?.toLowerCase() || '';
      const label = radioEl.closest('label')?.textContent?.toLowerCase() || '';

      if (
        radioValue === normalizedValue ||
        label.includes(normalizedValue) ||
        normalizedValue.includes(radioValue)
      ) {
        radioEl.checked = true;
        dispatchReactEvents(r);
        return true;
      }
    }

    return false;
  } catch {
    return false;
  }
}

async function fillCheckbox(el: Element, value: string): Promise<boolean> {
  try {
    const checkbox = el as HTMLInputElement;
    const shouldCheck = ['yes', 'true', '1', 'y'].includes(value.toLowerCase());
    checkboxAnswers.set(checkbox, shouldCheck);

    if (checkbox.checked !== shouldCheck) {
      checkbox.checked = shouldCheck;
      dispatchReactEvents(el);
    }

    return true;
  } catch {
    return false;
  }
}

async function uploadResumeFile(base64: string, filename: string): Promise<boolean> {
  const fileInputs = Array.from(
    document.querySelectorAll('input[type="file"]')
  ) as HTMLInputElement[];

  const candidates = fileInputs
    .map((input) => {
      const container =
        input.closest(
          '.ashby-application-form-field, .ashby-application-form-field-entry, [data-field-path], [data-testid*="field"], [class*="FormField"], fieldset'
        ) || input.parentElement;
      return {
        input,
        priority: resumeInputPriority({
          name: input.name,
          id: input.id,
          label: getFieldLabel(input),
          context: container?.textContent || '',
          accept: input.accept,
        }),
      };
    })
    .filter(({ priority }) => priority >= 0)
    .sort((a, b) => b.priority - a.priority);
  for (const { input } of candidates) {
    const container = input.closest(
      '.ashby-application-form-field, .ashby-application-form-field-entry, [data-field-path], [data-testid*="field"], [data-testid*="resume"], [class*="resume"], label, fieldset, div'
    );
    const context = (
      input.name +
      ' ' +
      input.id +
      ' ' +
      (input.getAttribute('aria-label') || '') +
      ' ' +
      (container?.textContent || '') +
      ' ' +
      (input.getAttribute('accept') || '')
    ).toLowerCase();

    if (
      context.includes('resume') ||
      context.includes('cv') ||
      context.includes('curriculum') ||
      context.includes('.pdf') ||
      context.includes('systemfield_resume')
    ) {
      try {
        const mimeType = 'application/pdf';
        const byteString = atob(base64.split(',')[1] || base64);
        const ab = new ArrayBuffer(byteString.length);
        const ia = new Uint8Array(ab);
        for (let i = 0; i < byteString.length; i++) ia[i] = byteString.charCodeAt(i);
        const blob = new Blob([ab], { type: mimeType });
        const file = new File([blob], filename, { type: mimeType });
        const dataTransfer = new DataTransfer();
        dataTransfer.items.add(file);
        input.files = dataTransfer.files;
        input.dispatchEvent(new Event('change', { bubbles: true }));
        input.dispatchEvent(new InputEvent('input', { bubbles: true }));
        console.log(`Autoply: Resume uploaded to input[name="${input.name || input.id}"]`);
        return true;
      } catch {
        // try next input
      }
    }
  }
  return false;
}

// Classify a form element to a profile key using a single ordered lookup chain.
// Checks: autocomplete attr → name attr → id attr → label/placeholder text.
function classifyElement(el: Element, label: string): string | null {
  const input = el as HTMLInputElement;

  // 1. Autocomplete attribute — most reliable signal
  const autocomplete = input.getAttribute('autocomplete');
  if (autocomplete) {
    const key = AUTOCOMPLETE_TO_PROFILE_KEY[autocomplete.toLowerCase()];
    if (key) return key;
  }

  // 2. Name attribute — direct and partial match
  const name = input.name?.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (name) {
    for (const [nameAttr, profileKey] of Object.entries(NAME_TO_PROFILE_KEY)) {
      const normalized = nameAttr.toLowerCase().replace(/[^a-z0-9]/g, '');
      if (name === normalized || name.includes(normalized) || normalized.includes(name)) {
        return profileKey;
      }
    }
  }

  // 3. ID attribute — same pattern
  const id = input.id?.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (id) {
    for (const [nameAttr, profileKey] of Object.entries(NAME_TO_PROFILE_KEY)) {
      const normalized = nameAttr.toLowerCase().replace(/[^a-z0-9]/g, '');
      if (id === normalized || id.includes(normalized) || normalized.includes(id)) {
        return profileKey;
      }
    }
  }

  // 4. Label / placeholder / aria-label text
  if (label) {
    const l = label.toLowerCase();
    if (/first|given|\bfname\b/i.test(l) && !/last/i.test(l)) return 'firstName';
    if (/last|surname|family|\blname\b/i.test(l)) return 'lastName';
    if (/full[\s-]?name|your[\s-]?name|\bname\b/i.test(l)) return 'fullName';
    if (/\bemail\b|e-?mail/i.test(l)) return 'email';
    if (/\bphone\b|\btel\b|mobile|cell/i.test(l)) return 'phone';
    if (/linkedin/i.test(l)) return 'linkedin';
    if (/\bgithub\b/i.test(l)) return 'github';
    if (/portfolio|personal[\s-]?site|personal[\s-]?url/i.test(l)) return 'portfolio';
    if (/\bcity\b|location|address/i.test(l)) return 'location';
    if (/\bwebsite\b/i.test(l)) return 'portfolio';
  }

  return null;
}

async function fillAllFields(profile: Profile): Promise<{ filled: string[]; errors: string[] }> {
  const filled: string[] = [];
  const filledKeys = new Set<string>();

  // Single DOM query — covers standard form fields and custom combobox controls (e.g. Ashby)
  const allInputs = Array.from(
    document.querySelectorAll<Element>(
      'input:not([type="hidden"]):not([type="submit"]):not([type="button"]):not([type="reset"]):not([type="image"]), select, textarea, [role="combobox"], [aria-haspopup="listbox"]'
    )
  );

  for (const el of allInputs) {
    if (!isVisible(el)) continue;

    const label = getFieldLabel(el);
    if (shouldSkipField(label)) continue;

    const profileKey = classifyElement(el, label);
    if (!profileKey || filledKeys.has(profileKey)) continue;

    const value = profile[profileKey as keyof Profile];
    if (!value) continue;

    const fieldType = (el as HTMLInputElement).type;
    let success = false;

    if (fieldType === 'select' || el.tagName === 'SELECT') {
      success = await fillSelect(el, value);
    } else if (fieldType === 'radio') {
      success = await fillRadio(el, value);
    } else if (fieldType === 'checkbox') {
      success = await fillCheckbox(el, value);
    } else if (fieldType !== 'file') {
      success = await fillTextInput(el, value);
    }

    if (success) {
      filledKeys.add(profileKey);
      filled.push(profileKey);
      debugLog(`Autoply: filled ${profileKey} = "${value}"`);
      await humanJitter(80, 250); // inter-field delay — breaks robotic fill timing fingerprint
    }
  }

  // Fill inside iframes (Ashby and other platforms that embed forms)
  const iframes = Array.from(document.querySelectorAll('iframe'));
  for (const iframe of iframes) {
    try {
      const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
      if (!iframeDoc) continue;

      const iframeInputs = Array.from(
        iframeDoc.querySelectorAll<Element>(
          'input:not([type="hidden"]):not([type="submit"]):not([type="button"]):not([type="reset"]), select, textarea'
        )
      );

      for (const field of iframeInputs) {
        if (!isFormElement(field)) continue;
        if (!isVisible(field)) continue;

        const label = getFieldLabel(field);
        if (shouldSkipField(label)) continue;

        const profileKey = classifyElement(field, label);
        if (!profileKey || filledKeys.has(profileKey)) continue;

        const value = profile[profileKey as keyof Profile];
        if (!value) continue;

        const fieldType = (field as HTMLInputElement).type;
        let success = false;

        if (fieldType === 'select' || field.tagName === 'SELECT') {
          success = await fillSelect(field, value);
        } else if (fieldType !== 'file') {
          success = await fillTextInput(field, value);
        }

        if (success) {
          filledKeys.add(profileKey);
          filled.push(profileKey);
        }
      }
    } catch {
      // Cross-origin iframe — skip silently
    }
  }

  return { filled, errors: [] };
}

// Returns true if the key looks like a label string (e.g. "First Name") rather than
// a DOM attribute value (e.g. "firstname" / "first_name").
function looksLikeLabel(key: string): boolean {
  return /\s/.test(key) || key.length === 0;
}

async function fillByFillPlan(
  fillPlan: Record<string, string>,
  _alreadyFilled: Set<string>,
  savedKeys: Set<string> = new Set()
): Promise<string[]> {
  const filled: string[] = [];

  for (const [fieldKey, value] of Object.entries(fillPlan)) {
    if (!value) continue;

    const choiceGroup = document.querySelector(
      `[data-autoply-choice-key="${CSS.escape(fieldKey)}"]`
    );
    if (choiceGroup) {
      if (shouldSkipField(getFieldLabel(choiceGroup)) && !savedKeys.has(fieldKey)) continue;
      const button = choiceButtons(choiceGroup).find(
        (option) => choiceText(option).toLowerCase() === value.toLowerCase().trim()
      );
      if (button) {
        if (!choiceSelected(button)) button.click();
        await humanJitter(80, 150);
        if (choiceSelected(button)) filled.push(fieldKey);
      }
      continue;
    }

    let didFill = false;

    if (looksLikeLabel(fieldKey)) {
      const field = Array.from(document.querySelectorAll('input, select, textarea')).find(
        (el) =>
          isVisible(el) &&
          getFieldLabel(el)
            .replace(/\s*\*$/, '')
            .toLowerCase() === fieldKey.replace(/\s*\*$/, '').toLowerCase()
      );
      if (field && (!shouldSkipField(getFieldLabel(field)) || savedKeys.has(fieldKey))) {
        didFill =
          field.tagName === 'SELECT'
            ? await fillSelect(field, value)
            : await fillTextInput(field, value);
      }
    } else {
      // Key is a DOM attribute value — try name/id selectors
      const selectors = [
        `[name="${CSS.escape(fieldKey)}"]`,
        `[id="${CSS.escape(fieldKey)}"]`,
        `[name="${CSS.escape(fieldKey.toLowerCase())}"]`,
        `[data-field="${CSS.escape(fieldKey)}"]`,
        `[data-autoply-field-key="${CSS.escape(fieldKey)}"]`,
      ];

      for (const selector of selectors) {
        const elements = Array.from(document.querySelectorAll(selector));
        for (const el of elements) {
          if (!isFormElement(el) || !isVisible(el)) continue;
          const label = getFieldLabel(el);
          if (shouldSkipField(label) && !savedKeys.has(fieldKey)) continue;

          // Skip if element already has the correct value (idempotent check)
          const currentVal = (el as HTMLInputElement).value;
          if (currentVal && currentVal === value) {
            didFill = savedKeys.has(fieldKey);
            break;
          }

          const fieldType = (el as HTMLInputElement).type;
          if (
            fieldType === 'select' ||
            el.tagName === 'SELECT' ||
            el.getAttribute('role') === 'combobox'
          ) {
            didFill = await fillSelect(el, value);
          } else if (fieldType === 'radio') {
            didFill = await fillRadio(el, value);
          } else if (fieldType === 'checkbox') {
            didFill = await fillCheckbox(el, value);
          } else if (fieldType !== 'file') {
            didFill = await fillTextInput(el, value);
          }

          if (didFill) break;
        }
        if (didFill) break;
      }
    }

    if (didFill) filled.push(fieldKey);
  }

  return filled;
}

async function handleAutofillWithProfile(
  profile: Profile,
  _documents?: { resume?: string; coverLetter?: string; resumeFilename?: string },
  fillPlan?: Record<string, string>,
  savedKeys: string[] = []
): Promise<{ success: boolean; filled: string[]; errors: string[] }> {
  debugLog('Autoply: Starting autofill with profile:', Object.keys(profile).join(', '));

  const result = await fillAllFields(profile);

  // AI fallback: use fillPlan for any fields not matched by semantic pass
  if (fillPlan && Object.keys(fillPlan).length > 0) {
    const alreadyFilled = new Set(result.filled);
    const planFilled = await fillByFillPlan(fillPlan, alreadyFilled, new Set(savedKeys));
    if (planFilled.length > 0) {
      debugLog(
        `Autoply: fillPlan filled ${planFilled.length} additional fields:`,
        planFilled.join(', ')
      );
      result.filled.push(...planFilled);
    }
  }

  // Upload resume PDF if provided
  if (_documents?.resume) {
    const filename = _documents.resumeFilename || 'resume.pdf';
    const uploaded = await uploadResumeFile(_documents.resume, filename);
    if (uploaded) result.filled.push('resume_upload');
    else
      result.errors.push('Resume could not be attached. Review the file field before submitting.');
  }

  debugLog(`Autoply: Filled ${result.filled.length} fields:`, result.filled.join(', '));

  if (result.errors.length > 0) {
    debugLog('Autoply: Errors:', result.errors.join(', '));
  }

  return {
    success: result.filled.length > 0,
    filled: result.filled,
    errors: result.errors,
  };
}

console.log('Autoply content script loaded');

// Listen for messages from sidepanel
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Log which frame received the message
  const frameId = sender.frameId ?? 'main';
  debugLog(`Autoply: Message received in frame ${frameId}:`, message.type);

  if (message.type === 'PING') {
    sendResponse({ status: 'OK', frameId });
    return true;
  }

  if (message.type === 'AUTOFILL_WITH_PROFILE') {
    if (message.expectedUrl && message.expectedUrl !== location.href) {
      sendResponse({ success: false, error: 'The application page changed. Try again.' });
      return false;
    }
    const { profile, documents, fillPlan, savedKeys } = message as {
      profile: Profile;
      documents?: { resume?: string; coverLetter?: string };
      fillPlan?: Record<string, string>;
      savedKeys?: string[];
    };

    handleAutofillWithProfile(profile, documents, fillPlan, savedKeys).then((result) => {
      debugLog(`Autoply: Frame ${frameId} fill result:`, result.filled.length, 'fields');
      sendResponse({ ...result, frameId });
    });

    return true; // async response
  }

  if (message.type === 'REFILL_FIELD') {
    const { fieldKey, value } = message as { fieldKey: string; value: string };
    if (message.expectedUrl && message.expectedUrl !== location.href) {
      sendResponse({ success: false });
      return false;
    }
    if (message.fieldLabel) {
      const field = document.querySelector(
        `[data-autoply-choice-key="${CSS.escape(fieldKey)}"], [data-autoply-field-key="${CSS.escape(fieldKey)}"]`
      );
      if (
        !field ||
        normalizeAnswerQuestion(getFieldLabel(field)) !==
          normalizeAnswerQuestion(message.fieldLabel)
      ) {
        sendResponse({ success: false });
        return false;
      }
    }
    fillByFillPlan(
      { [fieldKey]: value },
      new Set(),
      message.remembered ? new Set([fieldKey]) : new Set()
    ).then((filled) => {
      sendResponse({ success: filled.length > 0 });
    });
    return true;
  }

  if (message.type === 'GET_FORM_FIELDS') {
    const fields: Array<{
      key: string;
      type: string;
      label: string;
      options?: string[];
      currentValue?: string;
      autocomplete?: string;
      required?: boolean;
      rememberable?: boolean;
    }> = [];

    const inputs = Array.from(
      document.querySelectorAll('input:not([type="hidden"]), select, textarea, [role="combobox"]')
    );
    for (const input of inputs) {
      if (!isFormElement(input)) continue;
      const el = input as HTMLInputElement;
      const label = getFieldLabel(input);
      const resumeFile =
        el.type === 'file' &&
        /resume|curriculum|\bcv\b/i.test(label + ' ' + el.name + ' ' + el.id) &&
        !/autofill/i.test(label);
      if (!isVisible(input) && !resumeFile) continue;
      if (el.type === 'password') continue;
      const key = el.name || el.id || `autoply-field-${fields.length}`;
      el.setAttribute('data-autoply-field-key', key);
      fields.push({
        key,
        type: el.type || el.tagName.toLowerCase(),
        label,
        required: el.required || el.getAttribute('aria-required') === 'true',
        rememberable: canRememberField(el.type, label),
        currentValue:
          el.type === 'file'
            ? el.files?.[0]?.name || ''
            : el.type === 'checkbox'
              ? checkboxResponse(el.checked, checkboxAnswers.get(el))
              : el.type === 'radio'
                ? el.checked
                  ? el.value
                  : ''
                : el.value || el.getAttribute('aria-valuetext') || '',
        options:
          el.type === 'checkbox'
            ? ['Yes', 'No']
            : el.tagName === 'SELECT'
              ? Array.from((input as HTMLSelectElement).options).map((option) => option.text)
              : undefined,
        autocomplete: el.getAttribute('autocomplete') || undefined,
      });
    }

    for (const [index, group] of collectChoiceGroups().entries()) {
      const key = `autoply-choice-${index}`;
      group.setAttribute('data-autoply-choice-key', key);
      const buttons = choiceButtons(group);
      fields.push({
        key,
        type: 'radio',
        label: getFieldLabel(group),
        required: Boolean(
          group.querySelector('[required], [aria-required="true"], label[class*="required"]')
        ),
        rememberable: canRememberField('radio', getFieldLabel(group)),
        options: buttons.map(choiceText),
        currentValue: buttons.filter(choiceSelected).map(choiceText).join(', '),
      });
    }

    sendResponse({ fields });
    return true;
  }

  return false;
});
