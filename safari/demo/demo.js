document.getElementById('reset-demo').addEventListener('click', () => location.reload());
document.addEventListener('click', event => {
    const menu = event.target.closest('.coursemenubtn');
    if (menu) {
        const expanded = menu.getAttribute('aria-expanded') !== 'true';
        menu.setAttribute('aria-expanded', String(expanded));
        menu.parentElement.querySelector('.dropdown-menu').classList.toggle('show', expanded);
    }
    if (event.target.closest('#scrapebutton')) {
        event.preventDefault();
        event.stopImmediatePropagation();
        rerender();
        document.getElementById('demo-message').textContent = 'デモデータを再表示しました / Sample data refreshed.';
    }
    const link = event.target.closest('a');
    if (link && /^https?:/.test(link.href)) {
        event.preventDefault();
        event.stopImmediatePropagation();
        document.getElementById('demo-message').textContent = 'デモの課題です。実際のMoodleには移動しません / Sample task only.';
    }
}, true);
queueMicrotask(() => {
    document.getElementById('scrapebutton').textContent = 'サンプルを再表示 / Refresh demo';
    for (const element of document.querySelectorAll('#scrapeModeSelect, label[for="scrapeModeSelect"]')) element.hidden = true;
});
