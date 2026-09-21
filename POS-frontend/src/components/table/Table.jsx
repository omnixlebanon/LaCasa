import './Table.css';

function Table({ data }) {
    return (
        <div className={`tableWrapper ${data.type} ${data.status}`}>
            

            <div className={`seatsContainer seat-count-${data.seats}`}>
                {Array(data.seats).fill(null).map((_, index) => (
                    <span key={index} className="seatBox"></span>
                ))}
            </div>

            <button className={`tableCard ${data.status} ${data.isSelected ? 'selected' : ''}`}>
                <h3>{data.name}</h3>
                <span>{data.status.charAt(0).toUpperCase() + data.status.slice(1)}</span>
            </button>
            
        </div>
    );
}

export default Table;
