import { MONTH_NAMES, MONTH_FULL } from './constants.js';

export function pad(n) {
  return String(n).padStart(2, '0');
}

export function fmtKey(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function fmtBR(d) {
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
}

export function daysInMonth(y, mIdx) {
  return new Date(y, mIdx + 1, 0).getDate();
}

export function escapeHtml(s) {
  return (s || '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

// Empurra a data para a frente até cair num dia que não seja sábado(6),
// domingo(0) nem um feriado cadastrado em `holidaysSet` (Set de strings
// "YYYY-MM-DD"). Não altera nada se `enabled` for falso — usado só quando
// a obrigação tem adjust_business_day = true.
export function shiftToBusinessDay(date, holidaysSet, enabled) {
  if (!enabled) return date;
  const d = new Date(date);
  while (d.getDay() === 0 || d.getDay() === 6 || holidaysSet.has(fmtKey(d))) {
    d.setDate(d.getDate() + 1);
  }
  return d;
}

// Todas as ocorrências de uma obrigação dentro do intervalo [from, to].
// `holidaysSet` é opcional (Set de strings "YYYY-MM-DD"); só é usado
// quando a obrigação tem adjust_business_day = true.
export function occurrencesInRange(ob, from, to, holidaysSet = new Set()) {
  const res = [];
  const push = (raw) => {
    const dd = shiftToBusinessDay(raw, holidaysSet, ob.adjust_business_day);
    if (dd >= from && dd <= to) res.push(dd);
  };

  if (ob.frequency === 'pontual') {
    push(new Date(`${ob.due_date}T00:00:00`));
    return res;
  }

  if (ob.frequency === 'anual') {
    const y0 = from.getFullYear() - 1;
    const yEnd = to.getFullYear() + 1;
    for (let y = y0; y <= yEnd; y++) {
      const dim = daysInMonth(y, ob.month - 1);
      const day = Math.min(ob.day_of_month, dim);
      push(new Date(y, ob.month - 1, day));
    }
    return res;
  }

  if (ob.frequency === 'trimestral') {
    const y0 = from.getFullYear() - 1;
    const yEnd = to.getFullYear() + 1;
    for (let y = y0; y <= yEnd; y++) {
      (ob.months || []).forEach((m) => {
        const dim = daysInMonth(y, m - 1);
        const day = Math.min(ob.day_of_month, dim);
        push(new Date(y, m - 1, day));
      });
    }
    res.sort((a, b) => a - b);
    return res;
  }

  if (ob.frequency === 'mensal') {
    let cur = new Date(from.getFullYear(), from.getMonth() - 1, 1);
    const end = new Date(to.getFullYear(), to.getMonth() + 2, 1);
    while (cur < end) {
      const dim = daysInMonth(cur.getFullYear(), cur.getMonth());
      const day = Math.min(ob.day_of_month, dim);
      push(new Date(cur.getFullYear(), cur.getMonth(), day));
      cur = new Date(cur.getFullYear(), cur.getMonth() + 1, 1);
    }
    return res;
  }

  return res;
}

// Próxima ocorrência ainda não concluída (janela de -90/+180 dias).
export function getActiveOccurrence(ob, completionsByObligation, holidaysSet = new Set()) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const from = new Date(today);
  from.setDate(from.getDate() - 90);
  const to = new Date(today);
  to.setDate(to.getDate() + 180);

  const occs = occurrencesInRange(ob, from, to, holidaysSet).sort((a, b) => a - b);
  const done = completionsByObligation.get(ob.id) || new Set();
  for (const occ of occs) {
    if (!done.has(fmtKey(occ))) return occ;
  }
  return null;
}

export function statusOf(activeDate) {
  if (!activeDate) return { label: 'Sem pendência próxima', tone: 'muted', diffDays: null };
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diffDays = Math.round((activeDate - today) / 86400000);
  if (diffDays < 0) return { label: 'Atrasada', tone: 'red', diffDays };
  if (diffDays <= 5) return { label: 'Vence em breve', tone: 'amber', diffDays };
  return { label: 'No prazo', tone: 'green', diffDays };
}

export function deltaLabel(diffDays) {
  if (diffDays === null || diffDays === undefined) return '—';
  if (diffDays === 0) return 'vence hoje';
  if (diffDays > 0) return `em ${diffDays}${diffDays > 1 ? ' dias' : ' dia'}`;
  const a = Math.abs(diffDays);
  return `há ${a}${a > 1 ? ' dias' : ' dia'}`;
}

export function trackPercent(diffDays) {
  const c = Math.max(-15, Math.min(30, diffDays));
  return ((c - -15) / 45) * 100;
}

export function freqSummary(ob) {
  if (ob.frequency === 'mensal') return `Todo dia ${ob.day_of_month}`;
  if (ob.frequency === 'anual') return `${MONTH_FULL[ob.month - 1]} — dia ${ob.day_of_month}`;
  if (ob.frequency === 'trimestral') {
    const months = (ob.months || []).map((m) => MONTH_NAMES[m - 1]).join(', ');
    return `Dia ${ob.day_of_month} em: ${months}`;
  }
  if (ob.frequency === 'pontual') {
    return `Data única: ${ob.due_date ? fmtBR(new Date(`${ob.due_date}T00:00:00`)) : '—'}`;
  }
  return '';
}
