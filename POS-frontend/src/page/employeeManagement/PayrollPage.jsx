import {useState} from 'react';
import PositionSalaries from './PositionSalaries.jsx';
import {Banknote} from 'lucide-react';
import EmployeePayroll from './EmployeePayroll.jsx';
import EmployeeNavigation from './EmployeeNavigation.jsx';
import './EmployeeManagement.css';
export default function PayrollPage(){const [revision,setRevision]=useState(0);return <main className="main-area employee-page"><div className="head-area"><div className="PageTitle"><Banknote/><h2 className="PageName">Salaries &amp; Payroll</h2></div></div><EmployeeNavigation/><PositionSalaries onChanged={()=>setRevision(value=>value+1)}/><EmployeePayroll refreshKey={revision}/></main>;}
