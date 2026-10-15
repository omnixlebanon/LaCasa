// Christmas and Ramadan colors, logos, snow and lantern adapted from
// https://github.com/mSWebsit/LaCasa_Menu (style.css, script.js, index.html).
(() => {
    const labels = {christmas:'Christmas Special',halloween:'Halloween Special',ramadan:'Ramadan Special','new-year':'New Year Special','limited-time':'Limited Time',new:'New','most-popular':'Most Popular'};
    let signature;
    let decorationTimer;
    window.MenuSeason = {
        labels,
        nextYear() {
            return Number(new Intl.DateTimeFormat('en', {timeZone:'Asia/Beirut',year:'numeric'}).format(new Date())) + 1;
        },
        apply(appearance = {}) {
            const theme = ['christmas','ramadan','halloween','new-year'].includes(appearance.theme) ? appearance.theme : 'default';
            const next = JSON.stringify([theme, appearance.decorations]);
            if (signature === next) return;
            signature = next;
            document.documentElement.dataset.season = theme;
            const logo = document.querySelector('.logo img');
            logo.src = '/menu/imgs/' + (theme === 'christmas' ? 'chrismas_logo.png' : theme === 'ramadan' ? 'laCasa_ram.png' : 'LaCasa_Logo.png');
            clearTimeout(decorationTimer);
            document.getElementById('seasonal-decorations')?.remove();
            if (!appearance.decorations || theme === 'default') return;
            const layer = document.createElement('div');
            layer.id = 'seasonal-decorations';
            layer.setAttribute('aria-hidden','true');
            if (theme === 'ramadan') {
                const lantern = document.createElement('div');lantern.className='seasonal-lantern';
                const chain = document.createElement('div');chain.className='seasonal-lantern-chain';
                const img = document.createElement('img');img.src='/menu/imgs/lantran.png';img.alt='';
                lantern.append(chain,img);layer.append(lantern);
            } else if (theme === 'halloween') {
                const ghost = document.createElement('div');
                ghost.className = 'seasonal-ghost-popup';
                const greeting = document.createElement('span');
                greeting.className = 'seasonal-ghost-greeting';
                greeting.textContent = 'Booo!';
                const character = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
                character.setAttribute('class', 'seasonal-ghost-character');
                character.setAttribute('viewBox', '0 0 200 200');
                character.setAttribute('focusable', 'false');
                character.innerHTML = `
                    <defs>
                        <linearGradient id="seasonal-ghost-fill" x1="0" y1="0" x2=".8" y2="1">
                            <stop stop-color="#fff"/><stop offset="1" stop-color="#e9e4fa"/>
                        </linearGradient>
                    </defs>
                    <g fill="url(#seasonal-ghost-fill)" stroke="#d7cee9" stroke-width="2.5" stroke-linejoin="round">
                        <path class="seasonal-ghost-arm seasonal-ghost-arm-left" d="M54 92C37 94 34 68 24 73C12 79 26 118 52 121Z"/>
                        <path class="seasonal-ghost-arm seasonal-ghost-arm-right" d="M146 92C163 94 166 68 176 73C188 79 174 118 148 121Z"/>
                        <path d="M48 87C48 14 152 14 152 87V155Q152 178 135 164Q124 152 113 166Q100 183 87 166Q76 152 65 164Q48 178 48 155Z"/>
                    </g>
                    <ellipse cx="80" cy="88" rx="11" ry="16" fill="#30203f"/>
                    <ellipse cx="120" cy="88" rx="11" ry="16" fill="#30203f"/>
                    <g fill="#fff"><circle cx="77" cy="83" r="4"/><circle cx="117" cy="83" r="4"/></g>
                    <g fill="#efa8bc" opacity=".65"><ellipse cx="66" cy="108" rx="10" ry="5"/><ellipse cx="134" cy="108" rx="10" ry="5"/></g>
                    <ellipse cx="100" cy="116" rx="8" ry="11" fill="#30203f"/>
                `;
                ghost.append(greeting, character);
                layer.append(ghost);
                decorationTimer = setTimeout(() => layer.remove(), 4000);
            } else if (theme === 'new-year') {
                const celebration = document.createElement('div');
                celebration.className = 'seasonal-new-year-popup';
                const greeting = document.createElement('span');
                greeting.className = 'seasonal-new-year-greeting';
                greeting.textContent = 'Happy New Year';
                const year = document.createElement('strong');
                year.className = 'seasonal-new-year-number';
                year.textContent = String(window.MenuSeason.nextYear());
                celebration.append(greeting, year);
                layer.append(celebration);
                for (let burst = 0; burst < 6; burst++) {
                    const firework = document.createElement('div');
                    firework.className = 'seasonal-firework';
                    firework.style.left = [18, 80, 12, 88, 32, 68][burst] + '%';
                    firework.style.top = [25, 22, 62, 65, 14, 82][burst] + '%';
                    firework.style.setProperty('--burst-delay', burst * .35 + 's');
                    firework.style.setProperty('--burst-color', ['#ffe095', '#c6a1ff', '#75e5d3'][burst % 3]);
                    for (let ray = 0; ray < 12; ray++) {
                        const spark = document.createElement('i');
                        spark.style.setProperty('--ray-angle', ray * 30 + 'deg');
                        firework.append(spark);
                    }
                    layer.append(firework);
                }
                decorationTimer = setTimeout(() => layer.remove(), 4000);
            } else {
                const count = theme === 'christmas' ? 22 : 10;
                for (let i=0;i<count;i++) {
                    const mark=document.createElement('span');mark.className='seasonal-mark';
                    mark.textContent=theme==='christmas'?'❄':theme==='halloween'?(i%2?'🦇':'🎃'):'✦';
                    mark.style.left=((i*47)%100)+'%';mark.style.animationDelay=-(i%8)+'s';
                    mark.style.animationDuration=(6+i%5)+'s';mark.style.fontSize=(14+i%4*4)+'px';
                    layer.append(mark);
                }
            }
            document.body.append(layer);
        },
        decorate(card, selected = []) {
            const valid = selected.filter(id => Object.hasOwn(labels,id));
            if (!valid.length) return;
            const holidays = ['christmas','ramadan','halloween','new-year'];
            const ordered = [...valid.filter(id => holidays.includes(id)), ...valid.filter(id => !holidays.includes(id))];
            const ribbons = document.createElement('div');ribbons.className='item-ribbons';
            if (ordered.length>2) ribbons.classList.add('is-crowded');
            card.append(ribbons);
            ordered.forEach((id,index) => {
                const ribbon=document.createElement('span');ribbon.className='item-ribbon badge-'+id;ribbon.textContent=labels[id];
                ribbon.style.setProperty('--ribbon-index',String(index));ribbons.append(ribbon);
            });
            card.classList.add('has-badges','holiday-'+ordered[0]);
            if (valid.includes('christmas')) {
                card.classList.add('has-christmas-lights');
                const lights=document.createElement('div');lights.className='item-christmas-lights';lights.setAttribute('aria-hidden','true');
                for (const edge of ['top','bottom','left','right']) {
                    const count=edge==='top'||edge==='bottom'?7:5;
                    for (let index=0;index<count;index++) {
                        const bulb=document.createElement('i');bulb.className='item-light light-'+edge+(index%2===0?' light-inward':'');
                        bulb.style.setProperty('--position',((index+1)/(count+1)*100)+'%');
                        bulb.style.setProperty('--bulb-color',['#ff5252','#ffd65b','#63df8e','#7ecaff'][index%4]);
                        bulb.style.setProperty('--twinkle-delay',-(index%4)*.6+'s');lights.append(bulb);
                    }
                }
                card.append(lights);
            }
            const artwork = {
                halloween: '<path d="M32 19c-3-7-1-11 4-13" fill="none" stroke="#52723b" stroke-width="5" stroke-linecap="round"/><ellipse cx="21" cy="37" rx="15" ry="20" fill="#dc681c"/><ellipse cx="43" cy="37" rx="15" ry="20" fill="#e87722"/><ellipse cx="32" cy="37" rx="14" ry="21" fill="#ff9934" stroke="#d96b1f" stroke-width="2"/>',
                ramadan: '<circle cx="32" cy="8" r="4" fill="none" stroke="#ad7c29" stroke-width="2.5"/><path d="m32 12-13 12h26Z" fill="#c7993e" stroke="#88601f" stroke-width="1.5"/><path d="M20 26h24l-3 23H23Z" fill="#ffdd85" stroke="#ad7c29" stroke-width="2"/><path d="M26 27v21m12-21v21" stroke="#c7993e" stroke-width="2"/><path d="M32 31c-5 6-6 9-3 12 3 3 8-1 6-5l-2-4Z" fill="#ffac37"/><path d="M19 24h26m-23 27h20M26 56h12" fill="none" stroke="#88601f" stroke-width="3" stroke-linecap="round"/><path d="m23 51 3 5h12l3-5Z" fill="#c7993e"/>',
                'new-year': '<g fill="none" stroke="#e5b94e" stroke-width="3" stroke-linecap="round"><path d="M31 8v9m0 26v10M8 31h9m26 0h10M15 15l7 7m18 18 7 7M15 47l7-7m18-18 7-7"/></g><path d="m31 20 3.5 7.5L43 31l-8.5 3.5L31 43l-3.5-8.5L19 31l8.5-3.5Z" fill="#f6d679"/><circle cx="52" cy="12" r="3" fill="#bd8bd8"/><circle cx="10" cy="53" r="3" fill="#bd8bd8"/>'
            };
            const ornaments=document.createElement('div');ornaments.className='item-ornaments';ornaments.setAttribute('aria-hidden','true');
            for (const id of valid.filter(id=>Object.hasOwn(artwork,id))) {
                const icon=document.createElementNS('http://www.w3.org/2000/svg','svg');
                icon.setAttribute('viewBox','0 0 64 64');icon.setAttribute('focusable','false');icon.setAttribute('class','item-ornament ornament-'+id);
                icon.innerHTML=artwork[id];
                if (id==='halloween') {
                    card.classList.add('has-halloween-pumpkin','has-item-ornaments');
                    const pair=document.createElement('div');pair.className='item-pumpkin-pair';pair.setAttribute('aria-hidden','true');
                    const original=icon.cloneNode(true);original.classList.add('pumpkin-original');
                    original.innerHTML+='<path d="m17 34 10-6-2 10Zm30 0-10-6 2 10ZM20 43l7 3 5-3 5 3 7-3-5 9H25Z" fill="#573020"/>';
                    pair.append(original,icon);card.append(pair);
                } else if (id==='ramadan') {
                    const hanging=document.createElement('div');hanging.className='item-hanging-lantern';hanging.setAttribute('aria-hidden','true');
                    hanging.append(icon);card.append(hanging);
                } else if (id==='new-year') {
                    const emblem=document.createElement('div');emblem.className='item-new-year-emblem';
                    const year=window.MenuSeason.nextYear();emblem.setAttribute('aria-label','New Year '+year);
                    const caption=document.createElement('span');caption.className='year-caption';caption.textContent='Welcome';
                    const number=document.createElement('strong');number.className='year-number';number.textContent=String(year);
                    icon.setAttribute('aria-hidden','true');emblem.append(icon,caption,number);card.append(emblem);
                } else ornaments.append(icon);
            }
            if (ornaments.children.length) {card.classList.add('has-item-ornaments');card.append(ornaments);}
        }
    };
})();
