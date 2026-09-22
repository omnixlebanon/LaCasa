import LoadingState from '../../components/LoadingState.jsx';
import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Armchair, Settings, Trash2 } from "lucide-react";
import './Tables.css';
import Table from '../../components/table/Table.jsx';
import api from '/src/api.js'; // Imported standard api file

const SEAT_CONFIG = {
  1: { type: "barSeat", label: "Bar Seat (1)" },
  2: { type: "twoSeat", label: "2 Seats" },
  3: { type: "threeSeat", label: "3 Seats" },
  4: { type: "fourSeat", label: "4 Seats" },
  5: { type: "fiveSeat", label: "5 Seats" },
  6: { type: "sixSeat", label: "6 Seats" },
  7: { type: "sevenSeat", label: "7 Seats" },
  8: { type: "eightSeat", label: "8 Seats" }
};

// Reindexes names and ensures correct floor relations are preserved globally
function reindexGlobalTables(floorsArray) {
  let globalCounter = 1;
  
  return floorsArray.map((floor) => {
    const updatedTables = floor.tables.map((table) => {
      const updatedTable = {
        ...table,
        t_name: `T${globalCounter}`,
        floor_id: floor.floor_id
      };
      globalCounter++;
      return updatedTable;
    });

    return {
      ...floor,
      tables: updatedTables
    };
  });
}

function Tables() {
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const navigate = useNavigate();
  const [activeFilter, setActiveFilter] = useState("all");
  const [isPopupOpen, setIsPopupOpen] = useState(false);
  const [selectedTableId, setSelectedTableId] = useState("");
  const [floors, setFloors] = useState([]);
  const [tempFloors, setTempFloors] = useState([]);

  const fetchLayout = async () => {
    setLoading(true);
    setLoadError('');
    try {
      const response = await api.get('/api/seating/floors');
      setFloors(response.data);
    } catch (err) {
      console.error("Error fetching restaurant layout: ", err);
      setLoadError('Could not load tables. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLayout();
  }, []);

  const handleTableClick = async (table) => {
    try {
      await api.put(`/api/seating/tables/${table.t_id}/status`, { t_status: "occupied" });

      const updatedFloors = floors.map(floor => {
        if (floor.floor_id !== table.floor_id) return floor;
    
        return {
          ...floor,
          tables: floor.tables.map(t => {
            if (t.t_id === table.t_id) {
              return { ...t, t_status: "occupied" };
            }
            return t;
          })
        };
      });
      setFloors(updatedFloors);
 
      const savedOrders = localStorage.getItem('pos_orders');
      let currentOrders = savedOrders ? JSON.parse(savedOrders) : [];
      const savedNext = localStorage.getItem('pos_nextOrder');
      let nextOrderValue = savedNext ? parseInt(savedNext, 10) : 1;
      let existingOrder = currentOrders.find(order => order.label === table.t_name);
    
      if (existingOrder) {
        currentOrders = currentOrders.map(order => order.id === existingOrder.id
          ? { ...order, tableId: table.t_id, tableName: table.t_name, orderType: order.orderType || 'dine-in' }
          : order);
        localStorage.setItem('pos_orders', JSON.stringify(currentOrders));
        localStorage.setItem('pos_activeOrderId', existingOrder.id.toString());
      } else {
        const newOrderId = nextOrderValue;
        currentOrders.push({
          id: newOrderId,
          label: table.t_name,
          tableId: table.t_id,
          tableName: table.t_name,
          orderType: 'dine-in',
          items: []
        });
    
        localStorage.setItem('pos_orders', JSON.stringify(currentOrders));
        localStorage.setItem('pos_nextOrder', (nextOrderValue + 1).toString());
        localStorage.setItem('pos_activeOrderId', newOrderId.toString());
      }
      navigate('/');
    } catch (err) {
      console.error("Error updating table click status on server:", err);
    }
  };

  const handleOpenSettings = () => {
    setTempFloors(JSON.parse(JSON.stringify(floors)));
    setSelectedTableId("");
    setIsPopupOpen(true);
  };

  const handleSave = async () => {
    const finalFloors = reindexGlobalTables(tempFloors);
    try {
      await api.post('/api/seating/layout', { floors: finalFloors });
      setFloors(finalFloors);
      setIsPopupOpen(false);
    } catch (err) {
      console.error("Error saving layout updates:", err);
      alert("Failed to save layout to server.");
    }
  };

  const handleAddFloor = () => {
    const nextId = -Date.now();
    const nextNum = tempFloors.length + 1;
    setTempFloors([
      ...tempFloors,
      {
        floor_id: nextId,
        floor_name: `Floor ${nextNum}`,
        tables: []
      }
    ]);
  };

  const handleRemoveFloor = (e, floorId) => {
    e.preventDefault();
    const floorBeingDeleted = tempFloors.find(f => f.floor_id === floorId);
    const holdsSelectedTable = floorBeingDeleted?.tables.some(t => t.t_id === selectedTableId);

    const filteredFloors = tempFloors.filter(f => f.floor_id !== floorId);
    const reindexed = reindexGlobalTables(filteredFloors);
    setTempFloors(reindexed);

    if (holdsSelectedTable) {
      setSelectedTableId("");
    }
  };

  const handleAddTable = (e, floorId) => {
    e.preventDefault();
    const nextId = -Math.floor(Math.random() * 1000000);

    const withNewTable = tempFloors.map((floor) => {
      if (floor.floor_id === floorId) {
        return {
          ...floor,
          tables: [
            ...floor.tables,
            {
              t_id: nextId,
              t_name: "",
              t_status: "available",
              t_type: "fourSeat",
              t_seats: 4,
              floor_id: floorId
            }
          ]
        };
      }
      return floor;
    });

    const reindexed = reindexGlobalTables(withNewTable);
    setTempFloors(reindexed);
    setSelectedTableId(nextId);
  };

  const handleRemoveTable = (floorId, tableId) => {
    const withRemovedTable = tempFloors.map((floor) => {
      if (floor.floor_id === floorId) {
        return {
          ...floor,
          tables: floor.tables.filter(t => t.t_id !== tableId)
        };
      }
      return floor;
    });

    const reindexed = reindexGlobalTables(withRemovedTable);
    setTempFloors(reindexed);
    setSelectedTableId("");
  };

  const handleUpdateTableSeats = (floorId, tableId, seatsValue) => {
    const seats = Number(seatsValue);
    const type = SEAT_CONFIG[seats]?.type || "fourSeat";

    setTempFloors(tempFloors.map(f => {
      if (f.floor_id === floorId) {
        return {
          ...f,
          tables: f.tables.map(t => t.t_id === tableId ? { ...t, t_seats: seats, t_type: type } : t)
        };
      }
      return f;
    }));
  };

  const handleUpdateTableStatus = (floorId, tableId, status) => {
    setTempFloors(tempFloors.map(f => {
      if (f.floor_id === floorId) {
        return {
          ...f,
          tables: f.tables.map(t => t.t_id === tableId ? { ...t, t_status: status } : t)
        };
      }
      return f;
    }));
  };

  const handleMoveTableFloor = (currentFloorId, tableId, targetFloorId) => {
    const numTargetFloorId = Number(targetFloorId);
    if (currentFloorId === numTargetFloorId) return;

    let tableToMove = null;

    const removedFromCurrent = tempFloors.map((floor) => {
      if (floor.floor_id === currentFloorId) {
        tableToMove = floor.tables.find(t => t.t_id === tableId);
        return {
          ...floor,
          tables: floor.tables.filter(t => t.t_id !== tableId)
        };
      }
      return floor;
    });

    if (!tableToMove) return;

    const updatedTable = { ...tableToMove, floor_id: numTargetFloorId };

    const insertedToTarget = removedFromCurrent.map((floor) => {
      if (floor.floor_id === numTargetFloorId) {
        return {
          ...floor,
          tables: [...floor.tables, updatedTable]
        };
      }
      return floor;
    });

    const reindexed = reindexGlobalTables(insertedToTarget);
    setTempFloors(reindexed);
  };

  const handleUpdateFloorName = (floorId, name) => {
    setTempFloors(tempFloors.map(f => f.floor_id === floorId ? { ...f, floor_name: name } : f));
  };

  const filteredFloors = floors.map(floor => {
    const matchingTables = floor.tables.filter(table => {
      if (activeFilter === "all") return true;
      return table.t_status === activeFilter;
    });
    return {
      ...floor,
      tables: matchingTables
    };
  }).filter(floor => floor.tables.length > 0 || activeFilter === "all");

  if (loading || loadError) return <LoadingState page label="Loading tables..." error={loadError} onRetry={fetchLayout} />;

  return (
    <div>
      <div className="main-area">
        <div className="head-area">
          <div className="top-left">
            <div className="PageTitle">
              <Armchair />
              <h2 className="PageName">Tables</h2>
            </div>
            <div className="tablesFilter">
              <button
                className={`tableFilterBtn btn-all ${activeFilter === "all" ? "active" : ""}`}
                onClick={() => setActiveFilter("all")}
              >All</button>
              <button
                className={`tableFilterBtn btn-available ${activeFilter === "available" ? "active" : ""}`}
                onClick={() => setActiveFilter('available')}
              >Available</button>
              <button
                className={`tableFilterBtn btn-occupied ${activeFilter === "occupied" ? "active" : ""}`}
                onClick={() => setActiveFilter('occupied')}
              >Occupied</button>
            </div>
          </div>
          <button className="layoutSettings" onClick={handleOpenSettings}>
            <Settings />
            <p>Layout</p>
          </button>
        </div>

        <div className="tablesDisplayArea">
          {filteredFloors.map((floor) => (
            <div key={floor.floor_id} className="floorSection">
              <h3 className="floorTitle">{floor.floor_name}</h3>
              <hr />
              <div className="floorTablesGrid">
                {floor.tables.map((table) => (
                  <div 
                    key={table.t_id} 
                    onClick={() => handleTableClick(table)}
                    style={{ cursor: "pointer" }}
                  >
                    <Table
                      data={{
                        id: table.t_id,
                        name: table.t_name,
                        type: table.t_type,
                        seats: table.t_seats,
                        status: table.t_status,
                        className: `${table.t_type} ${table.t_status} seat-count-${table.t_seats}`
                      }}
                    />
                  </div>
                ))}
              </div>
            </div>
          ))}
          {filteredFloors.length === 0 && (
            <p className="no-tables-msg">No tables found matching this filter.</p>
          )}
        </div>
      </div>

      {isPopupOpen && (
        <div className="layoutPopup">
          <div className="layoutPopup-card">
            <div className="layoutPopup-header">
              <h2>Layout Settings</h2>
              <button type="button" className="close-btn" onClick={() => setIsPopupOpen(false)}>&times;</button>
            </div>
            <div className="layoutPopup-body">
              <div className="layout-actions">
                <button type="button" className="add-floor-btn" onClick={handleAddFloor}>
                  + Add New Floor
                </button>
              </div>

              <div className="floors-setup-container">
                {tempFloors.map((floor) => (
                  <div key={floor.floor_id} className="floor-setup-card">
                    <div className="floor-setup-header">
                      <input
                        type="text"
                        value={floor.floor_name}
                        onChange={(e) => handleUpdateFloorName(floor.floor_id, e.target.value)}
                        className="floor-name-input"
                        placeholder="Floor Name"
                      />
                      <button
                        type="button"
                        className="remove-floor-btn"
                        onClick={(e) => handleRemoveFloor(e, floor.floor_id)}
                        title="Delete Floor"
                      >
                        <Trash2 /> <p>Delete Floor</p>
                      </button>
                    </div>

                    <div className="tables-setup-selection">
                      <label className="select-table-label">Select Table: </label>
                      <select
                        className="select-table-dropdown"
                        value={floor.tables.some(t => t.t_id === selectedTableId) ? selectedTableId : ""}
                        onChange={(e) => setSelectedTableId(Number(e.target.value) || e.target.value)}
                      >
                        <option value="">-- Choose a table to configure --</option>
                        {floor.tables.map((table) => (
                          <option key={table.t_id} value={table.t_id}>
                            {table.t_name} ({table.t_status} - {table.t_seats} Seats)
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="tables-setup-list">
                      {floor.tables.map((table) => {
                        if (table.t_id !== selectedTableId) return null;

                        return (
                          <div key={table.t_id} className="table-setup-row">
                            <div className="setup-row-header">
                              <span className="table-setup-badge">{table.t_name} Config</span>
                            </div>

                            <div className="setup-controls-grid">
                              <div className="setup-control-group">
                                <label>Move to Floor: </label>
                                <select
                                  value={floor.floor_id}
                                  onChange={(e) => handleMoveTableFloor(floor.floor_id, table.t_id, e.target.value)}
                                  className="table-floor-select"
                                >
                                  {tempFloors.map((f) => (
                                    <option key={f.floor_id} value={f.floor_id}>
                                      {f.floor_name}
                                    </option>
                                  ))}
                                </select>
                              </div>

                              <div className="setup-control-group">
                                <label>Seats: </label>
                                <select
                                  value={table.t_seats}
                                  onChange={(e) => handleUpdateTableSeats(floor.floor_id, table.t_id, e.target.value)}
                                  className="table-seats-select"
                                >
                                  {Object.entries(SEAT_CONFIG).map(([seats, config]) => (
                                    <option key={seats} value={seats}>
                                      {config.label}
                                    </option>
                                  ))}
                                </select>
                              </div>

                              <div className="setup-control-group">
                                <label>Status: </label>
                                <select
                                  value={table.t_status}
                                  onChange={(e) => handleUpdateTableStatus(floor.floor_id, table.t_id, e.target.value)}
                                  className="table-status-select"
                                >
                                  <option value="available">Available</option>
                                  <option value="occupied">Occupied</option>
                                </select>
                              </div>
                              <div className="setup-control-group">
                                <button
                                  type="button"
                                  className="remove-table-btn-block"
                                  onClick={() => handleRemoveTable(floor.floor_id, table.t_id)}
                                  title="Delete Table"
                                >
                                  <Trash2 /><p> Delete Table {table.t_name} </p>
                                </button>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    <div className="add-table-container">
                      <button
                        type="button"
                        className="add-table-btn"
                        onClick={(e) => handleAddTable(e, floor.floor_id)}
                      >
                        + Add Table
                      </button>
                    </div>

                  </div>
                ))}
              </div>

              <div className="layoutPopup-footer">
                <button type="button" className="save-btn" onClick={handleSave}>Save Changes</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default Tables;
