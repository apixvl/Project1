// script.js

document.addEventListener('DOMContentLoaded', () => {
    const searchInput = document.getElementById('searchInput');
    const itemList = document.getElementById('consoleList') || document.getElementById('gameList');

    if (searchInput && itemList) {
        searchInput.addEventListener('input', () => {
            const filter = searchInput.value.toLowerCase();
            const items = itemList.getElementsByTagName('li');

            Array.from(items).forEach(item => {
                const text = item.textContent.toLowerCase();
                item.style.display = text.includes(filter) ? '' : 'none';
            });
        });
    }
});
