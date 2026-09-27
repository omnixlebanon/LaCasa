import { LayoutList, ExternalLink } from "lucide-react";
import './MenuManag.css';

function MenuManag() {
    return <div className="main-area">
        <div className="head-area">
            <div className="PageTitle"><LayoutList /><h2>Menu Management</h2></div>
            <a className="menu-open-link" href="/menu" target="_blank" rel="noopener noreferrer"><ExternalLink size={18} />Open Menu</a>
        </div>
        <section className="menu-public-card">
            <h3>Customer menu</h3>
            <p>Open the public La Casa menu to preview what customers see. No login is required.</p>
            <p>Share this address with customers: <a href="/menu" target="_blank" rel="noopener noreferrer">{window.location.origin}/menu</a></p>
            <p className="menu-public-note">Manage names, prices, descriptions and images in Product Management. Products and categories hidden from the POS are also hidden from the menu. Open menus refresh automatically.</p>
        </section>
    </div>;
}
export default MenuManag;
