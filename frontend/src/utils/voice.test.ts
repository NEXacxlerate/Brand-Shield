import { describe, expect, it } from 'vitest';
import { collectVoiceFields, fillVoiceField, spokenEmail, spokenPhone } from './voice';

describe('voice helpers', () => {
  it('turns spoken emails and phone numbers into written ones', () => {
    expect(spokenEmail('test at gmail dot com')).toBe('test@gmail.com');
    expect(spokenPhone('plus nine one double nine eight')).toBe('+91998');
  });

  it('lists only fillable data-voice fields and never password ones', () => {
    document.body.innerHTML = `
      <input data-voice="brand_name" />
      <input data-voice="secret_password" type="text" />
      <input data-voice="pw" type="password" />
      <input data-voice="hidden_one" disabled />
      <select data-voice="store"><option value="all">Both</option><option value="google_play">Google Play</option></select>`;
    expect(collectVoiceFields()).toEqual(['brand_name', 'store']);
  });

  it('fills an input through the native setter and fires input; picks a select option by its label', () => {
    document.body.innerHTML = `<input data-voice="alert_email" type="email" />
      <select data-voice="store"><option value="all">Both</option><option value="google_play">Google Play</option></select>`;
    const input = document.querySelector('input') as HTMLInputElement;
    let seen = '';
    input.addEventListener('input', (e) => (seen = (e.target as HTMLInputElement).value));
    expect(fillVoiceField('alert_email', 'test at gmail dot com')).toBe('test@gmail.com');
    expect(seen).toBe('test@gmail.com');
    expect(fillVoiceField('store', 'google play')).toBe('Google Play');
    expect((document.querySelector('select') as HTMLSelectElement).value).toBe('google_play');
    expect(fillVoiceField('missing', 'x')).toBeNull();
  });
});
