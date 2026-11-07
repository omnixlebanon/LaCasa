// Complete resource replacement handles inserts, edits, cascades, and deletions.
const dependencies = {
 '/api/products/groups':['menu_groups'],
 '/api/products':['products','product_categories','menu_groups'],
 '/api/products/categories':['product_categories','menu_groups'],
 '/api/items':['items','suppliers','batches'],
 '/api/stock/categories':['item_categories'],
 '/api/stock/history':['stock_purchases','items'],
 '/api/stock/recipe':['product_items','products','items'],
 '/api/stock/summary':['items','batches'],
 '/api/products/summary':['products','product_categories','menu_groups','product_items','items','batches'],
 '/api/seating/floors':['floors','tablez'],
 '/api/history':['orders_history'],
 '/api/recurring-shifts':['recurring_shifts','users'],
 '/api/offline/batches':['batches','items'],
 '/api/open-orders':['offline_open_orders'],
 '/api/shifts':['shifts','recurring_shifts','shift_checkins','workflow_requests','users'],
 '/api/employees':['users'],
 '/api/employees/position-salaries':['position_salary_defaults'],
 '/api/employees/payroll-costs':['users','salary_deductions','payroll_payment_events','shifts','recurring_shifts','shift_checkins','workflow_requests','position_salary_defaults'],
 '/api/employees/payroll':['users','salary_deductions','payroll_payment_events','shifts','recurring_shifts','shift_checkins','workflow_requests','position_salary_defaults'],
 '/api/expenses':['business_expenses','expense_recurrences'],
 '/api/stock/expired-batches':['batches','items'],
};
const known = new Set([...Object.values(dependencies).flat(),'offline_completed_orders','pos_settings','monthly_order_sequences']);
export function canReuseResource(url, previous, manifest, revision, today) {
 const since=previous.snapshotRevision;
 if(!previous.prepared || !Number.isSafeInteger(since) || manifest?.revision!==revision || !Number.isSafeInteger(manifest?.baseline) || !manifest.tables || typeof manifest.tables!=='object' || Array.isArray(manifest.tables) || since < manifest.baseline || since>revision || previous.snapshotDay!==today)return false;
 if(Object.values(manifest.tables).some(value=>!Number.isSafeInteger(value)||value<0||value>revision))return false;
 const changed=Object.entries(manifest.tables||{}).filter(([,rev])=>rev>since).map(([table])=>table);
 // Account deletion cascades and role changes can affect every protected resource.
 if(changed.includes('users'))return false;
 if(changed.some(table=>!known.has(table)))return false;
 const tables=dependencies[url.split('?')[0]];
 return !!tables && !tables.some(table=>changed.includes(table));
}
