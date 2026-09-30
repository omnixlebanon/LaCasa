import {NavLink} from 'react-router-dom';
import {Users,Banknote} from 'lucide-react';
export default function EmployeeNavigation(){return <nav className="employee-page-nav" aria-label="Employee management"><NavLink to="/employees" end><Users size={18}/>Employees</NavLink><NavLink to="/employees/payroll"><Banknote size={18}/>Salaries &amp; Payroll</NavLink></nav>;}
