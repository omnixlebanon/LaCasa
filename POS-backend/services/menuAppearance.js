const themes = ['default', 'christmas', 'halloween', 'ramadan', 'new-year'];
const badges = ['christmas', 'halloween', 'ramadan', 'new-year', 'limited-time', 'new', 'most-popular'];
const defaults = () => ({ theme: 'default', decorations: true, badges: {} });
function validate(value) {
    if (!value || !themes.includes(value.theme) || typeof value.decorations !== 'boolean' || !value.badges || typeof value.badges !== 'object' || Array.isArray(value.badges)) return 'Choose a valid theme and item badges.';
    const entries = Object.entries(value.badges);
    if (entries.length > 5000) return 'Too many item badges.';
    for (const [id, selected] of entries) {
        if (!/^[1-9]\d*$/.test(id) || !Number.isSafeInteger(Number(id)) || !Array.isArray(selected) || selected.length > badges.length || new Set(selected).size !== selected.length || selected.some(badge => !badges.includes(badge))) return 'Choose valid products and badges.';
    }
    return null;
}
async function read(db) {
    const [[row]] = await db.query('SELECT setting_value FROM pos_settings WHERE setting_key = ?', ['menu_appearance']);
    if (!row) return defaults();
    const value = JSON.parse(row.setting_value);
    if (validate(value)) throw new Error('Invalid saved menu appearance');
    return value;
}
module.exports = { defaults, validate, read };
