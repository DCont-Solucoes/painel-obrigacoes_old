import { escapeHtml } from '../dateUtils.js';

// Retorna Promise<File|null> — null se a pessoa pular.
export function attachDialog(obligationName) {
  return new Promise((resolve) => {
    const backdrop = document.createElement('div');
    backdrop.className = 'modal-backdrop';
    backdrop.innerHTML = `
      <div class="modal confirm-card" role="dialog" aria-modal="true" aria-labelledby="attachTitle">
        <h2 id="attachTitle">Anexar comprovante?</h2>
        <p>Opcional: anexe o comprovante de "${escapeHtml(obligationName)}" agora, para ficar registrado junto com a conclusão.</p>
        <div class="field"><input type="file" id="attachFileInput" /></div>
        <div class="modal-actions">
          <div class="right">
            <button type="button" class="btn-ghost" data-act="skip">Agora não</button>
            <button type="button" class="btn-primary" data-act="send">Enviar</button>
          </div>
        </div>
      </div>`;

    function close(file) {
      backdrop.remove();
      resolve(file);
    }
    backdrop.addEventListener('click', (e) => { if (e.target === backdrop) close(null); });
    backdrop.querySelector('[data-act="skip"]').addEventListener('click', () => close(null));
    backdrop.querySelector('[data-act="send"]').addEventListener('click', () => {
      const input = backdrop.querySelector('#attachFileInput');
      close(input.files?.[0] || null);
    });

    document.body.appendChild(backdrop);
  });
}
