// Sign-up password policy. Mirrors backend/app/schemas/auth.py `password_problem` EXACTLY (the server stays the authority):
//   >= 10 characters, <= 72 bytes (UTF-8), not all digits, >= 5 different characters, not on the trivial list,
//   not equal to the name, the email or the email's local part (or the local part written twice when it has >= 6 characters).
export const PASSWORD_MIN = 10;
export const PASSWORD_MAX_BYTES = 72;

export const TRIVIAL_PASSWORDS: ReadonlySet<string> = new Set([
  'password12', 'password123', 'password1234', 'password12345', 'passw0rd123', 'passw0rd1234', 'password!23', 'password@123',
  'qwerty12345', 'qwerty123456', 'qwertyuiop', 'qwertyuiop1', '1234567890', '12345678910', '123456789012', '0123456789',
  'abcdefghij', 'abcd123456', 'abcd1234567', 'iloveyou123', 'iloveyou12', 'letmein1234', 'welcome1234', 'welcome123', 'admin12345',
  'admin123456', 'administrator', 'changeme123', 'changeme1234', 'trustno1234', 'monkey12345', 'dragon12345', 'football123',
  'baseball123', 'superman123', 'sunshine123', 'princess123', '00000000000', '1111111111', 'aaaaaaaaaa', 'brandshield', 'brandshield1',
  'brandshield123', 'scammind123', 'scammind1234', 'brandstudio', 'brandstudio1', 'brandstudio123'
]);

export interface PasswordCheck {
  key: 'length' | 'bytes' | 'easy' | 'identity';
  label: string;
  ok: boolean;
}

const cleanName = (name: string) => name.split(/\s+/).filter(Boolean).join(' ');

export function checkPassword(password: string, name = '', email = ''): PasswordCheck[] {
  const low = password.toLowerCase().trim();
  const mail = email.trim().toLowerCase();
  const local = mail.split('@')[0];
  const who = cleanName(name).toLowerCase();
  const distinct = new Set(Array.from(password)).size;
  const easy = TRIVIAL_PASSWORDS.has(low) || /^\p{Nd}+$/u.test(password) || distinct < 5;
  const identity = low === mail || low === who || low === local || (local.length >= 6 && low === local + local);
  return [
    { key: 'length', label: `At least ${PASSWORD_MIN} characters`, ok: Array.from(password).length >= PASSWORD_MIN },
    { key: 'bytes', label: `At most ${PASSWORD_MAX_BYTES} bytes (very long or emoji-heavy passwords are refused)`, ok: new TextEncoder().encode(password).length <= PASSWORD_MAX_BYTES },
    { key: 'easy', label: 'Not all digits, at least 5 different characters, not a common password', ok: !easy },
    { key: 'identity', label: 'Not the same as your name or email', ok: password === '' || !identity }
  ];
}

/** First unmet rule as a plain sentence (same wording as the server), or null. */
export function passwordProblem(password: string, name = '', email = ''): string | null {
  const bad = checkPassword(password, name, email).find((c) => !c.ok);
  if (!bad) return null;
  switch (bad.key) {
    case 'length':
      return `Password must be at least ${PASSWORD_MIN} characters.`;
    case 'bytes':
      return 'Password is too long (72 bytes at most).';
    case 'easy':
      return 'That password is too easy to guess. Choose a longer or less common one.';
    default:
      return 'Password must not be the same as your name or email.';
  }
}
