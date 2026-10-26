// A small list of passwords that are too common to allow (S10). Matching is case-insensitive and
// also catches these with a few digits or symbols added to the end. Extend from a larger published
// list before launch.

export const COMMON_PASSWORDS = new Set([
  "123456", "1234567", "12345678", "123456789", "1234567890", "12345678910", "0123456789", "987654321",
  "password", "password1", "password123", "passw0rd", "p@ssw0rd", "p@ssword", "pass@123", "admin", "admin123",
  "admin@123", "administrator", "welcome", "welcome1", "welcome123", "welcome@123", "letmein", "qwerty",
  "qwerty123", "qwertyuiop", "asdfghjkl", "zxcvbnm", "1q2w3e4r", "1q2w3e4r5t", "abc123", "abcd1234",
  "iloveyou", "monkey", "dragon", "sunshine", "princess", "football", "cricket", "india", "india123",
  "india@123", "bharat", "hindustan", "punjab", "punjab123", "ludhiana", "amritsar", "jalandhar",
  "chandigarh", "patiala", "waheguru", "satnam", "khalsa", "sardar", "jaihind", "jaimatadi", "omnamahshivaya",
  "college", "college123", "student", "student123", "teacher", "teacher123", "principal", "timetable",
  "timetable123", "changeme", "default", "secret", "master", "superman", "batman", "trustno1", "shadow",
  "baseball", "access", "login", "starwars", "whatever", "freedom", "computer", "internet", "samsung",
  "nokia", "google", "facebook", "instagram", "mobile", "qazwsx", "111111", "000000", "121212", "123123",
  "654321", "666666", "696969", "777777", "888888", "999999", "112233", "123321", "1qaz2wsx", "zaq12wsx",
]);

/** True when the password is a common one, ignoring case and trailing digits or symbols. */
export function isCommonPassword(password: string): boolean {
  const p = password.toLowerCase();
  if (COMMON_PASSWORDS.has(p)) return true;
  const stem = p.replace(/[\d!@#$%^&*._-]+$/, "");
  return stem.length >= 4 && COMMON_PASSWORDS.has(stem);
}
