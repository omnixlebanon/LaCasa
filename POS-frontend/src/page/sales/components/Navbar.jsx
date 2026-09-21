import React from "react";
import { TrendingUp, Download } from "lucide-react";
export const Navbar = ({ onExportCSV, lastUpdated }) => {
	return <div className="head-area sales-page-header" title={`Last updated: ${lastUpdated.toLocaleString()}`}>
      <div className="PageTitle">
        <TrendingUp />
        <h2 className="PageName">Sales Analytics</h2>
      </div>
      <button onClick={onExportCSV} className="sales-export-button" title="Export CSV Financial Report">
        <Download />
        <span>Export CSV</span>
      </button>
    </div>;
};
