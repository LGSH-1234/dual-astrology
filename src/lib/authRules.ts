// 账号校验规则：前端表单与服务端共用，保证两边提示一致。
export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 128;

export function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

export function validateEmail(raw: string): string | null {
  const e = normalizeEmail(raw);
  if (!e) return '请输入邮箱';
  if (e.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e)) return '邮箱格式不正确';
  return null;
}

export function validatePassword(pw: string): string | null {
  if (!pw) return '请输入密码';
  if (pw.length < PASSWORD_MIN) return `密码至少 ${PASSWORD_MIN} 位`;
  if (pw.length > PASSWORD_MAX) return `密码最多 ${PASSWORD_MAX} 位`;
  if (!/[A-Za-z]/.test(pw) || !/\d/.test(pw)) return '密码需同时包含字母和数字';
  return null;
}

/** 0–4 的粗略强度，仅用于注册页提示。 */
export function passwordStrength(pw: string): number {
  if (!pw) return 0;
  let s = 0;
  if (pw.length >= PASSWORD_MIN) s++;
  if (pw.length >= 12) s++;
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) s++;
  if (/\d/.test(pw) && /[^A-Za-z0-9]/.test(pw)) s++;
  if (validatePassword(pw)) s = Math.min(s, 1);
  return s;
}
