import {ResponsiveContainer,PieChart,Pie,Cell,Tooltip} from 'recharts';
import {useCurrency} from '../../../global.jsx';
import {getCostCategories} from '../utils/analytics';

export default function CostPieChart({ingredientCost,expenses,payrollCost,missingCosts}){
 const {formatPrice}=useCurrency();
 const data=getCostCategories(ingredientCost,expenses,payrollCost);
 const total=data.reduce((sum,row)=>sum+Math.round(row.value*100),0)/100;
 return <section className="sales-cost-chart bg-white border border-slate-200 rounded-2xl p-5 shadow-sm" aria-labelledby="cost-chart-title">
  <header className="sales-cost-chart-header"><div><h2 id="cost-chart-title">Costs by Category</h2><p>For the selected period</p></div>{!missingCosts&&<strong>{formatPrice(total)}</strong>}</header>
  {missingCosts?<p className="sales-cost-empty" role="status">The cost breakdown is unavailable because some orders have no saved ingredient costs.</p>:total===0?<p className="sales-cost-empty">No costs recorded for this period.</p>:<div className="sales-cost-chart-body">
   <div className="sales-pie-canvas sales-cost-canvas" role="img" aria-label="Cost distribution by category; amounts and percentages are listed alongside.">
    <ResponsiveContainer width="100%" height="100%"><PieChart accessibilityLayer={false}><Pie data={data} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius="48%" outerRadius="78%" paddingAngle={data.length>1?2:0} stroke="#fff" strokeWidth={2}>{data.map(row=><Cell key={row.name} fill={row.color}/>)}</Pie><Tooltip formatter={(value,name)=>[formatPrice(Number(value)),name]} contentStyle={{borderRadius:12,borderColor:'#dfe7e2'}}/></PieChart></ResponsiveContainer>
   </div>
   <ul className="sales-cost-legend">{data.map(row=><li key={row.name}><span className="sales-cost-category"><i style={{background:row.color}} aria-hidden="true"/>{row.name}</span><span><strong>{formatPrice(row.value)}</strong><small>{(row.value/total*100).toFixed(1)}%</small></span></li>)}</ul>
  </div>}
 </section>;
}
