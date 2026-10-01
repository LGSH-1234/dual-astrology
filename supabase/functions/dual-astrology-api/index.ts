import { createClient } from 'npm:@supabase/supabase-js@2.117.2';
import { cloudHandler } from '../_shared/cloud.ts';
import { DeepSeekInterpretationProvider } from '../_shared/deepseek.ts';

const required = (name: string) => {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing ${name}`);
  return value;
};
const admin = createClient(required('SUPABASE_URL'), required('SUPABASE_SERVICE_ROLE_KEY'), {
  auth: { persistSession: false, autoRefreshToken: false },
});
const apiKey = Deno.env.get('DIO_DEEPSEEK_API_KEY');
Deno.serve(cloudHandler({
  allowedOrigins: ['https://lgsh-1234.github.io', 'http://localhost:5173', 'http://localhost:4173'],
  publishableKey: required('DIO_PUBLISHABLE_KEY'),
  authenticate: async (token) => {
    const { data, error } = await admin.auth.getUser(token);
    return error ? null : data.user?.id ?? null;
  },
  takeQuota: async (subject) => {
    const { data, error } = await admin.rpc('dual_astrology_take_quota', { p_subject: subject });
    if (error) throw error;
    return data === true;
  },
  ai: apiKey ? new DeepSeekInterpretationProvider({ apiKey, model: Deno.env.get('DIO_DEEPSEEK_MODEL') || 'deepseek-chat' }) : null,
}));
