import './StockNavBtn.css'
function StockNavBtn({data}){
    
    return(
        <button className='StockNavBtn'>
            <p>{data.name}</p>
        </button>
    )
}
export default StockNavBtn;