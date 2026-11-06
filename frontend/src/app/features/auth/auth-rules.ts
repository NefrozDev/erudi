// Mirrors the API's rules (backend Users/UserRules.cs), so most mistakes are caught before sending.
export const USERNAME_PATTERN = /^[a-zA-Z0-9._-]{3,30}$/;
export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 128;
export const RESET_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;
