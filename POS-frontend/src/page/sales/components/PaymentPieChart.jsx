import {ResponsiveContainer,PieChart,Pie,Cell,Tooltip} from 'recharts';
import {useCurrency} from '../../../global.jsx';
import {getPaymentBreakdown} from '../utils/analytics';
import {groupSmallSlices} from '../utils/pie.js';
export default function PaymentPieChart({transactions}){
 const {formatPrice}=useCurrency();
 const data=groupSmallSlices(getPaymentBreakdown(transactions));
 const total=data.reduce((sum,row)=>sum+row.value,0);
 return <section className="sales-payment-chart" aria-label="Cash and WHISH sales">
  <p className="text-sm text-slate-500">Sales value by payment method</p>
  {!data.length?<p className="sales-cost-empty">No payments recorded for this period.</p>:<>
   <div className="sales-pie-canvas sales-cost-canvas" role="img" aria-label="Cash and WHISH sales distribution; values are listed below."><ResponsiveContainer width="100%" height="100%"><PieChart accessibilityLayer={false}><Pie data={data} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius="48%" outerRadius="78%" paddingAngle={data.length>1?2:0} stroke="#fff" strokeWidth={2}>{data.map(row=><Cell key={row.name} fill={row.color}/>)}</Pie><Tooltip formatter={(value,name)=>[formatPrice(Number(value)),name]} contentStyle={{borderRadius:12,borderColor:'#dfe7e2'}}/></PieChart></ResponsiveContainer></div>
   <ul className="sales-cost-legend" tabIndex={0} aria-label="Chart legend">{data.map(row=><li key={row.name}><span className="sales-cost-category"><i style={{background:row.color}} aria-hidden="true"/>{row.name}</span><span><strong>{formatPrice(row.value)}</strong><small>{(row.value/total*100).toFixed(1)}%</small></span></li>)}</ul>
  </>}
 </section>;
}
