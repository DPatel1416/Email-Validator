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

function renderResults(data, email, sample = false) {
  const summary = element('div', 'result-summary');
  const states = { deliverable: 'Looks deliverable.', undeliverable: 'Delivery issue detected.', risky: 'Review before sending.', unknown: 'Could not confirm.' };
  const advice = {
    deliverable: 'The service reports this address as deliverable. Review the checks below before sending a message the recipient expects.',
    undeliverable: 'Check the spelling or ask for an updated address before sending. This address may bounce.',
    risky: 'Some signals need attention. Confirm this address with the recipient before relying on it.',
    unknown: 'The service could not reach a definite conclusion. Confirm the address or try again later.'
  };
  document.querySelector('.results-panel').dataset.state = data.state || 'unknown';
  summary.append(element('h3', '', states[data.state] || 'Your email insights.'), element('p', 'result-email', data.email || email));
  summary.append(element('p', 'report-advice', advice[data.state] || advice.unknown));
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
  const explanations = [
    'The provider’s overall assessment.', 'A quality indicator, not a delivery probability.',
    'Whether the address follows email syntax.', 'Whether the domain has mail routing records.',
    'Whether the server check succeeded.', 'Whether this is a temporary email provider.',
    'A shared function such as support or sales.', 'May accept mail for nonexistent recipients.'
  ];
  for (const [index, [label, value]] of checks.entries()) {
    const metric = element('dl', 'metric');
    const detail = element('dd', '', value);
    metric.title = explanations[index];
    metric.append(element('dt', '', label), detail);
    grid.append(metric);
  }
  resultContainer.replaceChildren(summary, grid);
  if (sample) resultContainer.prepend(element('p', 'sample-label', 'SAMPLE DATA · No live check performed'));
  if (typeof data.did_you_mean === 'string' && data.did_you_mean.trim()) {
    resultContainer.append(element('p', 'result-explanation', `Possible typo — did you mean ${data.did_you_mean}?`));
  }
  const guide = element('button', 'report-guide', 'What do these checks mean? ↗');
  guide.type = 'button';
  guide.addEventListener('click', () => openGuide('checks'));
  resultContainer.append(guide);
  resultBadge.textContent = sample ? 'Sample / not live' : 'Check complete';
}

const demoButton = document.getElementById('demoButton');
demoButton.addEventListener('click', () => {
  if (submitButton.disabled) return;
  renderResults({ email: 'alex@example.com', state: 'deliverable', score: 0.94, format_valid: true, mx_found: true, smtp_check: true, disposable: false, role: false, catch_all: null, reason: 'valid_mailbox' }, '', true);

});

form.addEventListener('submit', async event => {
  event.preventDefault();
  if (submitButton.disabled) return;
  const email = document.getElementById('username').value.trim();
  if (!form.reportValidity()) return;
  submitButton.disabled = true;
  demoButton.disabled = true;
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
    if (window.location.protocol === 'file:') {
      const failure = new Error('Open this app through its server at http://127.0.0.1:4173. Live checks do not work by opening index.html directly.');
      failure.userVisible = true;
      throw failure;
    }
    const response = await fetch('/api/validate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
      signal: controller.signal
    });
    if (!response.headers.get('content-type')?.includes('application/json')) {
      const failure = new Error('The validation backend is unavailable at this address. Start the app with npm start and open http://127.0.0.1:4173.');
      failure.userVisible = true;
      throw failure;
    }
    const data = await response.json();
    if (!response.ok) {
      const failure = new Error(data.error || 'Validation is unavailable. Please try again.');
      failure.userVisible = true;
      throw failure;
    }
    if (!data || typeof data !== 'object' || Array.isArray(data) || data.error || !('state' in data || 'format_valid' in data)) {
      throw new Error('We couldn’t get a valid result. Please try again shortly.');
    }
    renderResults(data, email);
  } catch (error) {
    const errorState = element('div', 'error-state');
    const message = error.name === 'AbortError' ? 'This check took a little too long. Please try again.' : error.userVisible ? error.message : error instanceof TypeError ? 'Cannot reach the app server. If running locally, start it with npm start, keep the terminal open, and refresh this page.' : 'The server returned an unreadable result. Please try again.';
    errorState.append(element('h3', '', 'Let’s try that again.'), element('p', '', message));
    resultContainer.replaceChildren(errorState);
    resultBadge.textContent = 'Check incomplete';
  } finally {
    clearTimeout(timeout);
    submitButton.disabled = false;
    demoButton.disabled = false;
    submitButton.firstElementChild.textContent = 'Validate email';
    resultContainer.setAttribute('aria-busy', 'false');
  }
});

const guideDialog = document.getElementById('guideDialog');
const guideTopic = document.getElementById('guideTopic');
const guideContent = document.getElementById('guideContent');
const guideText = {
  results: 'Deliverable: the service reports the address can receive mail. Risky or unknown: confirm the address before relying on it. Undeliverable: check for typos or ask for an updated address. No result guarantees inbox delivery.',
  score: 'The quality score is the provider’s assessment on a 0–100 scale. It is not a percentage chance of delivery. Read it alongside the individual checks.',
  checks: 'Format checks the address syntax. Mail records indicate domain routing. Mailbox check reports the server response. Disposable identifies temporary providers. Role-based means a shared function such as support. Catch-all domains may accept nonexistent recipients. Unknown means inconclusive, not failed.',
  privacy: 'This page sends the address to EmailValidation for analysis. It does not send an email message or store your checks. The provider’s data handling policies apply.'
};
function updateGuide() { guideContent.textContent = guideText[guideTopic.value]; }
function openGuide(topic = 'results') { guideTopic.value = topic; updateGuide(); guideDialog.showModal(); }
document.getElementById('helpButton').addEventListener('click', () => openGuide());
document.getElementById('closeGuide').addEventListener('click', () => guideDialog.close());
guideTopic.addEventListener('change', updateGuide);
