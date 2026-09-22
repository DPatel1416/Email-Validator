const form = document.getElementById('validationForm');
const submitButton = document.getElementById('submitBtn');
const resultContainer = document.getElementById('resultCont');
const resultBadge = document.getElementById('resultBadge');
document.getElementById('year').textContent = new Date().getFullYear();

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function renderResults(data, email) {
  const summary = element('div', 'result-summary');
  const states = { deliverable: 'Looking good.', undeliverable: 'Worth a second look.', risky: 'A little caution.', unknown: 'More to the story.' };
  summary.append(element('h3', '', states[data.state] || 'Your email insights.'), element('p', 'result-email', data.email || email));
  const grid = element('div', 'result-grid');
  const booleanLabel = value => value === true ? 'Yes' : value === false ? 'No' : 'Unknown';
  const titleCase = value => typeof value === 'string' && value ? value.replace(/_/g, ' ').replace(/^./, char => char.toUpperCase()) : 'Unknown';
  const checks = [
    ['Deliverability', titleCase(data.state)],
    ['Quality score', typeof data.score === 'number' && Number.isFinite(data.score) ? `${Math.round(data.score * 100)} / 100` : 'Unavailable'],
    ['Valid format', booleanLabel(data.format_valid)],
    ['Mail records found', booleanLabel(data.mx_found)],
    ['Mailbox check', booleanLabel(data.smtp_check)],
    ['Disposable address', booleanLabel(data.disposable)],
    ['Role-based address', booleanLabel(data.role)],
    ['Catch-all domain', booleanLabel(data.catch_all)]
  ];
  for (const [label, value] of checks) {
    const metric = element('dl', 'metric');
    metric.append(element('dt', '', label), element('dd', '', value));
    grid.append(metric);
  }
  resultContainer.replaceChildren(summary, grid);
  if (typeof data.did_you_mean === 'string' && data.did_you_mean.trim()) {
    resultContainer.append(element('p', 'result-explanation', `Possible typo — did you mean ${data.did_you_mean}?`));
  }
  if (typeof data.reason === 'string' && data.reason) {
    resultContainer.append(element('p', 'result-explanation', `Result: ${titleCase(data.reason)}. Mailbox checks are signals, not a guarantee of delivery.`));
  }
  resultBadge.textContent = 'Check complete';
}

form.addEventListener('submit', async event => {
  event.preventDefault();
  if (submitButton.disabled) return;
  const email = document.getElementById('username').value.trim();
  if (!form.reportValidity()) return;
  submitButton.disabled = true;
  submitButton.firstElementChild.textContent = 'Checking email…';
  resultBadge.textContent = 'Checking address';
  resultContainer.setAttribute('aria-busy', 'true');
  const loading = element('div', 'loading-state');
  const spinner = element('span', 'spinner');
  spinner.setAttribute('aria-hidden', 'true');
  loading.append(spinner, element('p', '', 'Taking a closer look at your email…'));
  resultContainer.replaceChildren(loading);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);
  try {
    const key = 'ema_live_rFbag19pQdLEk8APoCDy501PBu9Y2jWxCTaK3UEz';
    const url = new URL('https://api.emailvalidation.io/v1/info');
    url.search = new URLSearchParams({ apikey: key, email }).toString();
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) throw new Error('The validation service is unavailable. Please try again shortly.');
    const data = await response.json();
    if (!data || typeof data !== 'object' || Array.isArray(data) || data.error || !('state' in data || 'format_valid' in data)) {
      throw new Error('We couldn’t get a valid result. Please try again shortly.');
    }
    renderResults(data, email);
  } catch (error) {
    const errorState = element('div', 'error-state');
    const message = error.name === 'AbortError' ? 'This check took a little too long. Please try again.' : 'We couldn’t reach the validation service or get a result. Please check your connection and try again.';
    errorState.append(element('h3', '', 'Let’s try that again.'), element('p', '', message));
    resultContainer.replaceChildren(errorState);
    resultBadge.textContent = 'Check incomplete';
  } finally {
    clearTimeout(timeout);
    submitButton.disabled = false;
    submitButton.firstElementChild.textContent = 'Validate email';
    resultContainer.setAttribute('aria-busy', 'false');
  }
});
