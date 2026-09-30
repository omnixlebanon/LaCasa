import {useAuth} from '../../context/AuthContext.jsx';
import {NavLink} from 'react-router-dom';
import {Users,Banknote} from 'lucide-react';
export default function EmployeeNavigation(){const {user}=useAuth();return <nav className="employee-page-nav" aria-label="Employee management"><NavLink to="/employees" end><Users size={18}/>Employees</NavLink>{['admin','owner','manager'].includes(user?.accessLevel)&&<NavLink to="/employees/payroll"><Banknote size={18}/>Salaries &amp; Payroll</NavLink>}</nav>;}
