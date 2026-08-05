import { supabase } from '../supabaseClient.js';

export async function fetchCompanies() {
  const { data, error } = await supabase.from('companies').select('*').order('name');
  if (error) throw error;
  return data;
}

// Usado quando a pessoa digita o nome de uma empresa nova no formulário de
// obrigação. Só admin tem permissão (ver política companies_insert_admin).
export async function ensureCompany(name) {
  const trimmed = name.trim();
  if (!trimmed) return null;
  const { data: existing } = await supabase.from('companies').select('*').eq('name', trimmed).maybeSingle();
  if (existing) return existing;
  const { data, error } = await supabase.from('companies').insert({ name: trimmed }).select().single();
  if (error) throw error;
  return data;
}
