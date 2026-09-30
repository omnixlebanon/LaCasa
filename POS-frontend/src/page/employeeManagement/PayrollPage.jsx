import {Banknote} from 'lucide-react';
import EmployeePayroll from './EmployeePayroll.jsx';
import EmployeeNavigation from './EmployeeNavigation.jsx';
import './EmployeeManagement.css';
export default function PayrollPage(){return <main className="main-area employee-page"><div className="head-area"><div className="PageTitle"><Banknote/><h2 className="PageName">Salaries &amp; Payroll</h2></div></div><EmployeeNavigation/><EmployeePayroll/></main>;}
