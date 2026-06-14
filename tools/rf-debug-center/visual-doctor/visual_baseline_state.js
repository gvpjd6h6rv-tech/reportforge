let currentBaseline = null;
let currentError = '';

export function getVisualBaselineState() {
  return {
    baseline: currentBaseline,
    error: currentError,
  };
}

export function setVisualBaselineState(baseline) {
  currentBaseline = baseline || null;
  currentError = '';
}

export function setVisualBaselineError(message) {
  currentError = String(message || '');
}

export function clearVisualBaselineState() {
  currentBaseline = null;
  currentError = '';
}

