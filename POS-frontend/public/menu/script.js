// Keep anchor destinations below the header when desktop navigation wraps.
const menuHeader = document.querySelector('nav');
const updateHeaderHeight = () => document.documentElement.style.setProperty('--menu-header-height', menuHeader.getBoundingClientRect().height + 'px');
if (typeof ResizeObserver !== 'undefined') new ResizeObserver(updateHeaderHeight).observe(menuHeader);
window.addEventListener('resize', updateHeaderHeight);
updateHeaderHeight();

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
function placeholderUrl() {
    return document.documentElement.dataset.theme === 'dark' ? '/menu/imgs/no_img_dark.png' : '/menu/imgs/no_img.png';
}
function placeholder(img) {
    img.onload = null;
    img.onerror = null;
    img.classList.add('placeholder-img');
    img.loading = 'eager';
    img.src = placeholderUrl();
}
function createCard(product, index) {
    const card = element('div', undefined, 'menu-item');
    const img = document.createElement('img');
    img.alt = product.product_name;
    img.loading = index < 6 ? 'eager' : 'lazy';
    img.fetchPriority = index < 2 ? 'high' : 'auto';
    img.decoding = 'async';
    img.width = 320;
    img.height = 200;
    img.onerror = () => { img.onerror = null; placeholder(img); };
    const src = product.product_image || '';
    if (/^https:\/\//i.test(src) || /^(?:\/menu\/)?imgs\//.test(src) || /^\/api\/public\/product-images\/[a-f0-9-]+\.(png|jpg|webp)$/.test(src)) img.src = src.startsWith('imgs/') ? '/menu/' + src : src;
    else placeholder(img);
    const details = element('div', undefined, 'menu-details');
    details.append(element('h3', product.product_name), element('p', product.product_description || ''), element('p', new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number(product.product_price)), 'price'));
    card.append(img, details);
    return card;
}
function renderMenu(products, groups) {
    const categories = new Map();
    for (const product of products) {
        const category = product.product_category || 'Other';
        if (!categories.has(category)) categories.set(category, []);
        categories.get(category).push(product);
    }
    const categoryNames = [...categories.keys()];
    const assigned = new Map(products.map(product => [product.product_category || 'Other', product.menu_group_id]));
    const known = new Set(groups.map(group => String(group.group_id)));
    const sections = groups.map(group => ({id:'group-'+group.group_id,name:group.group_name,categories:categoryNames.filter(name=>String(assigned.get(name))===String(group.group_id))}));
    sections.push({id:'other',name:'More',categories:categoryNames.filter(name=>!known.has(String(assigned.get(name))))});
    const fragment = document.createDocumentFragment();
    let imageIndex = 0;
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
            if (name === group.name) grid.id = heading.id;
            for (const product of categories.get(name)) grid.append(createCard(product, imageIndex++));
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
        const signature = JSON.stringify([data.products,data.groups]);
        if (signature !== previous) { renderMenu(data.products,data.groups||[]); previous = signature; }
        status.textContent = data.products.length ? '' : 'The menu is being updated. Please check back soon.';
    } catch {
        status.textContent = previous === null ? 'Could not load the menu. Please try again.' : '';
        retry.hidden = previous !== null;
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
