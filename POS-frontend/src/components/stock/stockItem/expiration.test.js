import test from 'node:test';
import assert from 'node:assert/strict';
import { expirationDate, expirationStatus } from './expiration.js';

test('date-only and timestamp values preserve the expiration calendar date', () => {
    for (const value of ['2026-09-10', '2026-09-10T00:00:00.000Z', '2026-09-10 00:00:00', '2026-09-10T00:00:00+03:00']) {
        assert.equal(expirationDate(value), '2026-09-10');
    }
    for (const value of [null, '', 'invalid', '0000-00-00', '2026-02-30']) {
        assert.equal(expirationDate(value), '');
        assert.equal(expirationStatus(value).label, 'N/A');
    }
});

test('expiration labels handle today, singular days, warning thresholds, and distant dates', () => {
    const today = new Date(2026, 8, 10, 23, 59);
    assert.equal(expirationStatus('2026-09-09', today).label, 'Expired');
    assert.equal(expirationStatus('2026-09-10', today).label, 'Expires today');
    assert.equal(expirationStatus('2026-09-11T00:00:00Z', today).label, '1 day left');
    assert.equal(expirationStatus('2026-09-14', today).className, 'exDate_bad');
    assert.equal(expirationStatus('2026-09-15', today).className, 'exDate_good');
    assert.equal(expirationStatus('2026-10-09', today).label, '29 days left');
    assert.equal(expirationStatus('2026-10-09', today).showDate, undefined);
    assert.equal(expirationStatus('2026-10-10T00:00:00Z', today).showDate, true);
    assert.equal(expirationStatus('2026-10-10T00:00:00Z', today).label, undefined);
});

test('calendar day counts stay correct across month, leap year, and daylight-saving boundaries', () => {
    assert.equal(expirationStatus('2028-03-01', new Date(2028, 1, 28, 23)).label, '2 days left');
    assert.equal(expirationStatus('2026-03-09', new Date(2026, 2, 7, 23)).label, '2 days left');
});
