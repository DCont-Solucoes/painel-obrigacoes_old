import { STATE, isAdmin } from './state.js';
import { fetchObligations, createObligation, updateObligation, deleteObligation as apiDeleteObligation } from './api/obligations.js';
import { fetchCompletions, markCompletion, deleteCompletion } from './api/completions.js';
import { fetchCompanies, ensureCompany } from './api/companies.js';
import { getActiveOccurrence, fmtKey } from './dateUtils.js';
import { showToast } from './ui/toast.js';
import { confirmDialog } from './ui/confirmDialog.js';

// Carrega as três tabelas em paralelo. Cada uma é independente — se uma
// falhar (ex.: sem conexão), as outras ainda tentam, e sinalizamos o erro
// via STATE.connectionError para a interface mostrar o banner de aviso.
export async function loadAll() {
  STATE.connectionError = null;
  try {
    const [obligations, completions, companies] = await Promise.all([
      fetchObligations(),
      fetchCompletions(),
      fetchCompanies(),
    ]);
    STATE.obligations = obligations;
    STATE.completions = completions;
    STATE.companies = companies;
  } catch (err) {
    console.error('Falha ao carregar dados do painel', err);
    STATE.connectionError = 'Não foi possível carregar os dados agora. Verifique sua conexão com a internet.';
    throw err;
  }
}

export async function refreshObligationsAndCompletions() {
  const [obligations, completions] = await Promise.all([fetchObligations(), fetchCompletions()]);
  STATE.obligations = obligations;
  STATE.completions = completions;
}

// ---------- ações ----------

export async function doMarkDone(obligationId, onDone) {
  const ob = STATE.obligations.find((o) => o.id === obligationId);
  if (!ob) return;
  const completionsByObligation = new Map(
    STATE.completions
      .filter((c) => c.obligation_id === obligationId)
      .reduce((acc, c) => {
        if (!acc.has(c.obligation_id)) acc.set(c.obligation_id, new Set());
        acc.get(c.obligation_id).add(c.occurrence_date);
        return acc;
      }, new Map())
  );
  const active = getActiveOccurrence(ob, completionsByObligation);
  if (!active) return;

  try {
    const created = await markCompletion({
      obligationId,
      occurrenceDate: fmtKey(active),
      userId: STATE.session.id,
      userLabel: STATE.profile?.display_name || STATE.session.email,
    });
    STATE.completions.push(created);
    showToast('Obrigação marcada como concluída.', 'success');
  } catch (err) {
    console.error(err);
    if (err.code === '23505') {
      showToast('Alguém já registrou essa conclusão agora há pouco. Atualizando o painel…', 'info');
      await refreshObligationsAndCompletions();
    } else {
      showToast('Não foi possível salvar a conclusão. Tente novamente.', 'error');
    }
  } finally {
    onDone?.();
  }
}

export async function doUndoLast(obligationId, onDone) {
  const mine = STATE.completions.filter((c) => c.obligation_id === obligationId);
  if (!mine.length) return;
  const last = mine.slice().sort((a, b) => a.occurrence_date.localeCompare(b.occurrence_date)).pop();

  const canUndo = isAdmin() || last.done_by === STATE.session?.id;
  if (!canUndo) {
    showToast('Só quem concluiu (ou um administrador) pode desfazer esta conclusão.', 'error');
    return;
  }

  const ok = await confirmDialog({
    title: 'Desfazer conclusão',
    message: 'Desfazer a última conclusão registrada para esta obrigação?',
    confirmLabel: 'Desfazer',
  });
  if (!ok) return;

  try {
    await deleteCompletion(last.id);
    STATE.completions = STATE.completions.filter((c) => c.id !== last.id);
    showToast('Conclusão desfeita.', 'success');
  } catch (err) {
    console.error(err);
    showToast('Não foi possível desfazer agora. Tente novamente.', 'error');
  } finally {
    onDone?.();
  }
}

export async function doDeleteObligation(obligationId, onDone) {
  const ok = await confirmDialog({
    title: 'Excluir obrigação',
    message: 'Excluir esta obrigação do painel? Esta ação não pode ser desfeita.',
    confirmLabel: 'Excluir',
  });
  if (!ok) return;

  try {
    await apiDeleteObligation(obligationId);
    STATE.obligations = STATE.obligations.filter((o) => o.id !== obligationId);
    STATE.completions = STATE.completions.filter((c) => c.obligation_id !== obligationId);
    showToast('Obrigação excluída.', 'success');
  } catch (err) {
    console.error(err);
    showToast('Não foi possível excluir agora. Tente novamente.', 'error');
  } finally {
    onDone?.();
  }
}

// `formData` vem do modal já validado; `id` é null para criação.
export async function doSaveObligation(id, formData, onDone) {
  try {
    let companyId = null;
    if (formData.empresaNome) {
      const company = await ensureCompany(formData.empresaNome);
      companyId = company?.id || null;
      if (!STATE.companies.some((c) => c.id === companyId) && company) {
        STATE.companies.push(company);
      }
    }

    const payload = {
      name: formData.name,
      category: formData.category,
      company_id: companyId,
      responsible: formData.responsible,
      frequency: formData.frequency,
      day_of_month: formData.day_of_month ?? null,
      month: formData.month ?? null,
      months: formData.months ?? null,
      due_date: formData.due_date ?? null,
      notes: formData.notes,
    };

    let saved;
    if (id) {
      saved = await updateObligation(id, payload);
      STATE.obligations = STATE.obligations.map((o) => (o.id === id ? saved : o));
    } else {
      saved = await createObligation(payload);
      STATE.obligations.push(saved);
    }
    showToast(id ? 'Obrigação atualizada.' : 'Obrigação cadastrada.', 'success');
    onDone?.(saved);
  } catch (err) {
    console.error(err);
    showToast('Não foi possível salvar. Verifique os campos e tente novamente.', 'error');
  }
}
