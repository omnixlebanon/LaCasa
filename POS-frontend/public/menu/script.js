const groups = [
    { id: 'hotDrinks', name: 'Hot Drinks', categories: ['Hot Drinks'] },
    { id: 'coldDrinks', name: 'Cold Drinks', categories: ['Milkshakes', 'Iced Coffee', 'Frappes', 'Smoothies', 'Juices', 'Water', 'Soft Drinks', 'Energy Drinks'] },
    { id: 'desserts', name: 'Desserts', categories: ['Desserts'] },
    { id: 'shisha', name: 'Shisha', categories: ['Shisha'] },
    { id: 'food', name: 'Food', categories: ['Tablye', 'Yogurt Bowls', 'Sandwiches', 'Saj', 'Croissants'] },
];
const content = document.getElementById('menu-content');
const status = document.getElementById('menu-status');
const retry = document.getElementById('menu-retry');
let busy = false;
let previous = null;
function element(tag, text, className) {
    const node = document.createElement(tag);
    if (text !== undefined) node.textContent = text;
    if (className) node.className = className;
    return node;
}
function placeholder(img) {
    img.classList.add('placeholder-img');
    img.src = document.documentElement.dataset.theme === 'dark' ? 'imgs/no_img_dark.png' : 'imgs/no_img.png';
}
function createCard(product) {
    const card = element('div', undefined, 'menu-item');
    const img = document.createElement('img');
    img.alt = product.product_name;
    img.loading = 'lazy';
    img.onerror = () => { img.onerror = null; placeholder(img); };
    const src = product.product_image || '';
    if (/^https:\/\//i.test(src) || /^(?:\/menu\/)?imgs\//.test(src)) img.src = src;
    else placeholder(img);
    const details = element('div', undefined, 'menu-details');
    details.append(element('h3', product.product_name), element('p', product.product_description || ''), element('p', new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number(product.product_price)), 'price'));
    card.append(img, details);
    return card;
}
function renderMenu(products) {
    const categories = new Map();
    for (const product of products) {
        const category = product.product_category || 'Other';
        if (!categories.has(category)) categories.set(category, []);
        categories.get(category).push(product);
    }
    const known = new Set(groups.flatMap(group => group.categories));
    const sections = [...groups, { id: 'other', name: 'More', categories: [...categories.keys()].filter(name => !known.has(name)) }];
    const fragment = document.createDocumentFragment();
    const navigation = document.createDocumentFragment();
    for (const group of sections) {
        const available = group.categories.filter(name => categories.has(name));
        if (!available.length) continue;
        const section = element('section', undefined, 'section'); section.id = group.id;
        section.append(element('h2', group.name));
        const navItem = element('li'); const link = element('a', group.name); link.href = '#' + group.id; navItem.append(link); navigation.append(navItem);
        const miniNav = element('div', undefined, 'mini-nav');
        available.forEach((name, index) => {
            const id = group.id + '-category-' + index;
            if (available.length > 1) { const a = element('a', name); a.href = '#' + id; miniNav.append(a); }
        });
        if (miniNav.children.length) section.append(miniNav);
        available.forEach((name, index) => {
            const heading = element('h3', name); heading.id = group.id + '-category-' + index;
            if (name !== group.name) section.append(heading);
            const grid = element('div', undefined, 'menu-grid');
            for (const product of categories.get(name)) grid.append(createCard(product));
            section.append(grid);
        });
        fragment.append(section);
    }
    content.replaceChildren(fragment);
    document.querySelector('nav ul').replaceChildren(navigation);
}
async function loadMenu() {
    if (busy) return;
    busy = true; retry.hidden = true; content.setAttribute('aria-busy', 'true');
    if (previous === null) status.textContent = 'Loading menu...';
    try {
        const response = await fetch('/api/public/menu', { cache: 'no-store', credentials: 'omit', signal: AbortSignal.timeout(15000) });
        if (!response.ok) throw new Error('Menu unavailable');
        const data = await response.json();
        if (!Array.isArray(data.products)) throw new Error('Invalid menu');
        const signature = JSON.stringify(data.products);
        if (signature !== previous) { renderMenu(data.products); previous = signature; }
        status.textContent = data.products.length ? '' : 'The menu is being updated. Please check back soon.';
    } catch {
        status.textContent = previous === null ? 'Could not load the menu. Please try again.' : 'Could not refresh the menu. Displayed prices may be out of date.';
        retry.hidden = false;
    } finally { busy = false; content.setAttribute('aria-busy', 'false'); }
}
document.getElementById('themeToggle').addEventListener('click', () => {
    const dark = document.documentElement.dataset.theme !== 'dark';
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    document.getElementById('themeToggle').textContent = dark ? 'Light Mode' : 'Dark Mode';
    document.querySelectorAll('.placeholder-img').forEach(placeholder);
});
document.getElementById('back-to-top').addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));
window.addEventListener('scroll', () => { document.getElementById('back-to-top').style.display = window.scrollY > 400 ? 'flex' : 'none'; });
retry.addEventListener('click', loadMenu);
document.addEventListener('visibilitychange', () => { if (!document.hidden) loadMenu(); });
setInterval(() => { if (!document.hidden) loadMenu(); }, 30000);
loadMenu();
