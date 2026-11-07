const relevant = new Set(['orders_history','products','product_items','items','users','business_expenses','expense_recurrences','employee_salary_rates','position_salary_defaults','employee_payroll_payments','payroll_payment_events','salary_deductions','shifts','recurring_shifts','shift_checkins','workflow_requests']);
export function salesRefreshKey(manifest, revision, state, day) {
 const server=manifest?.revision===revision
  ? [manifest.baseline,...Object.entries(manifest.tables||{}).filter(([table])=>relevant.has(table)||table==='*').sort(([a],[b])=>a.localeCompare(b))]
  : revision;
 const local=(state.queue||[]).filter(op=>/^\/api\/(checkout|history|products|items|stock|expenses|employees|shifts|recurring-shifts|management)(\/|$)/.test(op.url));
 return JSON.stringify([day,server,local]);
}
