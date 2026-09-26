import { useId } from 'react';

const units = [['g', 'Grams'], ['kg', 'Kilograms'], ['ml', 'Millilitres'], ['L', 'Litres'], ['pcs', 'Pieces'], ['pump', 'Pumps (5 ml each)'], ['portion', 'Prepared portions'], ['tsp', 'Teaspoons'], ['tbsp', 'Tablespoons'], ['cup', 'Cups'], ['can', 'Cans'], ['bottle', 'Bottles']];
export default function UnitInput(props) {
    const listId = useId();
    return <>
        <input {...props} type="text" list={listId} placeholder="Choose or type a unit" required maxLength={30} />
        <datalist id={listId}>{units.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</datalist>
        <small>Stock, recipe quantities and unit cost must use the same unit. 1 pump = 5 ml; changing this label does not convert existing quantities.</small>
    </>;
}
