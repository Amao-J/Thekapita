/**
 * Pure validation functions — no DOM, no RN components — so both
 * apps/web/src/pages/auth.js and apps/mobile/src/screens/auth/* call the
 * exact same rules instead of each hand-rolling (and inevitably drifting)
 * their own. Mirrors the RegisterIn validators in backend_integration/schemas.py;
 * this is a UX-speed check only — the backend is still the enforcement point.
 */

export function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

export function isValidNigerianPhone(value) {
  return /^(\+234|0)[789][01]\d{8}$/.test(value.trim());
}

export function passwordIssues(value) {
  const issues = [];
  if (value.length < 8) issues.push('At least 8 characters.');
  if (!/[0-9]/.test(value)) issues.push('At least one number.');
  return issues;
}

export function validateRegisterForm({ fullName, email, phone, password }) {
  const errors = {};
  if (!fullName || fullName.trim().length < 2) errors.fullName = 'Enter your full name.';
  if (!isValidEmail(email)) errors.email = 'Enter a valid email address.';
  if (!isValidNigerianPhone(phone)) errors.phone = 'Enter a valid Nigerian phone number.';
  const pwIssues = passwordIssues(password);
  if (pwIssues.length) errors.password = pwIssues.join(' ');
  return { valid: Object.keys(errors).length === 0, errors };
}
