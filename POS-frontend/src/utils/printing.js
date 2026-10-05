import { useEffect, useState } from 'react';

const key = 'pos-printing-disabled';
const eventName = 'pos-printing-change';
export function isPrintingDisabled() {
    try { return localStorage.getItem(key) === 'true'; } catch { return false; }
}

// This register's preference applies to every order and survives page reloads.
export function usePrintingDisabled() {
    const [disabled, setDisabled] = useState(isPrintingDisabled);
    useEffect(() => {
        const refresh = () => setDisabled(isPrintingDisabled());
        window.addEventListener('storage', refresh);
        window.addEventListener(eventName, refresh);
        return () => {
            window.removeEventListener('storage', refresh);
            window.removeEventListener(eventName, refresh);
        };
    }, []);
    const update = value => {
        localStorage.setItem(key, String(value));
        window.dispatchEvent(new Event(eventName));
        setDisabled(value);
    };
    return [disabled, update];
}
