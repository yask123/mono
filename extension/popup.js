// Mono — toolbar popup. Writes the chosen look to storage; every open page
// hears the change through storage.onChanged in content.js.
const api = globalThis.browser ?? globalThis.chrome;
const buttons = [...document.querySelectorAll('button[data-look]')];

function show(look) {
  for (const b of buttons) b.setAttribute('aria-pressed', String(b.dataset.look === look));
}

api.storage.local.get('look').then((saved) => show(saved.look ?? 'phosphor'));

for (const b of buttons) {
  b.addEventListener('click', () => {
    api.storage.local.set({ look: b.dataset.look });
    show(b.dataset.look);
  });
}
