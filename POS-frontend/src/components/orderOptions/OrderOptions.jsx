import MoneyInput from '../MoneyInput.jsx';
import { useCurrency } from '../../global.jsx';
import { X } from 'lucide-react';

function OrderOptions({ optionsOpen, setOptionsOpen, optionOpen, setOptionOpen, activeOrder, handleActiveOption, handleSaveChanges }) {
    const { currencyLabel } = useCurrency();
    const submitTextOption = (event, id, field) => {
        event.preventDefault();
        handleSaveChanges(id, { [field]: new FormData(event.currentTarget).get(field) || '' });
    };

    const submitDiscount = (event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        const candidates = [
            ['usd', Number(data.get('discountUsd'))],
            ['percent', Number(data.get('discountPercent'))]
        ].filter(([, value]) => value > 0);
        if (candidates.length !== 1) return alert('Enter exactly one discount value.');
        handleSaveChanges('discount', { discount: { type: candidates[0][0], value: candidates[0][1] } });
    };

    const closeAll = () => { setOptionOpen(''); setOptionsOpen(false); };
    return <>
        {optionsOpen && <div className='editPopup'><div className='editPopup-container'>
            <div className='editPopup-head'><p>Options</p><button type="button" className='close-btn' onClick={closeAll}><X /></button></div>
            <div className='option-btns'>
                <button className={`option-btn ${activeOrder?.label && activeOrder?.tableName !== activeOrder?.label ? 'active-option' : ''}`} onClick={() => handleActiveOption('orderName')}>Order Name</button>
                <button className={`option-btn ${activeOrder?.noPrint ? 'active-option' : ''}`} onClick={() => handleActiveOption('print')}>{activeOrder?.noPrint ? 'Printing Off' : "Don't Print"}</button>
                <button className={`option-btn ${activeOrder?.kitchenNote ? 'active-option' : ''}`} onClick={() => handleActiveOption('kitchenNote')}>Kitchen Note</button>
                <button className={`option-btn ${activeOrder?.discount ? 'active-option' : ''}`} onClick={() => handleActiveOption('discount')}>Discount</button>
                <button className='option-btn' onClick={() => handleActiveOption('reset')}>Reset Order</button>
                <button className={`option-btn ${activeOrder?.orderType === 'dine-in' ? 'active-option' : ''}`} onClick={() => handleActiveOption('dineIn')}>{activeOrder?.orderType === 'dine-in' ? 'Dine In' : 'Takeout'}</button>
            </div>
        </div></div>}

        {optionOpen === 'orderName' && <div className='editPopup'><form className='editPopup-container' onSubmit={e => submitTextOption(e, 'orderName', 'name')}>
            <div className='editPopup-head'><p>Order Name</p><button type="button" className='close-btn' onClick={() => setOptionOpen('')}><X /></button></div>
            <div className='input-area'><div className='label-input'><label htmlFor='orderName'>Order Name:</label><input name='name' id='orderName' defaultValue={activeOrder?.label || ''} required /></div>
            <div className='final-btn'><button type='button' className='cancel-btn' onClick={() => setOptionOpen('')}>Cancel</button><button className='save-btn' type='submit'>Save Changes</button></div></div>
        </form></div>}

        {optionOpen === 'kitchenNote' && <div className='editPopup'><form className='editPopup-container' onSubmit={e => submitTextOption(e, 'kitchenNote', 'note')}>
            <div className='editPopup-head'><p>Kitchen Note</p><button type="button" className='close-btn' onClick={() => setOptionOpen('')}><X /></button></div>
            <div className='input-area'><div className='label-input'><label htmlFor='kitchenNote'>Kitchen Note:</label><input name='note' id='kitchenNote' defaultValue={activeOrder?.kitchenNote || ''} /></div>
            <div className='final-btn'><button type='button' className='cancel-btn' onClick={() => setOptionOpen('')}>Cancel</button><button className='save-btn' type='submit'>Save Changes</button></div></div>
        </form></div>}

        {optionOpen === 'discount' && <div className='editPopup'><form className='editPopup-container' onSubmit={submitDiscount}>
            <div className='editPopup-head'><p>Discount</p><button type="button" className='close-btn' onClick={() => setOptionOpen('')}><X /></button></div>
            <div className='input-area'><p className='error-message'>Enter one discount type only.</p>
                <div className='label-input'><label htmlFor='discountUsd'>Discount ({currencyLabel})</label><MoneyInput name='discountUsd' id='discountUsd' type='number' min='0' step='0.01' /></div>
                <div className='label-input'><label htmlFor='discountPercent'>Discount (%)</label><input name='discountPercent' id='discountPercent' type='number' min='0' max='100' step='0.01' /></div>
                <div className='final-btn'><button type='button' className='cancel-btn' onClick={() => setOptionOpen('')}>Cancel</button><button className='save-btn' type='submit'>Apply Discount</button></div>
            </div>
        </form></div>}
    </>;
}

export default OrderOptions;
